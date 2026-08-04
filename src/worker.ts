import { Hono } from "hono";
import { authMiddleware, createSession, destroySession, ensureBootstrapAdmin, hashPassword, requirePermission, requireSuperAdmin, verifyPassword } from "./server/auth";
import { buildOrderPdf, buildReportPdf, type PdfBrand } from "./server/pdf";
import type { AppEnv } from "./server/types";

const app = new Hono<AppEnv>();
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function money(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function quantity(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

async function body<T = Record<string, unknown>>(c: any): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new Error("Corpo JSON inválido");
  }
}

async function audit(c: any, action: string, entityType?: string, entityId?: string, details?: unknown): Promise<void> {
  const user = c.get("user");
  await c.env.DB.prepare(
    "INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id(), user?.id ?? null, action, entityType ?? null, entityId ?? null, details ? JSON.stringify(details) : null)
    .run();
}

function code(prefix: string): string {
  const date = new Date();
  const compact = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${compact}-${suffix}`;
}

function compactToken(value: string, fallback: string): string {
  const token = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 14);
  return token || fallback;
}

function generatedMaterialSku(name: string): string {
  const suffix = id().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${compactToken(name, "MATERIAL")}-${suffix}`;
}

function materialType(value: unknown): string {
  const candidate = String(value ?? "general");
  return ["sheet", "roll", "paint", "general"].includes(candidate) ? candidate : "general";
}

function stockUnitLabel(unit: string, value: number): string {
  const labels: Record<string, [string, string]> = {
    un: ["unidade", "unidades"], chapa: ["chapa", "chapas"], m: ["metro", "metros"],
    m2: ["m²", "m²"], l: ["litro", "litros"], ml: ["mililitro", "mililitros"],
    kg: ["kg", "kg"], rolo: ["rolo", "rolos"], lata: ["lata", "latas"],
    kit: ["kit", "kits"], pct: ["pacote", "pacotes"],
  };
  const pair = labels[unit] ?? [unit || "un", unit || "un"];
  return Math.abs(value) === 1 ? pair[0] : pair[1];
}

function resolveConsumptionQuantity(data: any, material: any): { quantity: number; detail: string } {
  if (material.unit === "m2" && data.mode === "dimensions") {
    const widthMm = quantity(data.width_mm);
    const heightMm = quantity(data.height_mm);
    const pieces = Math.max(quantity(data.pieces || 1), 1);
    if (widthMm <= 0 || heightMm <= 0) throw new Error("Informe largura e altura para calcular o consumo em m²");
    const area = quantity((widthMm / 1000) * (heightMm / 1000) * pieces);
    if (area <= 0) throw new Error("A área calculada deve ser maior que zero");
    return { quantity: area, detail: `${widthMm} × ${heightMm} mm × ${pieces} peça(s) = ${area} m²` };
  }
  const value = quantity(data.quantity);
  if (value <= 0) throw new Error("A quantidade consumida deve ser maior que zero");
  const indivisibleUnits = new Set(["un", "chapa", "rolo", "lata", "kit", "pct"]);
  if (indivisibleUnits.has(String(material.unit)) && !Number.isInteger(value)) {
    throw new Error(`A unidade ${stockUnitLabel(material.unit, 2)} exige quantidade inteira`);
  }
  return { quantity: value, detail: `${value} ${stockUnitLabel(material.unit, value)}` };
}

async function attachmentKeys(env: AppEnv["Bindings"], entityType: string, entityId: string): Promise<string[]> {
  const result = await env.DB.prepare("SELECT r2_key FROM attachments WHERE entity_type=? AND entity_id=?")
    .bind(entityType, entityId).all<any>();
  return result.results.map((item) => String(item.r2_key));
}

async function deleteR2Keys(env: AppEnv["Bindings"], keys: string[]): Promise<void> {
  for (const key of keys) await env.BUCKET.delete(key);
}

async function settingsMap(env: AppEnv["Bindings"]): Promise<Record<string, string>> {
  const result = await env.DB.prepare("SELECT key,value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries(result.results.map((item) => [item.key, item.value ?? ""]));
}

function publicBranding(settings: Record<string, string>) {
  return {
    company_name: settings.company_name || "MKNG Soluções",
    department_name: settings.department_name || "Setor de Comunicação Visual",
    powered_by: settings.powered_by || "SER Comunicação Inteligente & Hakham IA",
    login_title: settings.login_title || "Setor de Comunicação Visual",
    login_subtitle: settings.login_subtitle || "MKNG Soluções",
    login_description: settings.login_description || "Sistema interno para controlar demandas, pedidos, produção, chapas, tintas, compras, consumo de materiais e resultados.",
    primary_color: settings.primary_color || "#ff6a00",
    accent_color: settings.accent_color || "#8a4dff",
    sidebar_logo_url: settings.sidebar_logo_key ? `/api/branding/sidebar?v=${encodeURIComponent(settings.sidebar_logo_key)}` : "/mkng-logo.svg",
    login_logo_url: settings.login_logo_key ? `/api/branding/login?v=${encodeURIComponent(settings.login_logo_key)}` : "",
    favicon_url: settings.favicon_key ? `/api/branding/favicon?v=${encodeURIComponent(settings.favicon_key)}` : "/favicon.svg",
  };
}

async function pdfBrand(env: AppEnv["Bindings"]): Promise<PdfBrand> {
  const settings = await settingsMap(env);
  return {
    companyName: settings.company_name || "MKNG Soluções",
    departmentName: settings.department_name || "Setor de Comunicação Visual",
    poweredBy: settings.powered_by || "SER Comunicação Inteligente & Hakham IA",
    primaryColor: settings.primary_color || "#ff6a00",
  };
}

function canViewFinancial(role: string): boolean {
  return ["super_admin", "admin", "manager", "finance"].includes(role);
}

async function loadOrderSnapshot(c: any, orderId: string): Promise<any | null> {
  const order = await c.env.DB.prepare(
    `SELECT o.*, c.name AS customer_name, u.name AS created_by_name
       FROM orders o
       LEFT JOIN customers c ON c.id=o.customer_id
       LEFT JOIN users u ON u.id=o.created_by
      WHERE o.id=?`,
  ).bind(orderId).first<any>();
  if (!order) return null;
  const [items, materials, steps] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid").bind(orderId).all<any>(),
    c.env.DB.prepare(
      `SELECT om.*,m.name AS material_name,m.unit,m.current_stock
         FROM order_materials om JOIN materials m ON m.id=om.material_id
        WHERE om.order_id=? ORDER BY m.name`,
    ).bind(orderId).all<any>(),
    c.env.DB.prepare(
      `SELECT ps.*,u.name AS assignee_name
         FROM production_steps ps LEFT JOIN users u ON u.id=ps.assignee_id
        WHERE ps.order_id=? ORDER BY ps.created_at`,
    ).bind(orderId).all<any>(),
  ]);
  return { order, items: items.results, materials: materials.results, steps: steps.results };
}

