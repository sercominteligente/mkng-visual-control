import { useEffect, useState } from "react";
import { api, brl, dateBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader } from "../components/UI";

const statuses = ["draft", "approved", "production", "finishing", "installation", "completed", "cancelled"];
const labels: Record<string, string> = { draft: "Rascunho", approved: "Aprovado", production: "Produção", finishing: "Acabamento", installation: "Instalação", completed: "Concluído", cancelled: "Cancelado" };
const tones: Record<string, string> = { draft: "neutral", approved: "info", production: "warning", finishing: "warning", installation: "purple", completed: "success", cancelled: "danger" };

export function OrdersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({ customer_id: "", title: "", description: "", priority: "normal", status: "draft", due_date: "", total_price: 0, notes: "", materials: [] });

  const load = async () => {
    setLoading(true);
    try {
      const [orders, clients, materialData] = await Promise.all([
        api<{ items: any[] }>(`/orders?q=${encodeURIComponent(search)}${filter ? `&status=${filter}` : ""}`),
        api<{ items: any[] }>("/customers"),
        api<{ items: any[] }>("/materials"),
      ]);
      setItems(orders.items); setCustomers(clients.items); setMaterials(materialData.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar pedidos"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [filter]);

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api("/orders", { method: "POST", body: JSON.stringify(form) });
      setOpen(false); setForm({ customer_id: "", title: "", description: "", priority: "normal", status: "draft", due_date: "", total_price: 0, notes: "", materials: [] }); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível criar o pedido"); }
  };

  const loadDetail = async (id: string) => {
    try { setDetail(await api(`/orders/${id}`)); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao abrir pedido"); }
  };

  const updateStatus = async (order: any, status: string) => {
    await api(`/orders/${order.id}`, { method: "PUT", body: JSON.stringify({ ...order, status }) });
    await load();
  };

  const addMaterialRow = () => setForm({ ...form, materials: [...form.materials, { material_id: materials[0]?.id ?? "", planned_qty: 1, reserved_qty: 1 }] });

  return <>
    <PageHeader eyebrow="DEMANDAS E ORDENS DE SERVIÇO" title="Pedidos / OS" description="Da entrada da demanda à conclusão, com materiais previstos e controle de prazo." action={<button className="primary-button" onClick={() => setOpen(true)}>+ Novo pedido</button>} />
    {error && <div className="alert error">{error}</div>}
    <div className="panel filters"><div className="filter-tabs"><button className={!filter ? "active" : ""} onClick={() => setFilter("")}>Todos</button>{statuses.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{labels[status]}</button>)}</div><div className="search-inline"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="Buscar código, pedido ou cliente..." /><button className="secondary-button" onClick={load}>Buscar</button></div></div>
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhum pedido encontrado" text="Crie uma nova demanda para iniciar o fluxo de produção." /> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Pedido</th><th>Cliente</th><th>Prioridade</th><th>Status</th><th>Entrega</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{items.map((order) => <tr key={order.id}><td><button className="link-button" onClick={() => loadDetail(order.id)}>{order.code}</button></td><td><strong>{order.title}</strong><small className="cell-sub">{order.description || "Sem descrição"}</small></td><td>{order.customer_name || "—"}</td><td><Badge tone={order.priority === "urgent" ? "danger" : order.priority === "high" ? "warning" : "neutral"}>{order.priority}</Badge></td><td><Badge tone={tones[order.status]}>{labels[order.status]}</Badge></td><td>{dateBR(order.due_date)}</td><td>{brl(order.total_price)}</td><td className="actions"><select value={order.status} onChange={(event) => void updateStatus(order, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select><button onClick={() => loadDetail(order.id)}>Abrir</button></td></tr>)}</tbody></table></div>}</div>
    {open && <Modal title="Novo pedido / OS" onClose={() => setOpen(false)} width={900}><form className="form-grid" onSubmit={createOrder}>
      <Field label="Cliente"><select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">Selecione...</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
      <Field label="Prioridade"><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></Field>
      <Field label="Título do pedido" wide><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Fachada em ACM para nova unidade" /></Field>
      <Field label="Descrição / briefing" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      <Field label="Data de entrega"><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Field>
      <Field label="Valor previsto"><input type="number" step="0.01" value={form.total_price} onChange={(event) => setForm({ ...form, total_price: event.target.value })} /></Field>
      <Field label="Observações" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      <div className="wide subform"><div className="subform-head"><div><strong>Materiais planejados</strong><small>A reserva não baixa o estoque; a baixa ocorre somente após confirmação do consumo.</small></div><button type="button" className="secondary-button" onClick={addMaterialRow}>+ Material</button></div>{form.materials.map((row: any, index: number) => <div className="material-row" key={index}><select value={row.material_id} onChange={(event) => { const next = [...form.materials]; next[index].material_id = event.target.value; setForm({ ...form, materials: next }); }}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} — saldo {material.current_stock} {material.unit}</option>)}</select><input type="number" step="0.001" value={row.planned_qty} onChange={(event) => { const next = [...form.materials]; next[index].planned_qty = event.target.value; next[index].reserved_qty = event.target.value; setForm({ ...form, materials: next }); }} /><button type="button" className="danger-link" onClick={() => setForm({ ...form, materials: form.materials.filter((_: any, i: number) => i !== index) })}>Remover</button></div>)}</div>
      <div className="form-actions wide"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button">Criar pedido</button></div>
    </form></Modal>}
    {detail && <OrderDetail detail={detail} materials={materials} onClose={() => setDetail(null)} onChanged={async () => { const next = await api(`/orders/${detail.order.id}`); setDetail(next); await load(); }} />}
  </>;
}

