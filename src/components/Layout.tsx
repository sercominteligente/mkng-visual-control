import type { ReactNode } from "react";
import { navigate } from "../lib/router";
import { api } from "../lib/api";
import type { BrandingConfig } from "../lib/branding";

export type User = { id: string; name: string; email: string; role: string; status: string };

const menu = [
  ["/dashboard", "Painel", "◫", "dashboard"],
  ["/orders", "Pedidos / OS", "▤", "orders"],
  ["/production", "Produção", "◈", "production"],
  ["/materials", "Estoque", "▦", "stock"],
  ["/purchases", "Entradas / Compras", "↓", "purchases"],
  ["/stock", "Consumo / Baixas", "⇄", "stock"],
  ["/losses", "Perdas / Reimpressões", "⚠", "stock"],
  ["/customers", "Clientes", "◎", "customers"],
  ["/suppliers", "Fornecedores", "◇", "suppliers"],
  ["/finance", "Financeiro", "$", "finance"],
  ["/reports", "Relatórios PDF", "▥", "reports"],
  ["/users", "Usuários", "♙", "users"],
  ["/settings", "Configurações", "⚙", "settings"],
] as const;

const rolePermissions: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["dashboard", "orders", "production", "stock", "purchases", "customers", "suppliers", "finance", "reports", "users", "settings"],
  manager: ["dashboard", "orders", "production", "stock", "purchases", "customers", "suppliers", "finance", "reports"],
  production: ["dashboard", "orders", "production", "stock"],
  stock: ["dashboard", "stock", "purchases", "orders", "suppliers", "reports"],
  finance: ["dashboard", "finance", "customers", "suppliers", "orders", "purchases", "reports"],
  viewer: ["dashboard", "orders", "production", "reports"],
};

function hasPermission(user: User, permission: string): boolean {
  const permissions = rolePermissions[user.role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrador",
    manager: "Gestor",
    production: "Produção",
    stock: "Estoque",
    finance: "Financeiro",
    viewer: "Consulta",
  };
  return labels[role] ?? role.replaceAll("_", " ");
}

export function Layout({ path, user, branding, onLogout, children }: { path: string; user: User; branding: BrandingConfig; onLogout: () => void; children: ReactNode }) {
  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } finally { onLogout(); navigate("/login"); }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("/dashboard")}>
          <img src={branding.sidebar_logo_url || "/mkng-logo.svg"} alt={branding.company_name} />
          <span>{branding.department_name}</span>
        </button>
        <nav>
          {menu.filter(([, , , permission]) => hasPermission(user, permission)).map(([href, label, icon]) => (
            <button key={href} className={path === href || path.startsWith(`${href}/`) ? "active" : ""} onClick={() => navigate(href)}>
              <i>{icon}</i><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>Powered by:</span>
          <strong>SER Comunicação Inteligente</strong>
          <small>& Hakham IA</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="top-search"><span>⌕</span><input placeholder="Buscar pedidos, clientes e materiais..." /></div>
          <div className="user-menu">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></div>
            <button className="ghost-button" onClick={logout}>Sair</button>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