async function recordOrderEvent(c: any, orderId: string, eventType: string, label: string, status?: string | null, notes?: string | null): Promise<string> {
  const snapshot = await loadOrderSnapshot(c, orderId);
  if (!snapshot) throw new Error("Pedido não encontrado para registrar histórico");
  const eventId = id();
  await c.env.DB.prepare(
    `INSERT INTO order_events (id,order_id,event_type,label,status,notes,snapshot_json,created_by,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(eventId, orderId, eventType, label, status ?? snapshot.order.status ?? null, notes ?? null, JSON.stringify(snapshot), c.get("user")?.id ?? null, now()).run();
  return eventId;
}

function brandingSettingKey(slot: string): string | null {
  return ({ sidebar: "sidebar_logo_key", login: "login_logo_key", favicon: "favicon_key" } as Record<string, string>)[slot] ?? null;
}

function extensionForMime(mime: string): string {
  return ({ "image/svg+xml": "svg", "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "image/x-icon": "ico" } as Record<string, string>)[mime] ?? "bin";
}

app.onError((error, c) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Erro interno";
  return c.json({ error: message }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, service: "MKNG Visual Control", at: now() }));

app.get("/api/public/config", async (c) => {
  const settings = await settingsMap(c.env);
  return c.json(publicBranding(settings));
});

app.get("/api/branding/:slot", async (c) => {
  const settingKey = brandingSettingKey(c.req.param("slot"));
  if (!settingKey) return c.json({ error: "Identidade visual inválida" }, 404);
  const settings = await settingsMap(c.env);
  const objectKey = settings[settingKey];
  if (!objectKey) return c.json({ error: "Arquivo de identidade visual não configurado" }, 404);
  const object = await c.env.BUCKET.get(objectKey);
  if (!object) return c.json({ error: "Arquivo de identidade visual não encontrado" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health" || path === "/api/auth/login" || path === "/api/public/config" || path.startsWith("/api/branding/")) return next();
  return authMiddleware(c, next);
});

app.post("/api/auth/login", async (c) => {
  await ensureBootstrapAdmin(c);
  const data = await body<{ email?: string; password?: string }>(c);
  const email = data.email?.trim().toLowerCase();
  if (!email || !data.password) return c.json({ error: "Informe usuário/e-mail e senha" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, password_hash, role, status FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
  )
    .bind(email)
    .first<any>();
  if (!user || user.status !== "active" || !(await verifyPassword(data.password, user.password_hash))) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }

  const cookie = await createSession(c, user.id);
  await c.env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now(), now(), user.id)
    .run();
  return c.json(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } },
    200,
    { "Set-Cookie": cookie },
  );
});

app.post("/api/auth/logout", async (c) => {
  const cookie = await destroySession(c);
  return c.json({ ok: true }, 200, { "Set-Cookie": cookie });
});

app.get("/api/me", (c) => c.json({ user: c.get("user") }));

app.post("/api/auth/change-password", async (c) => {
  const data = await body<{ currentPassword?: string; newPassword?: string }>(c);
  if (!data.currentPassword || !data.newPassword || data.newPassword.length < 10) {
    return c.json({ error: "A nova senha deve ter pelo menos 10 caracteres" }, 400);
  }
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<any>();
  if (!row || !(await verifyPassword(data.currentPassword, row.password_hash))) {
    return c.json({ error: "Senha atual incorreta" }, 400);
  }
  const passwordHash = await hashPassword(data.newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, now(), user.id)
    .run();
  await audit(c, "change_password", "user", user.id);
  return c.json({ ok: true });
});

app.get("/api/dashboard", async (c) => {
  const [orders, production, stock, receivables, payables, recent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE status NOT IN ('completed','cancelled')").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE status IN ('production','finishing','installation')").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM materials WHERE active = 1 AND current_stock <= minimum_stock").first<any>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM receivables WHERE status = 'pending'").first<any>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payables WHERE status = 'pending'").first<any>(),
    c.env.DB.prepare(
      `SELECT o.id, o.code, o.title, o.status, o.priority, o.due_date, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT 8`,
    ).all<any>(),
  ]);
  return c.json({
    activeOrders: orders?.total ?? 0,
    inProduction: production?.total ?? 0,
    lowStock: stock?.total ?? 0,
    receivable: receivables?.total ?? 0,
    payable: payables?.total ?? 0,
    recentOrders: recent.results,
  });
});

app.use("/api/customers", requirePermission("customers"));
app.use("/api/customers/*", requirePermission("customers"));
app.get("/api/customers", async (c) => {
  const search = c.req.query("q")?.trim() ?? "";
  const result = await c.env.DB.prepare(
    `SELECT * FROM customers WHERE name LIKE ? OR COALESCE(document,'') LIKE ? OR COALESCE(contact_name,'') LIKE ? ORDER BY name`,
  )
    .bind(`%${search}%`, `%${search}%`, `%${search}%`)
    .all<any>();
  return c.json({ items: result.results });
});
app.post("/api/customers", async (c) => {
  const data = await body<any>(c);
  if (!data.name?.trim()) return c.json({ error: "Nome do cliente é obrigatório" }, 400);
  const entityId = id();
  await c.env.DB.prepare(
    `INSERT INTO customers (id,name,document,contact_name,phone,email,address,notes,status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(entityId, data.name.trim(), data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active")
    .run();
  await audit(c, "create", "customer", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/customers/:id", async (c) => {
  const data = await body<any>(c);
  await c.env.DB.prepare(
    `UPDATE customers SET name=?,document=?,contact_name=?,phone=?,email=?,address=?,notes=?,status=?,updated_at=? WHERE id=?`,
  )
    .bind(data.name, data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active", now(), c.req.param("id"))
    .run();
  await audit(c, "update", "customer", c.req.param("id"), data);
  return c.json({ ok: true });
});
app.delete("/api/customers/:id", requireSuperAdmin(), async (c) => {
  const entityId = c.req.param("id");
  const customer = await c.env.DB.prepare("SELECT id,name FROM customers WHERE id=?").bind(entityId).first<any>();
  if (!customer) return c.json({ error: "Cliente não encontrado" }, 404);
  const keys = await attachmentKeys(c.env, "customer", entityId);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM attachments WHERE entity_type='customer' AND entity_id=?").bind(entityId),
    c.env.DB.prepare("DELETE FROM customers WHERE id=?").bind(entityId),
  ]);
  await deleteR2Keys(c.env, keys);
  await audit(c, "delete_permanent", "customer", entityId, { name: customer.name });
  return c.json({ ok: true });
});

app.use("/api/suppliers", requirePermission("suppliers"));
app.use("/api/suppliers/*", requirePermission("suppliers"));
app.get("/api/suppliers", async (c) => {
  const search = c.req.query("q")?.trim() ?? "";
  const result = await c.env.DB.prepare(
    `SELECT * FROM suppliers WHERE name LIKE ? OR COALESCE(document,'') LIKE ? OR COALESCE(contact_name,'') LIKE ? ORDER BY name`,
  )
    .bind(`%${search}%`, `%${search}%`, `%${search}%`)
    .all<any>();
  return c.json({ items: result.results });
});
app.post("/api/suppliers", async (c) => {
  const data = await body<any>(c);
  if (!data.name?.trim()) return c.json({ error: "Nome do fornecedor é obrigatório" }, 400);
  const entityId = id();
  await c.env.DB.prepare(
    `INSERT INTO suppliers (id,name,document,contact_name,phone,email,address,notes,status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(entityId, data.name.trim(), data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active")
    .run();
  await audit(c, "create", "supplier", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/suppliers/:id", async (c) => {
  const data = await body<any>(c);
  await c.env.DB.prepare(
    `UPDATE suppliers SET name=?,document=?,contact_name=?,phone=?,email=?,address=?,notes=?,status=?,updated_at=? WHERE id=?`,
  )
    .bind(data.name, data.document ?? null, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.status ?? "active", now(), c.req.param("id"))
    .run();
  await audit(c, "update", "supplier", c.req.param("id"), data);
  return c.json({ ok: true });
});
app.delete("/api/suppliers/:id", requireSuperAdmin(), async (c) => {
  const entityId = c.req.param("id");
  const supplier = await c.env.DB.prepare("SELECT id,name FROM suppliers WHERE id=?").bind(entityId).first<any>();
  if (!supplier) return c.json({ error: "Fornecedor não encontrado" }, 404);
  const keys = await attachmentKeys(c.env, "supplier", entityId);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM attachments WHERE entity_type='supplier' AND entity_id=?").bind(entityId),
    c.env.DB.prepare("DELETE FROM suppliers WHERE id=?").bind(entityId),
  ]);
  await deleteR2Keys(c.env, keys);
  await audit(c, "delete_permanent", "supplier", entityId, { name: supplier.name });
  return c.json({ ok: true });
});

app.use("/api/materials", requirePermission("stock"));
app.use("/api/materials/*", requirePermission("stock"));

app.get("/api/material-categories", requirePermission("stock"), async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM material_categories ORDER BY sort_order, name").all<any>();
  return c.json({ items: result.results });
});

app.post("/api/material-categories", requirePermission("stock"), async (c) => {
  const data = await body<any>(c);
  const name = data.name?.trim();
  if (!name) return c.json({ error: "Nome da categoria é obrigatório" }, 400);
  const duplicate = await c.env.DB.prepare("SELECT id FROM material_categories WHERE name = ? COLLATE NOCASE LIMIT 1").bind(name).first<any>();
  if (duplicate) return c.json({ error: "Já existe uma categoria com esse nome" }, 409);

  const entityId = id();
  const categoryCode = data.code?.trim() ? compactToken(data.code, "CATEGORIA") : compactToken(name, "CATEGORIA");
  await c.env.DB.prepare(
    "INSERT INTO material_categories (id,name,description,code,sort_order,active) VALUES (?,?,?,?,?,?)",
  )
    .bind(entityId, name, data.description?.trim() || null, categoryCode, Number(data.sort_order ?? 0), data.active === false ? 0 : 1)
    .run();
  await audit(c, "create", "material_category", entityId, data);
  return c.json({ id: entityId }, 201);
});

app.put("/api/material-categories/:id", requirePermission("stock"), async (c) => {
  const data = await body<any>(c);
  const entityId = c.req.param("id");
  const name = data.name?.trim();
  if (!name) return c.json({ error: "Nome da categoria é obrigatório" }, 400);
  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM material_categories WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1",
  ).bind(name, entityId).first<any>();
  if (duplicate) return c.json({ error: "Já existe uma categoria com esse nome" }, 409);

  const categoryCode = data.code?.trim() ? compactToken(data.code, "CATEGORIA") : compactToken(name, "CATEGORIA");
  await c.env.DB.prepare(
    "UPDATE material_categories SET name=?,description=?,code=?,sort_order=?,active=? WHERE id=?",
  )
    .bind(name, data.description?.trim() || null, categoryCode, Number(data.sort_order ?? 0), data.active === false ? 0 : 1, entityId)
    .run();
  await audit(c, "update", "material_category", entityId, data);
  return c.json({ ok: true });
});

app.delete("/api/material-categories/:id", requireSuperAdmin(), async (c) => {
  const entityId = c.req.param("id");
  const category = await c.env.DB.prepare("SELECT id,name FROM material_categories WHERE id=?").bind(entityId).first<any>();
  if (!category) return c.json({ error: "Categoria não encontrada" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET category_id=NULL,updated_at=? WHERE category_id=?").bind(now(), entityId),
    c.env.DB.prepare("DELETE FROM material_categories WHERE id=?").bind(entityId),
  ]);
  await audit(c, "delete_permanent", "material_category", entityId, { name: category.name, materialsUnlinked: true });
  return c.json({ ok: true });
});

app.get("/api/materials", async (c) => {
  const search = c.req.query("q")?.trim() ?? "";
  const result = await c.env.DB.prepare(
    `SELECT m.*, c.name AS category_name,
      COALESCE((SELECT SUM(MAX(om.reserved_qty - om.consumed_qty, 0)) FROM order_materials om JOIN orders o ON o.id=om.order_id WHERE om.material_id=m.id AND o.status NOT IN ('completed','cancelled')),0) AS reserved_stock
     FROM materials m LEFT JOIN material_categories c ON c.id=m.category_id
     WHERE m.name LIKE ? OR COALESCE(m.sku,'') LIKE ? OR COALESCE(c.name,'') LIKE ?
     ORDER BY m.active DESC, c.sort_order, m.name`,
  )
    .bind(`%${search}%`, `%${search}%`, `%${search}%`)
    .all<any>();
  return c.json({ items: result.results });
});

app.post("/api/materials", async (c) => {
  const data = await body<any>(c);
  const name = data.name?.trim();
  if (!name) return c.json({ error: "Nome do material é obrigatório" }, 400);

  const sku = data.sku?.trim() || generatedMaterialSku(name);
  const duplicateSku = await c.env.DB.prepare("SELECT id FROM materials WHERE sku = ? COLLATE NOCASE LIMIT 1").bind(sku).first<any>();
  if (duplicateSku) return c.json({ error: "Já existe um material com esse SKU" }, 409);

  const entityId = id();
  await c.env.DB.prepare(
    `INSERT INTO materials (
      id,category_id,sku,name,description,unit,material_type,
      thickness_mm,width_mm,height_mm,grammage_gsm,length_m,volume_l,color,finish,package_size,
      current_stock,minimum_stock,average_cost,location,active
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      entityId,
      data.category_id || null,
      sku,
      name,
      data.description?.trim() || null,
      data.unit ?? "un",
      materialType(data.material_type),
      quantity(data.thickness_mm) || null,
      quantity(data.width_mm) || null,
      quantity(data.height_mm) || null,
      quantity(data.grammage_gsm) || null,
      quantity(data.length_m) || null,
      quantity(data.volume_l) || null,
      data.color?.trim() || null,
      data.finish?.trim() || null,
      data.package_size?.trim() || null,
      quantity(data.current_stock),
      quantity(data.minimum_stock),
      money(data.average_cost),
      data.location?.trim() || null,
      data.active === false ? 0 : 1,
    )
    .run();

  if (quantity(data.current_stock) !== 0) {
    await c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,notes,user_id) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(id(), entityId, "opening", quantity(data.current_stock), money(data.average_cost), money(data.current_stock) * money(data.average_cost), "Saldo inicial", c.get("user").id)
      .run();
  }
  await audit(c, "create", "material", entityId, { ...data, sku });
  return c.json({ id: entityId, sku }, 201);
});

app.put("/api/materials/:id", async (c) => {
  const data = await body<any>(c);
  const entityId = c.req.param("id");
  const name = data.name?.trim();
  if (!name) return c.json({ error: "Nome do material é obrigatório" }, 400);

  const sku = data.sku?.trim() || generatedMaterialSku(name);
  const duplicateSku = await c.env.DB.prepare(
    "SELECT id FROM materials WHERE sku = ? COLLATE NOCASE AND id <> ? LIMIT 1",
  ).bind(sku, entityId).first<any>();
  if (duplicateSku) return c.json({ error: "Já existe outro material com esse SKU" }, 409);

  await c.env.DB.prepare(
    `UPDATE materials SET
      category_id=?,sku=?,name=?,description=?,unit=?,material_type=?,
      thickness_mm=?,width_mm=?,height_mm=?,grammage_gsm=?,length_m=?,volume_l=?,color=?,finish=?,package_size=?,
      minimum_stock=?,average_cost=?,location=?,active=?,updated_at=?
     WHERE id=?`,
  )
    .bind(
      data.category_id || null,
      sku,
      name,
      data.description?.trim() || null,
      data.unit ?? "un",
      materialType(data.material_type),
      quantity(data.thickness_mm) || null,
      quantity(data.width_mm) || null,
      quantity(data.height_mm) || null,
      quantity(data.grammage_gsm) || null,
      quantity(data.length_m) || null,
      quantity(data.volume_l) || null,
      data.color?.trim() || null,
      data.finish?.trim() || null,
      data.package_size?.trim() || null,
      quantity(data.minimum_stock),
      money(data.average_cost),
      data.location?.trim() || null,
      data.active === false ? 0 : 1,
      now(),
      entityId,
    )
    .run();
  await audit(c, "update", "material", entityId, { ...data, sku });
  return c.json({ ok: true, sku });
});

app.delete("/api/materials/:id", requireSuperAdmin(), async (c) => {
  const entityId = c.req.param("id");
  const material = await c.env.DB.prepare("SELECT id,name,sku FROM materials WHERE id=?").bind(entityId).first<any>();
  if (!material) return c.json({ error: "Material não encontrado" }, 404);
  const keys = await attachmentKeys(c.env, "material", entityId);
  const affectedPurchases = await c.env.DB.prepare("SELECT DISTINCT purchase_id FROM purchase_items WHERE material_id=?").bind(entityId).all<any>();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("DELETE FROM purchase_items WHERE material_id=?").bind(entityId),
    c.env.DB.prepare("DELETE FROM order_materials WHERE material_id=?").bind(entityId),
    c.env.DB.prepare("DELETE FROM stock_movements WHERE material_id=?").bind(entityId),
    c.env.DB.prepare("DELETE FROM attachments WHERE entity_type='material' AND entity_id=?").bind(entityId),
    c.env.DB.prepare("DELETE FROM materials WHERE id=?").bind(entityId),
  ];
  for (const row of affectedPurchases.results) {
    statements.push(c.env.DB.prepare("UPDATE purchases SET total=COALESCE((SELECT SUM(total) FROM purchase_items WHERE purchase_id=?),0),updated_at=? WHERE id=?")
      .bind(row.purchase_id, now(), row.purchase_id));
  }
  await c.env.DB.batch(statements);
  await deleteR2Keys(c.env, keys);
  await audit(c, "delete_permanent", "material", entityId, { name: material.name, sku: material.sku });
  return c.json({ ok: true });
});

app.use("/api/stock", requirePermission("stock"));
app.use("/api/stock/*", requirePermission("stock"));
app.get("/api/stock/movements", async (c) => {
  const materialId = c.req.query("materialId");
  const where = materialId ? "WHERE sm.material_id = ?" : "";
  const statement = c.env.DB.prepare(
    `SELECT sm.*, m.name AS material_name, m.unit, o.code AS order_code, p.code AS purchase_code, u.name AS user_name
     FROM stock_movements sm
     JOIN materials m ON m.id=sm.material_id
     LEFT JOIN orders o ON o.id=sm.order_id
     LEFT JOIN purchases p ON p.id=sm.purchase_id
     LEFT JOIN users u ON u.id=sm.user_id
     ${where} ORDER BY sm.created_at DESC LIMIT 500`,
  );
  const result = materialId ? await statement.bind(materialId).all<any>() : await statement.all<any>();
  return c.json({ items: result.results });
});
app.post("/api/stock/adjust", async (c) => {
  const data = await body<any>(c);
  const qty = quantity(data.quantity);
  if (!data.material_id || qty === 0) return c.json({ error: "Material e quantidade são obrigatórios" }, 400);
  const material = await c.env.DB.prepare("SELECT current_stock, average_cost FROM materials WHERE id=?").bind(data.material_id).first<any>();
  if (!material) return c.json({ error: "Material não encontrado" }, 404);
  const newStock = quantity(material.current_stock) + qty;
  if (newStock < 0) return c.json({ error: "Ajuste deixaria o estoque negativo" }, 409);
  const movementId = id();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), data.material_id),
    c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,notes,user_id) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(movementId, data.material_id, qty > 0 ? "adjustment_in" : "adjustment_out", qty, money(material.average_cost), money(qty * material.average_cost), data.notes ?? "Ajuste manual", c.get("user").id),
  ]);
  await audit(c, "stock_adjust", "material", data.material_id, { quantity: qty, newStock, notes: data.notes });
  return c.json({ ok: true, newStock });
});
app.delete("/api/stock/movements/:id", requireSuperAdmin(), async (c) => {
  const movementId = c.req.param("id");
  const movement = await c.env.DB.prepare(
    `SELECT sm.*,m.current_stock,m.name AS material_name FROM stock_movements sm JOIN materials m ON m.id=sm.material_id WHERE sm.id=?`,
  ).bind(movementId).first<any>();
  if (!movement) return c.json({ error: "Movimentação não encontrada" }, 404);
  const newStock = quantity(movement.current_stock) - quantity(movement.quantity);
  if (newStock < 0) return c.json({ error: `Não é possível excluir: o saldo de ${movement.material_name} ficaria negativo` }, 409);
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), movement.material_id),
  ];
  if (movement.order_id && movement.type === "consumption") {
    statements.push(c.env.DB.prepare("UPDATE order_materials SET consumed_qty=MAX(consumed_qty-?,0) WHERE order_id=? AND material_id=?")
      .bind(Math.abs(quantity(movement.quantity)), movement.order_id, movement.material_id));
  }
  if (movement.order_id && movement.type === "return") {
    statements.push(c.env.DB.prepare("UPDATE order_materials SET returned_qty=MAX(returned_qty-?,0) WHERE order_id=? AND material_id=?")
      .bind(Math.abs(quantity(movement.quantity)), movement.order_id, movement.material_id));
  }
  statements.push(c.env.DB.prepare("DELETE FROM stock_movements WHERE id=?").bind(movementId));
  await c.env.DB.batch(statements);
  if (movement.purchase_id) {
    const remaining = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM stock_movements WHERE purchase_id=?").bind(movement.purchase_id).first<any>();
    if (Number(remaining?.total ?? 0) === 0) {
      await c.env.DB.prepare("UPDATE purchases SET status='draft',received_at=NULL,updated_at=? WHERE id=?").bind(now(), movement.purchase_id).run();
    }
  }
  await audit(c, "delete_permanent", "stock_movement", movementId, { material: movement.material_name, reversedQuantity: movement.quantity, newStock });
  return c.json({ ok: true, newStock });
});