function OrderDetail({ detail, materials, onClose, onChanged }: { detail: any; materials: any[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [consume, setConsume] = useState({ material_id: detail.materials[0]?.material_id || materials[0]?.id || "", quantity: 1, notes: "" });
  const [stage, setStage] = useState("printing");
  const confirmConsume = async () => { await api(`/orders/${detail.order.id}/consume`, { method: "POST", body: JSON.stringify(consume) }); await onChanged(); };
  const changeStage = async () => { await api(`/orders/${detail.order.id}/stage`, { method: "POST", body: JSON.stringify({ stage }) }); await onChanged(); };
  return <Modal title={`${detail.order.code} — ${detail.order.title}`} onClose={onClose} width={1050}><div className="detail-grid"><div className="detail-card"><span>Cliente</span><strong>{detail.order.customer_name || "—"}</strong></div><div className="detail-card"><span>Status</span><Badge tone={tones[detail.order.status]}>{labels[detail.order.status]}</Badge></div><div className="detail-card"><span>Entrega</span><strong>{dateBR(detail.order.due_date)}</strong></div><div className="detail-card"><span>Valor</span><strong>{brl(detail.order.total_price)}</strong></div></div><div className="two-columns"><section className="panel inner-panel"><div className="panel-head"><h3>Materiais do pedido</h3></div>{detail.materials.length === 0 ? <p className="muted">Nenhum material planejado.</p> : <div className="table-wrap"><table><thead><tr><th>Material</th><th>Planejado</th><th>Reservado</th><th>Consumido</th><th>Devolvido</th></tr></thead><tbody>{detail.materials.map((item: any) => <tr key={item.id}><td>{item.material_name}</td><td>{item.planned_qty} {item.unit}</td><td>{item.reserved_qty} {item.unit}</td><td>{item.consumed_qty} {item.unit}</td><td>{item.returned_qty} {item.unit}</td></tr>)}</tbody></table></div>}</section><section className="panel inner-panel"><div className="panel-head"><h3>Confirmar consumo</h3></div><div className="stack-form"><select value={consume.material_id} onChange={(event) => setConsume({ ...consume, material_id: event.target.value })}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} — {material.current_stock} {material.unit}</option>)}</select><input type="number" step="0.001" value={consume.quantity} onChange={(event) => setConsume({ ...consume, quantity: Number(event.target.value) })} /><input placeholder="Observação" value={consume.notes} onChange={(event) => setConsume({ ...consume, notes: event.target.value })} /><button className="primary-button" onClick={() => void confirmConsume()}>Confirmar baixa</button></div></section></div><section className="panel inner-panel"><div className="panel-head"><div><h3>Produção</h3><p>Avance o pedido pela linha de produção.</p></div><div className="inline-actions"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="briefing">Briefing</option><option value="design">Criação / arte</option><option value="printing">Impressão</option><option value="finishing">Acabamento</option><option value="installation">Instalação</option><option value="completed">Concluído</option></select><button className="secondary-button" onClick={() => void changeStage()}>Avançar etapa</button></div></div><div className="timeline">{detail.steps.map((step: any) => <div key={step.id} className={`timeline-item ${step.status}`}><i /><div><strong>{step.stage}</strong><small>{step.status} · {step.assignee_name || "Sem responsável"}</small></div></div>)}</div></section></Modal>;
}
