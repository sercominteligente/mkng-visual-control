import type { ReactNode } from "react";
import { navigate } from "../lib/router";
import { api } from "../lib/api";

export type User = { id: string; name: string; email: string; role: string; status: string };

const menu = [
  ["/dashboard", "Painel", "◫"],
  ["/orders", "Pedidos / OS", "▤"],
  ["/production", "Produção", "◈"],
  ["/materials", "Estoque", "▦"],
  ["/purchases", "Entradas / Compras", "↓"],
  ["/stock", "Consumo / Baixas", "⇄"],
  ["/customers", "Clientes", "◎"],
  ["/suppliers", "Fornecedores", "◇"],
  ["/finance", "Financeiro", "$"],
  ["/reports", "Relatórios PDF", "▥"],
  ["/users", "Usuários", "♙"],
  ["/settings", "Configurações", "⚙"],
] as const;

export function Layout({ path, user, onLogout, children }: { path: string; user: User; onLogout: () => void; children: ReactNode }) {
  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } finally { onLogout(); navigate("/login"); }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("/dashboard")}>
          <img src="/mkng-logo.svg" alt="MKNG Soluções" />
          <span>Setor de Comunicação Visual</span>
        </button>
        <nav>
          {menu.map(([href, label, icon]) => (
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
            <div><strong>{user.name}</strong><small>{user.role.replaceAll("_", " ")}</small></div>
            <button className="ghost-button" onClick={logout}>Sair</button>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