app.use("/api/purchases", requirePermission("purchases"));
app.use("/api/purchases/*", requirePermission("purchases"));
app.get("/api/purchases", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT p.*, s.name AS supplier_name, COUNT(pi.id) AS item_count
     FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN purchase_items pi ON pi.purchase_id=p.id
     GROUP BY p.id ORDER BY p.created_at DESC`,
  ).all<any>();
  return c.json({ items: result.results });
});
app.get("/api/purchases/:id", async (c) => {
  const purchase = await c.env.DB.prepare(
    `SELECT p.*, s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?`,
  ).bind(c.req.param("id")).first<any>();
  if (!purchase) return c.json({ error: "Compra não encontrada" }, 404);
  const items = await c.env.DB.prepare(
    `SELECT pi.*, m.name AS material_name, m.unit FROM purchase_items pi JOIN materials m ON m.id=pi.material_id WHERE pi.purchase_id=?`,
  ).bind(purchase.id).all<any>();
  return c.json({ purchase, items: items.results });
});
app.post("/api/purchases", async (c) => {
  const data = await body<any>(c);
  const items = Array.isArray(data.items) ? data.items : [];
  if (!data.supplier_id || !items.length) return c.json({ error: "Fornecedor e itens são obrigatórios" }, 400);
  const purchaseId = id();
  const purchaseCode = data.code || code("CMP");
  const total = items.reduce((sum: number, item: any) => sum + quantity(item.quantity) * money(item.unit_cost), 0);
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO purchases (id,code,supplier_id,invoice_number,status,issued_at,expected_at,total,notes,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(purchaseId, purchaseCode, data.supplier_id, data.invoice_number ?? null, data.status ?? "draft", data.issued_at ?? now().slice(0, 10), data.expected_at ?? null, money(total), data.notes ?? null, c.get("user").id),
  ];
  for (const item of items) {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO purchase_items (id,purchase_id,material_id,quantity,unit_cost,total) VALUES (?,?,?,?,?,?)",
      ).bind(id(), purchaseId, item.material_id, quantity(item.quantity), money(item.unit_cost), money(quantity(item.quantity) * money(item.unit_cost))),
    );
  }
  await c.env.DB.batch(statements);
  await audit(c, "create", "purchase", purchaseId, { ...data, total });
  return c.json({ id: purchaseId, code: purchaseCode }, 201);
});
app.post("/api/purchases/:id/receive", async (c) => {
  const purchaseId = c.req.param("id");
  const purchase = await c.env.DB.prepare("SELECT * FROM purchases WHERE id=?").bind(purchaseId).first<any>();
  if (!purchase) return c.json({ error: "Compra não encontrada" }, 404);
  if (purchase.status === "received") return c.json({ error: "Compra já recebida" }, 409);
  const items = await c.env.DB.prepare("SELECT * FROM purchase_items WHERE purchase_id=?").bind(purchaseId).all<any>();
  const statements: D1PreparedStatement[] = [];
  for (const item of items.results) {
    const material = await c.env.DB.prepare("SELECT current_stock,average_cost FROM materials WHERE id=?").bind(item.material_id).first<any>();
    const oldStock = quantity(material?.current_stock);
    const receivedQty = quantity(item.quantity);
    const unitCost = money(item.unit_cost);
    const newStock = oldStock + receivedQty;
    const newAverage = newStock > 0 ? money((oldStock * money(material?.average_cost) + receivedQty * unitCost) / newStock) : unitCost;
    statements.push(
      c.env.DB.prepare("UPDATE materials SET current_stock=?,average_cost=?,updated_at=? WHERE id=?").bind(newStock, newAverage, now(), item.material_id),
      c.env.DB.prepare(
        "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,purchase_id,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(id(), item.material_id, "purchase", receivedQty, unitCost, money(receivedQty * unitCost), purchaseId, `Recebimento ${purchase.code}`, c.get("user").id),
    );
  }
  statements.push(c.env.DB.prepare("UPDATE purchases SET status='received',received_at=?,updated_at=? WHERE id=?").bind(now(), now(), purchaseId));
  await c.env.DB.batch(statements);
  await audit(c, "receive", "purchase", purchaseId);
  return c.json({ ok: true });
});
app.delete("/api/purchases/:id", requireSuperAdmin(), async (c) => {
  const purchaseId = c.req.param("id");
  const purchase = await c.env.DB.prepare("SELECT id,code,status FROM purchases WHERE id=?").bind(purchaseId).first<any>();
  if (!purchase) return c.json({ error: "Compra não encontrada" }, 404);
  const movements = await c.env.DB.prepare(
    `SELECT sm.material_id,SUM(sm.quantity) AS net_quantity,m.current_stock,m.name AS material_name
       FROM stock_movements sm JOIN materials m ON m.id=sm.material_id
      WHERE sm.purchase_id=? GROUP BY sm.material_id,m.current_stock,m.name`,
  ).bind(purchaseId).all<any>();
  const statements: D1PreparedStatement[] = [];
  for (const row of movements.results) {
    const newStock = quantity(row.current_stock) - quantity(row.net_quantity);
    if (newStock < 0) return c.json({ error: `Exclusão bloqueada: o saldo de ${row.material_name} ficaria negativo. Exclua primeiro consumos dependentes.` }, 409);
    statements.push(c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), row.material_id));
  }
  const keys = await attachmentKeys(c.env, "purchase", purchaseId);
  statements.push(
    c.env.DB.prepare("DELETE FROM stock_movements WHERE purchase_id=?").bind(purchaseId),
    c.env.DB.prepare("DELETE FROM payables WHERE purchase_id=?").bind(purchaseId),
    c.env.DB.prepare("DELETE FROM attachments WHERE entity_type='purchase' AND entity_id=?").bind(purchaseId),
    c.env.DB.prepare("DELETE FROM purchases WHERE id=?").bind(purchaseId),
  );
  await c.env.DB.batch(statements);
  await deleteR2Keys(c.env, keys);
  await audit(c, "delete_permanent", "purchase", purchaseId, { code: purchase.code, status: purchase.status });
  return c.json({ ok: true });
});


app.use("/api/orders", requirePermission("orders"));
app.use("/api/orders/*", requirePermission("orders"));
app.get("/api/orders", async (c) => {
  const status = c.req.query("status");
  const search = c.req.query("q")?.trim() ?? "";
  let sql = `SELECT o.*, c.name AS customer_name, u.name AS created_by_name
             FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.created_by
             WHERE (o.code LIKE ? OR o.title LIKE ? OR COALESCE(c.name,'') LIKE ?)`;
  const params: unknown[] = [`%${search}%`, `%${search}%`, `%${search}%`];
  if (status) { sql += " AND o.status = ?"; params.push(status); }
  sql += " ORDER BY CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, o.due_date, o.created_at DESC";
  const result = await c.env.DB.prepare(sql).bind(...params).all<any>();
  return c.json({ items: result.results });
});
app.get("/api/orders/:id", async (c) => {
  const orderId = c.req.param("id");
  const snapshot = await loadOrderSnapshot(c, orderId);
  if (!snapshot) return c.json({ error: "Pedido não encontrado" }, 404);
  const [attachments, events] = await Promise.all([
    c.env.DB.prepare("SELECT id,filename,mime_type,size_bytes,created_at FROM attachments WHERE entity_type='order' AND entity_id=? ORDER BY created_at DESC").bind(orderId).all<any>(),
    c.env.DB.prepare(
      `SELECT e.id,e.event_type,e.label,e.status,e.notes,e.created_at,u.name AS user_name
         FROM order_events e LEFT JOIN users u ON u.id=e.created_by
        WHERE e.order_id=? ORDER BY e.created_at DESC`,
    ).bind(orderId).all<any>(),
  ]);
  const user = c.get("user");
  return c.json({
    ...snapshot,
    attachments: attachments.results,
    events: events.results,
    permissions: {
      canDeletePermanent: user.role === "super_admin",
      canCancel: ["super_admin", "admin", "manager"].includes(user.role) && !["cancelled", "completed"].includes(snapshot.order.status),
      canViewFinancial: canViewFinancial(user.role),
    },
  });
});

app.get("/api/orders/:id/pdf", async (c) => {
  const snapshot = await loadOrderSnapshot(c, c.req.param("id"));
  if (!snapshot) return c.json({ error: "Pedido não encontrado" }, 404);
  const pdf = await buildOrderPdf({
    snapshot,
    brand: await pdfBrand(c.env),
    includeFinancial: canViewFinancial(c.get("user").role),
  });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${snapshot.order.code || "pedido"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

app.get("/api/orders/:id/events/:eventId/pdf", async (c) => {
  const event = await c.env.DB.prepare(
    `SELECT e.*,u.name AS user_name FROM order_events e LEFT JOIN users u ON u.id=e.created_by WHERE e.id=? AND e.order_id=?`,
  ).bind(c.req.param("eventId"), c.req.param("id")).first<any>();
  if (!event) return c.json({ error: "Movimentação não encontrada" }, 404);
  let snapshot: any;
  try { snapshot = JSON.parse(event.snapshot_json); } catch { return c.json({ error: "Snapshot da movimentação inválido" }, 500); }
  const pdf = await buildOrderPdf({
    snapshot,
    event,
    brand: await pdfBrand(c.env),
    includeFinancial: canViewFinancial(c.get("user").role),
  });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${snapshot.order?.code || "pedido"}-${event.event_type}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

app.post("/api/orders", async (c) => {
  const data = await body<any>(c);
  if (!data.title?.trim()) return c.json({ error: "Título do pedido é obrigatório" }, 400);
  const orderId = id();
  const orderCode = data.code || code("OS");
  const items = Array.isArray(data.items) ? data.items : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const total = items.reduce((sum: number, item: any) => sum + quantity(item.quantity) * money(item.unit_price), money(data.total_price));
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO orders (id,code,customer_id,title,description,priority,status,due_date,total_price,notes,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(orderId, orderCode, data.customer_id ?? null, data.title.trim(), data.description ?? null, data.priority ?? "normal", data.status ?? "draft", data.due_date ?? null, money(total), data.notes ?? null, c.get("user").id),
  ];
  for (const item of items) {
    statements.push(c.env.DB.prepare("INSERT INTO order_items (id,order_id,description,quantity,unit_price,total_price) VALUES (?,?,?,?,?,?)")
      .bind(id(), orderId, item.description, quantity(item.quantity), money(item.unit_price), money(quantity(item.quantity) * money(item.unit_price))));
  }
  for (const material of materials) {
    statements.push(c.env.DB.prepare("INSERT INTO order_materials (id,order_id,material_id,planned_qty,reserved_qty,notes) VALUES (?,?,?,?,?,?)")
      .bind(id(), orderId, material.material_id, quantity(material.planned_qty), quantity(material.reserved_qty ?? material.planned_qty), material.notes ?? null));
  }
  statements.push(c.env.DB.prepare("INSERT INTO production_steps (id,order_id,stage,status) VALUES (?,?,?,?)").bind(id(), orderId, "briefing", "pending"));
  await c.env.DB.batch(statements);
  await audit(c, "create", "order", orderId, data);
  await recordOrderEvent(c, orderId, "created", "Pedido criado", data.status ?? "draft", data.notes ?? null);
  return c.json({ id: orderId, code: orderCode }, 201);
});
app.put("/api/orders/:id", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  if (data.status === "cancelled") return c.json({ error: "Use a ação Cancelar pedido e informe o motivo" }, 400);
  const previous = await c.env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(orderId).first<any>();
  if (!previous) return c.json({ error: "Pedido não encontrado" }, 404);
  await c.env.DB.prepare(
    `UPDATE orders SET customer_id=?,title=?,description=?,priority=?,status=?,due_date=?,total_price=?,notes=?,updated_at=? WHERE id=?`,
  ).bind(data.customer_id ?? null, data.title, data.description ?? null, data.priority ?? "normal", data.status ?? "draft", data.due_date ?? null, money(data.total_price), data.notes ?? null, now(), orderId).run();
  await audit(c, "update", "order", orderId, data);
  await recordOrderEvent(c, orderId, previous.status === data.status ? "updated" : "status_changed", previous.status === data.status ? "Dados do pedido atualizados" : `Status alterado para ${data.status}`, data.status ?? "draft", data.notes ?? null);
  return c.json({ ok: true });
});
app.post("/api/orders/:id/materials", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  await c.env.DB.prepare(
    `INSERT INTO order_materials (id,order_id,material_id,planned_qty,reserved_qty,notes)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(order_id,material_id) DO UPDATE SET planned_qty=excluded.planned_qty,reserved_qty=excluded.reserved_qty,notes=excluded.notes`,
  ).bind(id(), orderId, data.material_id, quantity(data.planned_qty), quantity(data.reserved_qty ?? data.planned_qty), data.notes ?? null).run();
  await audit(c, "plan_material", "order", orderId, data);
  await recordOrderEvent(c, orderId, "material_planned", "Material planejado ou reservado", null, data.notes ?? null);
  return c.json({ ok: true });
});
app.post("/api/orders/:id/consume", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  if (!data.material_id) return c.json({ error: "Selecione o material" }, 400);
  const order = await c.env.DB.prepare("SELECT code,status FROM orders WHERE id=?").bind(orderId).first<any>();
  const material = await c.env.DB.prepare("SELECT current_stock,average_cost,name,unit FROM materials WHERE id=?").bind(data.material_id).first<any>();
  if (!order || !material) return c.json({ error: "Pedido ou material não encontrado" }, 404);
  if (["cancelled", "completed"].includes(order.status)) return c.json({ error: "Não é possível registrar consumo em pedido cancelado ou concluído" }, 409);
  let resolved: { quantity: number; detail: string };
  try { resolved = resolveConsumptionQuantity(data, material); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : "Quantidade inválida" }, 400); }
  const qty = resolved.quantity;
  const currentStock = quantity(material.current_stock);
  if (currentStock < qty) return c.json({ error: `Estoque insuficiente de ${material.name}. Disponível: ${currentStock} ${stockUnitLabel(material.unit, currentStock)}` }, 409);
  const newStock = quantity(currentStock - qty);
  const note = data.notes?.trim() || `Consumo confirmado no ${order.code}`;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), data.material_id),
    c.env.DB.prepare(`INSERT INTO order_materials (id,order_id,material_id,planned_qty,reserved_qty,consumed_qty) VALUES (?,?,?,?,?,?) ON CONFLICT(order_id,material_id) DO UPDATE SET consumed_qty=order_materials.consumed_qty+excluded.consumed_qty`).bind(id(), orderId, data.material_id, 0, 0, qty),
    c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,order_id,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id(), data.material_id, "consumption", -qty, money(material.average_cost), -money(qty * material.average_cost), orderId, `${note} | ${resolved.detail}`, c.get("user").id),
  ]);
  await audit(c, "consume_material", "order", orderId, { material_id: data.material_id, quantity: qty, unit: material.unit, newStock, mode: data.mode || "quantity" });
  await recordOrderEvent(c, orderId, "material_consumed", `Consumo confirmado: ${material.name}`, order.status, `${resolved.detail}. Saldo restante: ${newStock} ${stockUnitLabel(material.unit, newStock)}. ${data.notes ?? ""}`.trim());
  return c.json({ ok: true, quantity: qty, unit: material.unit, newStock });
});

app.post("/api/orders/:id/return", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  const qty = quantity(data.quantity);
  if (!data.material_id || qty <= 0) return c.json({ error: "Material e quantidade são obrigatórios" }, 400);
  const material = await c.env.DB.prepare("SELECT current_stock,average_cost,name FROM materials WHERE id=?").bind(data.material_id).first<any>();
  const relation = await c.env.DB.prepare("SELECT consumed_qty,returned_qty FROM order_materials WHERE order_id=? AND material_id=?").bind(orderId, data.material_id).first<any>();
  const availableReturn = quantity(relation?.consumed_qty) - quantity(relation?.returned_qty);
  if (qty > availableReturn) return c.json({ error: "Quantidade devolvida excede o consumo confirmado" }, 409);
  const newStock = quantity(material.current_stock) + qty;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), data.material_id),
    c.env.DB.prepare("UPDATE order_materials SET returned_qty=returned_qty+? WHERE order_id=? AND material_id=?").bind(qty, orderId, data.material_id),
    c.env.DB.prepare(
      "INSERT INTO stock_movements (id,material_id,type,quantity,unit_cost,total_cost,order_id,notes,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id(), data.material_id, "return", qty, money(material.average_cost), money(qty * material.average_cost), orderId, data.notes ?? "Devolução de sobra", c.get("user").id),
  ]);
  await audit(c, "return_material", "order", orderId, { material_id: data.material_id, quantity: qty, newStock });
  await recordOrderEvent(c, orderId, "material_returned", `Material devolvido: ${material.name}`, null, `${qty} unidade(s). ${data.notes ?? ""}`.trim());
  return c.json({ ok: true, newStock });
});
app.post("/api/orders/:id/stage", async (c) => {
  const data = await body<any>(c);
  const orderId = c.req.param("id");
  const stage = String(data.stage ?? "production");
  const statusMap: Record<string, string> = {
    briefing: "approved", design: "approved", printing: "production", finishing: "finishing", installation: "installation", completed: "completed",
  };
  const orderStatus = statusMap[stage] ?? "production";
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE production_steps SET status='completed',completed_at=? WHERE order_id=? AND status='in_progress'").bind(now(), orderId),
    c.env.DB.prepare("INSERT INTO production_steps (id,order_id,stage,status,assignee_id,started_at,notes) VALUES (?,?,?,?,?,?,?)")
      .bind(id(), orderId, stage, stage === "completed" ? "completed" : "in_progress", data.assignee_id ?? null, now(), data.notes ?? null),
    c.env.DB.prepare("UPDATE orders SET status=?,started_at=COALESCE(started_at,?),completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END,updated_at=? WHERE id=?")
      .bind(orderStatus, now(), stage, now(), now(), orderId),
  ]);
  await audit(c, "change_stage", "order", orderId, data);
  await recordOrderEvent(c, orderId, "stage_changed", `Etapa de produção: ${stage}`, orderStatus, data.notes ?? null);
  return c.json({ ok: true, status: orderStatus });
});
app.post("/api/orders/:id/cancel", async (c) => {
  if (!["super_admin", "admin", "manager"].includes(c.get("user").role)) return c.json({ error: "Somente Super Administrador, Administrador ou Gestor podem cancelar pedidos" }, 403);
  const orderId = c.req.param("id");
  const data = await body<{ reason?: string }>(c);
  const reason = data.reason?.trim();
  if (!reason) return c.json({ error: "Informe o motivo do cancelamento" }, 400);
  const order = await c.env.DB.prepare("SELECT id,code,status FROM orders WHERE id=?").bind(orderId).first<any>();
  if (!order) return c.json({ error: "Pedido não encontrado" }, 404);
  if (order.status === "cancelled") return c.json({ error: "Pedido já está cancelado" }, 409);
  if (order.status === "completed") return c.json({ error: "Pedido concluído não pode ser cancelado; registre uma ocorrência administrativa" }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE orders SET status='cancelled',cancellation_reason=?,cancelled_at=?,cancelled_by=?,updated_at=? WHERE id=?").bind(reason, now(), c.get("user").id, now(), orderId),
    c.env.DB.prepare("UPDATE order_materials SET reserved_qty=0 WHERE order_id=?").bind(orderId),
    c.env.DB.prepare("UPDATE production_steps SET status='cancelled',completed_at=COALESCE(completed_at,?) WHERE order_id=? AND status IN ('pending','in_progress')").bind(now(), orderId),
    c.env.DB.prepare("UPDATE receivables SET status='cancelled',notes=TRIM(COALESCE(notes,'') || ' | Pedido cancelado: ' || ?),updated_at=? WHERE order_id=? AND status IN ('pending','overdue','draft')").bind(reason, now(), orderId),
  ]);
  await audit(c, "cancel", "order", orderId, { reason });
  await recordOrderEvent(c, orderId, "cancelled", "Pedido cancelado", "cancelled", reason);
  return c.json({ ok: true });
});

app.delete("/api/orders/:id", requireSuperAdmin(), async (c) => {
  const orderId = c.req.param("id");
  const order = await c.env.DB.prepare("SELECT id,code,status,title FROM orders WHERE id=?").bind(orderId).first<any>();
  if (!order) return c.json({ error: "Pedido não encontrado" }, 404);
  const movements = await c.env.DB.prepare(
    `SELECT sm.material_id,SUM(sm.quantity) AS net_quantity,m.current_stock,m.name AS material_name
       FROM stock_movements sm JOIN materials m ON m.id=sm.material_id
      WHERE sm.order_id=? GROUP BY sm.material_id,m.current_stock,m.name`,
  ).bind(orderId).all<any>();
  const statements: D1PreparedStatement[] = [];
  for (const row of movements.results) {
    const newStock = quantity(row.current_stock) - quantity(row.net_quantity);
    if (newStock < 0) return c.json({ error: `Exclusão bloqueada: o saldo de ${row.material_name} ficaria negativo` }, 409);
    statements.push(c.env.DB.prepare("UPDATE materials SET current_stock=?,updated_at=? WHERE id=?").bind(newStock, now(), row.material_id));
  }
  const keys = await attachmentKeys(c.env, "order", orderId);
  statements.push(
    c.env.DB.prepare("DELETE FROM stock_movements WHERE order_id=?").bind(orderId),
    c.env.DB.prepare("DELETE FROM receivables WHERE order_id=?").bind(orderId),
    c.env.DB.prepare("DELETE FROM attachments WHERE entity_type='order' AND entity_id=?").bind(orderId),
    c.env.DB.prepare("DELETE FROM orders WHERE id=?").bind(orderId),
  );
  await c.env.DB.batch(statements);
  await deleteR2Keys(c.env, keys);
  await audit(c, "delete_permanent", "order", orderId, { code: order.code, title: order.title, status: order.status, stockReversed: movements.results.length });
  return c.json({ ok: true });
});


app.use("/api/finance", requirePermission("finance"));
app.use("/api/finance/*", requirePermission("finance"));
app.get("/api/finance", async (c) => {
  const kind = c.req.query("kind") === "payable" ? "payables" : "receivables";
  const relation = kind === "payables" ? "suppliers" : "customers";
  const relationId = kind === "payables" ? "supplier_id" : "customer_id";
  const result = await c.env.DB.prepare(
    `SELECT f.*, r.name AS party_name FROM ${kind} f LEFT JOIN ${relation} r ON r.id=f.${relationId} ORDER BY CASE f.status WHEN 'overdue' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, f.due_date`,
  ).all<any>();
  return c.json({ items: result.results, kind });
});
app.post("/api/finance", async (c) => {
  const data = await body<any>(c);
  const kind = data.kind === "payable" ? "payables" : "receivables";
  const entityId = id();
  if (kind === "payables") {
    await c.env.DB.prepare("INSERT INTO payables (id,purchase_id,supplier_id,description,amount,due_date,status,notes) VALUES (?,?,?,?,?,?,?,?)")
      .bind(entityId, data.purchase_id ?? null, data.supplier_id ?? null, data.description, money(data.amount), data.due_date ?? null, data.status ?? "pending", data.notes ?? null).run();
  } else {
    await c.env.DB.prepare("INSERT INTO receivables (id,order_id,customer_id,description,amount,due_date,status,notes) VALUES (?,?,?,?,?,?,?,?)")
      .bind(entityId, data.order_id ?? null, data.customer_id ?? null, data.description, money(data.amount), data.due_date ?? null, data.status ?? "pending", data.notes ?? null).run();
  }
  await audit(c, "create", kind === "payables" ? "payable" : "receivable", entityId, data);
  return c.json({ id: entityId }, 201);
});
app.put("/api/finance/:kind/:id", async (c) => {
  const data = await body<any>(c);
  const table = c.req.param("kind") === "payable" ? "payables" : "receivables";
  const paidAt = data.status === "paid" ? data.paid_at ?? now() : null;
  await c.env.DB.prepare(`UPDATE ${table} SET description=?,amount=?,due_date=?,paid_at=?,status=?,notes=?,updated_at=? WHERE id=?`)
    .bind(data.description, money(data.amount), data.due_date ?? null, paidAt, data.status ?? "pending", data.notes ?? null, now(), c.req.param("id")).run();
  await audit(c, "update", table === "payables" ? "payable" : "receivable", c.req.param("id"), data);
  return c.json({ ok: true });
});
app.delete("/api/finance/:kind/:id", requireSuperAdmin(), async (c) => {
  const table = c.req.param("kind") === "payable" ? "payables" : "receivables";
  const entityType = table === "payables" ? "payable" : "receivable";
  const entityId = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT id,description,amount,status FROM ${table} WHERE id=?`).bind(entityId).first<any>();
  if (!row) return c.json({ error: "Lançamento não encontrado" }, 404);
  await c.env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(entityId).run();
  await audit(c, "delete_permanent", entityType, entityId, row);
  return c.json({ ok: true });
});

