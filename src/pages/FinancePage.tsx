import { useEffect, useState } from "react";
import { api, brl, dateBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader, StatCard } from "../components/UI";
import type { User } from "../components/Layout";

export function FinancePage({ user }: { user: User }) {
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({ kind: "receivable", description: "", amount: 0, due_date: "", customer_id: "", supplier_id: "", status: "pending", notes: "" });
  const load = async () => {
    setLoading(true);
    try {
      const [finance, clientData, supplierData] = await Promise.all([api<{ items: any[] }>(`/finance?kind=${kind}`), api<{ items: any[] }>("/customers"), api<{ items: any[] }>("/suppliers")]);
      setItems(finance.items); setCustomers(clientData.items); setSuppliers(supplierData.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar financeiro"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [kind]);
  const pending = items.filter((item) => item.status !== "paid").reduce((sum, item) => sum + Number(item.amount), 0);
  const paid = items.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await api("/finance", { method: "POST", body: JSON.stringify({ ...form, kind }) }); setOpen(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar o lançamento"); }
  };
  const markPaid = async (item: any) => {
    try { await api(`/finance/${kind}/${item.id}`, { method: "PUT", body: JSON.stringify({ ...item, status: "paid" }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível atualizar o lançamento"); }
  };
  const remove = async (item: any) => {
    const confirmation = window.prompt(`Excluir definitivamente o lançamento “${item.description}”?\n\nDigite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") return;
    try { await api(`/finance/${kind}/${item.id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir o lançamento"); }
  };
  return <><PageHeader eyebrow="CONTROLE FINANCEIRO" title="Contas a receber e pagar" description="Acompanhamento financeiro conectado a pedidos, compras, clientes e fornecedores." action={<button className="primary-button" onClick={() => { setForm({ kind, description: "", amount: 0, due_date: "", customer_id: "", supplier_id: "", status: "pending", notes: "" }); setOpen(true); }}>+ Novo lançamento</button>} />
    {error && <div className="alert error">{error}</div>}
    <div className="filter-tabs standalone"><button className={kind === "receivable" ? "active" : ""} onClick={() => setKind("receivable")}>Contas a receber</button><button className={kind === "payable" ? "active" : ""} onClick={() => setKind("payable")}>Contas a pagar</button></div>
    <div className="stats-grid three"><StatCard label="Em aberto" value={brl(pending)} tone={kind === "receivable" ? "green" : "red"} /><StatCard label="Liquidadas" value={brl(paid)} tone="purple" /><StatCard label="Lançamentos" value={items.length} /></div>
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhum lançamento" text="Cadastre contas a receber ou a pagar." /> : <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>{kind === "receivable" ? "Cliente" : "Fornecedor"}</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.description}</strong><small className="cell-sub">{item.notes || ""}</small></td><td>{item.party_name || "—"}</td><td>{dateBR(item.due_date)}</td><td>{brl(item.amount)}</td><td><Badge tone={item.status === "paid" ? "success" : item.status === "overdue" ? "danger" : "warning"}>{item.status === "paid" ? "Pago" : item.status === "overdue" ? "Vencido" : "Pendente"}</Badge></td><td className="actions">{item.status !== "paid" && <button onClick={() => void markPaid(item)}>Marcar pago</button>}{user.role === "super_admin" && <button className="action-danger" onClick={() => void remove(item)}>Excluir definitivamente</button>}</td></tr>)}</tbody></table></div>}</div>
    {open && <Modal title={kind === "receivable" ? "Nova conta a receber" : "Nova conta a pagar"} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Descrição" wide><input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>{kind === "receivable" ? <Field label="Cliente"><select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">Selecione...</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : <Field label="Fornecedor"><select value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}><option value="">Selecione...</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}<Field label="Valor"><input type="number" step="0.01" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label="Vencimento"><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Field><Field label="Observações" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button">Salvar lançamento</button></div></form></Modal>}
  </>;
}
