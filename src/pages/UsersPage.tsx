import { useEffect, useState } from "react";
import { api, dateTimeBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader } from "../components/UI";
import type { User } from "../components/Layout";

const roles = [
  ["super_admin", "Super administrador"], ["admin", "Administrador"], ["manager", "Gestor"], ["production", "Produção"], ["stock", "Estoque"], ["finance", "Financeiro"], ["viewer", "Consulta"],
];

export function UsersPage({ user }: { user: User }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({ name: "", email: "", role: "viewer", status: "active", password: "" });
  const load = async () => { setLoading(true); try { const data = await api<{ items: any[] }>("/users"); setItems(data.items); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar usuários"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const start = (item?: any) => { setEditing(item || null); setForm(item ? { ...item, password: "" } : { name: "", email: "", role: "viewer", status: "active", password: "" }); setOpen(true); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { await api(editing ? `/users/${editing.id}` : "/users", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) }); setOpen(false); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar o usuário"); } };
  const remove = async (item: any) => {
    const confirmation = window.prompt(`Excluir definitivamente o usuário “${item.name}”?\n\nDigite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") return;
    try { await api(`/users/${item.id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir o usuário"); }
  };
  return <><PageHeader eyebrow="ACESSOS E PERMISSÕES" title="Usuários" description="Cadastre responsáveis e defina o acesso de cada função." action={<button className="primary-button" onClick={() => start()}>+ Novo usuário</button>} />{error && <div className="alert error">{error}</div>}<div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhum usuário" text="Cadastre os responsáveis por cada setor." /> : <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Função</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{roles.find(([key]) => key === item.role)?.[1] || item.role}</td><td><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "Ativo" : "Inativo"}</Badge></td><td>{dateTimeBR(item.last_login_at)}</td><td className="actions"><button onClick={() => start(item)}>Editar</button>{user.role === "super_admin" && item.id !== user.id && <button className="action-danger" onClick={() => void remove(item)}>Excluir definitivamente</button>}</td></tr>)}</tbody></table></div>}</div>{open && <Modal title={editing ? "Editar usuário" : "Novo usuário"} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Nome"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="E-mail"><input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field><Field label="Função"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></Field><Field label={editing ? "Nova senha (opcional)" : "Senha inicial"} wide><input type="password" required={!editing} minLength={10} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Mínimo de 10 caracteres.</small></Field><div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button">Salvar usuário</button></div></form></Modal>}</>;
}