app.use("/api/users", requirePermission("users"));
app.use("/api/users/*", requirePermission("users"));
app.get("/api/users", async (c) => {
  const result = await c.env.DB.prepare("SELECT id,name,email,role,status,last_login_at,created_at FROM users ORDER BY name").all<any>();
  return c.json({ items: result.results });
});
app.post("/api/users", async (c) => {
  const data = await body<any>(c);
  if (!data.name || !data.email || !data.password || data.password.length < 10) return c.json({ error: "Nome, e-mail e senha com 10+ caracteres são obrigatórios" }, 400);
  const entityId = id();
  const passwordHash = await hashPassword(data.password);
  await c.env.DB.prepare("INSERT INTO users (id,name,email,password_hash,role,status) VALUES (?,?,?,?,?,?)")
    .bind(entityId, data.name, String(data.email).toLowerCase(), passwordHash, data.role ?? "viewer", data.status ?? "active").run();
  await audit(c, "create", "user", entityId, { ...data, password: undefined });
  return c.json({ id: entityId }, 201);
});
app.put("/api/users/:id", async (c) => {
  const data = await body<any>(c);
  const userId = c.req.param("id");
  if (data.password) {
    if (data.password.length < 10) return c.json({ error: "A senha deve ter pelo menos 10 caracteres" }, 400);
    const passwordHash = await hashPassword(data.password);
    await c.env.DB.prepare("UPDATE users SET name=?,email=?,role=?,status=?,password_hash=?,updated_at=? WHERE id=?")
      .bind(data.name, String(data.email).toLowerCase(), data.role, data.status, passwordHash, now(), userId).run();
  } else {
    await c.env.DB.prepare("UPDATE users SET name=?,email=?,role=?,status=?,updated_at=? WHERE id=?")
      .bind(data.name, String(data.email).toLowerCase(), data.role, data.status, now(), userId).run();
  }
  await audit(c, "update", "user", userId, { ...data, password: undefined });
  return c.json({ ok: true });
});
app.delete("/api/users/:id", requireSuperAdmin(), async (c) => {
  const userId = c.req.param("id");
  if (userId === c.get("user").id) return c.json({ error: "Você não pode excluir o próprio usuário conectado" }, 409);
  const target = await c.env.DB.prepare("SELECT id,name,email,role FROM users WHERE id=?").bind(userId).first<any>();
  if (!target) return c.json({ error: "Usuário não encontrado" }, 404);
  if (target.role === "super_admin") {
    const total = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role='super_admin'").first<any>();
    if (Number(total?.total ?? 0) <= 1) return c.json({ error: "O último Super Administrador não pode ser excluído" }, 409);
  }
  await c.env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId).run();
  await audit(c, "delete_permanent", "user", userId, { name: target.name, email: target.email, role: target.role });
  return c.json({ ok: true });
});

