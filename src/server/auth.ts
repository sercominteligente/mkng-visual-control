import type { Context, Next } from "hono";
import type { AppEnv, SessionUser } from "./types";

const encoder = new TextEncoder();
const SESSION_COOKIE = "mkng_session";
const SESSION_DAYS = 7;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const iterations = 100_000;
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = base64ToBytes(parts[2]);
  const expected = base64ToBytes(parts[3]);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, expected.length * 8),
  );
  if (derived.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < derived.length; i += 1) difference |= derived[i] ^ expected[i];
  return difference === 0;
}

export async function ensureBootstrapAdmin(c: Context<AppEnv>): Promise<void> {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
  if ((row?.total ?? 0) > 0) return;

  const name = c.env.INITIAL_ADMIN_NAME?.trim();
  const email = c.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = c.env.INITIAL_ADMIN_PASSWORD;
  if (!name || !email || !password) return;

  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'super_admin', 'active')`,
  )
    .bind(crypto.randomUUID(), name, email, passwordHash)
    .run();
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const entry of header.split(";")) {
    const [key, ...rest] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<string> {
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await c.env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(sessionId, userId, tokenHash, expires.toISOString())
    .run();
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export async function destroySession(c: Context<AppEnv>): Promise<string> {
  const token = getCookie(c.req.raw, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

export async function currentUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c.req.raw, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
      LIMIT 1`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Não autenticado" }, 401);
  c.set("user", user);
  await next();
}

export function can(user: SessionUser, permission: string): boolean {
  const matrix: Record<string, string[]> = {
    super_admin: ["*"],
    admin: ["dashboard", "orders", "production", "stock", "purchases", "customers", "suppliers", "finance", "reports", "users", "settings"],
    manager: ["dashboard", "orders", "production", "stock", "purchases", "customers", "suppliers", "finance", "reports"],
    production: ["dashboard", "orders", "production", "stock"],
    stock: ["dashboard", "stock", "purchases", "orders", "suppliers", "reports"],
    finance: ["dashboard", "finance", "customers", "suppliers", "orders", "purchases", "reports"],
    viewer: ["dashboard", "orders", "production", "reports"],
  };
  const permissions = matrix[user.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(permission: string) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const user = c.get("user");
    if (!can(user, permission)) return c.json({ error: "Acesso não autorizado" }, 403);
    await next();
  };
}

export function requireSuperAdmin() {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const user = c.get("user");
    if (!user || user.role !== "super_admin") return c.json({ error: "Acesso exclusivo do Super Administrador" }, 403);
    await next();
  };
}