app.use("/api/settings", requirePermission("settings"));
app.use("/api/settings/*", requirePermission("settings"));
app.get("/api/settings", async (c) => {
  const result = await c.env.DB.prepare("SELECT key,value,updated_at FROM settings ORDER BY key").all<any>();
  return c.json({ items: result.results, role: c.get("user").role });
});
app.put("/api/settings", async (c) => {
  const received = await body<Record<string, unknown>>(c);
  const generalKeys = ["company_name", "department_name", "currency", "timezone", "order_prefix", "purchase_prefix"];
  const identityKeys = ["login_title", "login_subtitle", "login_description", "primary_color", "accent_color"];
  const allowed = c.get("user").role === "super_admin" ? [...generalKeys, ...identityKeys] : generalKeys;
  const data = Object.fromEntries(Object.entries(received).filter(([key]) => allowed.includes(key)));
  // A assinatura técnica é protegida e não pode ser removida pela interface.
  data.powered_by = "SER Comunicação Inteligente & Hakham IA";
  const statements = Object.entries(data).map(([key, value]) => c.env.DB.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  ).bind(key, String(value ?? ""), now()));
  if (statements.length) await c.env.DB.batch(statements);
  await audit(c, "update", "settings", undefined, data);
  return c.json({ ok: true, config: publicBranding(await settingsMap(c.env)) });
});

app.post("/api/settings/branding/:slot", requireSuperAdmin(), async (c) => {
  const slot = c.req.param("slot");
  const settingKey = brandingSettingKey(slot);
  if (!settingKey) return c.json({ error: "Tipo de logotipo inválido" }, 400);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "Selecione um arquivo" }, 400);
  const allowed = slot === "favicon"
    ? ["image/svg+xml", "image/png", "image/x-icon"]
    : ["image/svg+xml", "image/png", "image/webp", "image/jpeg"];
  if (!allowed.includes(file.type)) return c.json({ error: "Formato não permitido. Use SVG, PNG, WEBP ou JPG" }, 415);
  if (file.size > 3 * 1024 * 1024) return c.json({ error: "O arquivo deve ter no máximo 3 MB" }, 413);
  const settings = await settingsMap(c.env);
  const previousKey = settings[settingKey];
  const objectKey = `branding/${slot}-${id()}.${extensionForMime(file.type)}`;
  await c.env.BUCKET.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=300" },
    customMetadata: { originalName: file.name, slot },
  });
  await c.env.DB.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  ).bind(settingKey, objectKey, now()).run();
  if (previousKey && previousKey !== objectKey) await c.env.BUCKET.delete(previousKey);
  await audit(c, "update_branding", "settings", slot, { filename: file.name, size: file.size });
  return c.json({ ok: true, url: `/api/branding/${slot}?v=${Date.now()}` });
});

app.delete("/api/settings/branding/:slot", requireSuperAdmin(), async (c) => {
  const slot = c.req.param("slot");
  const settingKey = brandingSettingKey(slot);
  if (!settingKey) return c.json({ error: "Tipo de logotipo inválido" }, 400);
  const settings = await settingsMap(c.env);
  if (settings[settingKey]) await c.env.BUCKET.delete(settings[settingKey]);
  await c.env.DB.prepare("UPDATE settings SET value='',updated_at=? WHERE key=?").bind(now(), settingKey).run();
  await audit(c, "reset_branding", "settings", slot);
  return c.json({ ok: true });
});

const testNamePredicate = "(lower(name) LIKE '%teste%' OR lower(name) LIKE '%test%' OR lower(name) LIKE '%demo%' OR lower(name) LIKE '%exemplo%')";

app.get("/api/settings/test-data/preview", requireSuperAdmin(), async (c) => {
  const [draftOrders, draftPurchases, testCustomers, testMaterials, draftReceivables, draftPayables] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM orders o WHERE o.status='draft' AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.order_id=o.id) AND NOT EXISTS (SELECT 1 FROM receivables r WHERE r.order_id=o.id)`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM purchases p WHERE p.status='draft' AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.purchase_id=p.id)`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM customers c WHERE ${testNamePredicate} AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id)`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM materials m WHERE ${testNamePredicate} AND m.current_stock=0 AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.material_id=m.id) AND NOT EXISTS (SELECT 1 FROM order_materials om WHERE om.material_id=m.id) AND NOT EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.material_id=m.id)`).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM receivables WHERE status='draft'").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM payables WHERE status='draft'").first<any>(),
  ]);
  return c.json({
    draftOrders: Number(draftOrders?.total ?? 0),
    draftPurchases: Number(draftPurchases?.total ?? 0),
    testCustomers: Number(testCustomers?.total ?? 0),
    testMaterials: Number(testMaterials?.total ?? 0),
    draftFinance: Number(draftReceivables?.total ?? 0) + Number(draftPayables?.total ?? 0),
  });
});

app.post("/api/settings/test-data/cleanup", requireSuperAdmin(), async (c) => {
  const data = await body<any>(c);
  if (data.confirmation !== "LIMPAR TESTES") return c.json({ error: "Digite LIMPAR TESTES para confirmar" }, 400);
  const deleted: Record<string, number> = {};
  const statements: D1PreparedStatement[] = [];

  if (data.draftOrders) {
    const orders = await c.env.DB.prepare(`SELECT o.id FROM orders o WHERE o.status='draft' AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.order_id=o.id) AND NOT EXISTS (SELECT 1 FROM receivables r WHERE r.order_id=o.id)`).all<any>();
    for (const order of orders.results) {
      const files = await c.env.DB.prepare("SELECT r2_key FROM attachments WHERE entity_type='order' AND entity_id=?").bind(order.id).all<any>();
      for (const file of files.results) await c.env.BUCKET.delete(file.r2_key);
      statements.push(c.env.DB.prepare("DELETE FROM attachments WHERE entity_type='order' AND entity_id=?").bind(order.id));
      statements.push(c.env.DB.prepare("DELETE FROM orders WHERE id=?").bind(order.id));
    }
    deleted.draftOrders = orders.results.length;
  }
  if (data.draftPurchases) {
    const rows = await c.env.DB.prepare(`SELECT p.id FROM purchases p WHERE p.status='draft' AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.purchase_id=p.id)`).all<any>();
    for (const row of rows.results) statements.push(c.env.DB.prepare("DELETE FROM purchases WHERE id=?").bind(row.id));
    deleted.draftPurchases = rows.results.length;
  }
  if (data.testCustomers) {
    const rows = await c.env.DB.prepare(`SELECT c.id FROM customers c WHERE ${testNamePredicate} AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id)`).all<any>();
    for (const row of rows.results) statements.push(c.env.DB.prepare("DELETE FROM customers WHERE id=?").bind(row.id));
    deleted.testCustomers = rows.results.length;
  }
  if (data.testMaterials) {
    const rows = await c.env.DB.prepare(`SELECT m.id FROM materials m WHERE ${testNamePredicate} AND m.current_stock=0 AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.material_id=m.id) AND NOT EXISTS (SELECT 1 FROM order_materials om WHERE om.material_id=m.id) AND NOT EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.material_id=m.id)`).all<any>();
    for (const row of rows.results) statements.push(c.env.DB.prepare("DELETE FROM materials WHERE id=?").bind(row.id));
    deleted.testMaterials = rows.results.length;
  }
  if (data.draftFinance) {
    const [receivables, payables] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM receivables WHERE status='draft'").first<any>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM payables WHERE status='draft'").first<any>(),
    ]);
    statements.push(c.env.DB.prepare("DELETE FROM receivables WHERE status='draft'"));
    statements.push(c.env.DB.prepare("DELETE FROM payables WHERE status='draft'"));
    deleted.draftFinance = Number(receivables?.total ?? 0) + Number(payables?.total ?? 0);
  }

  if (statements.length) await c.env.DB.batch(statements);
  await audit(c, "cleanup_test_data", "system", undefined, deleted);
  return c.json({ ok: true, deleted });
});

app.post("/api/attachments", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  if (!(file instanceof File) || !entityType || !entityId) return c.json({ error: "Arquivo e entidade são obrigatórios" }, 400);
  const maxBytes = Number(c.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
  if (file.size > maxBytes) return c.json({ error: `Arquivo excede ${c.env.MAX_UPLOAD_MB || 25} MB` }, 413);
  const attachmentId = id();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${entityType}/${entityId}/${attachmentId}-${safeName}`;
  await c.env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  await c.env.DB.prepare(
    "INSERT INTO attachments (id,entity_type,entity_id,r2_key,filename,mime_type,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?,?,?)",
  ).bind(attachmentId, entityType, entityId, key, file.name, file.type || null, file.size, c.get("user").id).run();
  await audit(c, "upload", "attachment", attachmentId, { entityType, entityId, filename: file.name });
  return c.json({ id: attachmentId, filename: file.name }, 201);
});
app.get("/api/attachments/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id=?").bind(c.req.param("id")).first<any>();
  if (!row) return c.json({ error: "Arquivo não encontrado" }, 404);
  const object = await c.env.BUCKET.get(row.r2_key);
  if (!object) return c.json({ error: "Arquivo ausente no armazenamento" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(object.body, { headers });
});
app.delete("/api/attachments/:id", requireSuperAdmin(), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id=?").bind(c.req.param("id")).first<any>();
  if (!row) return c.json({ error: "Arquivo não encontrado" }, 404);
  await c.env.BUCKET.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM attachments WHERE id=?").bind(row.id).run();
  await audit(c, "delete_permanent", "attachment", row.id);
  return c.json({ ok: true });
});

app.use("/api/reports", requirePermission("reports"));
app.use("/api/reports/*", requirePermission("reports"));
app.get("/api/reports/:type.pdf", async (c) => {
  const type = c.req.param("type");
  const from = c.req.query("from") || "2000-01-01";
  const to = c.req.query("to") || "2999-12-31";
  const brand = await pdfBrand(c.env);
  let pdf: Uint8Array;
  if (type === "stock") {
    const result = await c.env.DB.prepare(
      `SELECT m.sku,m.name,c.name AS category,m.unit,m.current_stock,m.minimum_stock,m.average_cost,m.location
       FROM materials m LEFT JOIN material_categories c ON c.id=m.category_id WHERE m.active=1 ORDER BY c.sort_order,m.name`,
    ).all<any>();
    const totalValue = result.results.reduce((sum: number, row: any) => sum + money(row.current_stock) * money(row.average_cost), 0);
    pdf = await buildReportPdf({
      title: "Relatório de Estoque",
      subtitle: "Posição atual de chapas, tintas, insumos e materiais",
      rows: result.results,
      summary: [`Itens cadastrados: ${result.results.length}`, `Valor estimado em estoque: ${totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`],
      columns: [
        { label: "SKU", width: 70, value: (r) => r.sku || "—" },
        { label: "Material", width: 170, value: (r) => r.name },
        { label: "Categoria", width: 110, value: (r) => r.category || "—" },
        { label: "Un.", width: 45, value: (r) => r.unit },
        { label: "Estoque", width: 65, value: (r) => String(r.current_stock) },
        { label: "Mínimo", width: 60, value: (r) => String(r.minimum_stock) },
        { label: "Custo médio", width: 80, value: (r) => money(r.average_cost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        { label: "Local", width: 90, value: (r) => r.location || "—" },
      ],
      brand,
    });
  } else if (type === "finance") {
    const receivables = await c.env.DB.prepare("SELECT r.*,c.name AS party FROM receivables r LEFT JOIN customers c ON c.id=r.customer_id WHERE COALESCE(r.due_date,'') BETWEEN ? AND ? ORDER BY r.due_date").bind(from, to).all<any>();
    const payables = await c.env.DB.prepare("SELECT p.*,s.name AS party FROM payables p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE COALESCE(p.due_date,'') BETWEEN ? AND ? ORDER BY p.due_date").bind(from, to).all<any>();
    const rows = [
      ...receivables.results.map((r: any) => ({ ...r, kind: "Receber" })),
      ...payables.results.map((r: any) => ({ ...r, kind: "Pagar" })),
    ];
    pdf = await buildReportPdf({
      title: "Relatório Financeiro",
      subtitle: `Período de ${from} a ${to}`,
      rows,
      summary: [
        `Contas a receber: ${receivables.results.reduce((s: number, r: any) => s + money(r.amount), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        `Contas a pagar: ${payables.results.reduce((s: number, r: any) => s + money(r.amount), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      ],
      columns: [
        { label: "Tipo", width: 65, value: (r) => r.kind },
        { label: "Descrição", width: 210, value: (r) => r.description },
        { label: "Cliente / Fornecedor", width: 160, value: (r) => r.party || "—" },
        { label: "Vencimento", width: 90, value: (r) => r.due_date || "—" },
        { label: "Valor", width: 90, value: (r) => money(r.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        { label: "Status", width: 80, value: (r) => r.status },
      ],
      brand,
    });
  } else if (type === "movements") {
    const result = await c.env.DB.prepare(
      `SELECT sm.*,m.name AS material_name,m.unit,o.code AS order_code,p.code AS purchase_code,u.name AS user_name
       FROM stock_movements sm JOIN materials m ON m.id=sm.material_id
       LEFT JOIN orders o ON o.id=sm.order_id LEFT JOIN purchases p ON p.id=sm.purchase_id LEFT JOIN users u ON u.id=sm.user_id
       WHERE substr(sm.created_at,1,10) BETWEEN ? AND ? ORDER BY sm.created_at DESC`,
    ).bind(from, to).all<any>();
    pdf = await buildReportPdf({
      title: "Movimentações de Estoque",
      subtitle: `Período de ${from} a ${to}`,
      rows: result.results,
      summary: [`Movimentações registradas: ${result.results.length}`],
      columns: [
        { label: "Data", width: 95, value: (r) => String(r.created_at).replace("T", " ").slice(0, 16) },
        { label: "Material", width: 160, value: (r) => r.material_name },
        { label: "Tipo", width: 90, value: (r) => r.type },
        { label: "Quantidade", width: 80, value: (r) => `${r.quantity} ${r.unit}` },
        { label: "Pedido/Compra", width: 100, value: (r) => r.order_code || r.purchase_code || "—" },
        { label: "Usuário", width: 105, value: (r) => r.user_name || "—" },
        { label: "Observação", width: 150, value: (r) => r.notes || "—" },
      ],
      brand,
    });
  } else {
    const result = await c.env.DB.prepare(
      `SELECT o.code,o.title,o.status,o.priority,o.due_date,o.total_price,c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
       WHERE substr(o.created_at,1,10) BETWEEN ? AND ? ORDER BY o.created_at DESC`,
    ).bind(from, to).all<any>();
    pdf = await buildReportPdf({
      title: "Relatório de Pedidos e Produção",
      subtitle: `Período de ${from} a ${to}`,
      rows: result.results,
      summary: [`Pedidos no período: ${result.results.length}`, `Valor total: ${result.results.reduce((s: number, r: any) => s + money(r.total_price), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`],
      columns: [
        { label: "Código", width: 90, value: (r) => r.code },
        { label: "Pedido", width: 190, value: (r) => r.title },
        { label: "Cliente", width: 145, value: (r) => r.customer_name || "—" },
        { label: "Status", width: 90, value: (r) => r.status },
        { label: "Prioridade", width: 80, value: (r) => r.priority },
        { label: "Entrega", width: 90, value: (r) => r.due_date || "—" },
        { label: "Valor", width: 90, value: (r) => money(r.total_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      ],
      brand,
    });
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="mkng-${type}-${from}-${to}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

app.get("/api/audit", requirePermission("settings"), async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT a.*,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 500`,
  ).all<any>();
  return c.json({ items: result.results });
});

export default app;
