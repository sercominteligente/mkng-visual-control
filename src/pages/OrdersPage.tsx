import { useEffect, useState } from "react";
import { api, brl, dateBR, dateTimeBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Field, Loading, PageHeader } from "../components/UI";
import type { User } from "../components/Layout";

const statuses = ["draft", "approved", "production", "finishing", "installation", "completed", "cancelled"];
const editableStatuses = ["draft", "approved", "production", "finishing", "installation", "completed"];
const labels: Record<string, string> = { draft: "Rascunho", approved: "Aprovado", production: "Produção", finishing: "Acabamento", installation: "Instalação", completed: "Concluído", cancelled: "Cancelado" };
const tones: Record<string, string> = { draft: "neutral", approved: "info", production: "warning", finishing: "warning", installation: "purple", completed: "success", cancelled: "danger" };

export function OrdersPage({ user }: { user: User }) {
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState("");
  const [cancelOrder, setCancelOrder] = useState<any>(null);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
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
    try {
      await api(`/orders/${order.id}`, { method: "PUT", body: JSON.stringify({ ...order, status }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível alterar o status"); }
  };

  const printOrder = (orderId: string) => window.open(`/api/orders/${orderId}/pdf`, "_blank", "noopener,noreferrer");

  const confirmCancel = async () => {
    if (!cancelOrder) return;
    try {
      await api(`/orders/${cancelOrder.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: cancelReason }) });
      setCancelOrder(null); setCancelReason(""); setDetail(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível cancelar o pedido"); }
  };

  const confirmDelete = async () => {
    if (!deleteOrder || deleteConfirmation !== "EXCLUIR") return;
    try {
      await api(`/orders/${deleteOrder.id}`, { method: "DELETE" });
      setDeleteOrder(null); setDeleteConfirmation(""); setDetail(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir o pedido"); }
  };

  const addMaterialRow = () => setForm({ ...form, materials: [...form.materials, { material_id: materials[0]?.id ?? "", planned_qty: 1, reserved_qty: 1 }] });

  return <>
    <PageHeader eyebrow="DEMANDAS E ORDENS DE SERVIÇO" title="Pedidos / OS" description="Da entrada da demanda à conclusão, com materiais previstos e controle de prazo." action={<button className="primary-button" onClick={() => setOpen(true)}>+ Novo pedido</button>} />
    {error && <div className="alert error">{error}</div>}
    <div className="panel filters"><div className="filter-tabs"><button className={!filter ? "active" : ""} onClick={() => setFilter("")}>Todos</button>{statuses.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{labels[status]}</button>)}</div><div className="search-inline"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="Buscar código, pedido ou cliente..." /><button className="secondary-button" onClick={load}>Buscar</button></div></div>
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhum pedido encontrado" text="Crie uma nova demanda para iniciar o fluxo de produção." /> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Pedido</th><th>Cliente</th><th>Prioridade</th><th>Status</th><th>Entrega</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{items.map((order) => <tr key={order.id}><td><button className="link-button" onClick={() => loadDetail(order.id)}>{order.code}</button></td><td><strong>{order.title}</strong><small className="cell-sub">{order.description || "Sem descrição"}</small></td><td>{order.customer_name || "—"}</td><td><Badge tone={order.priority === "urgent" ? "danger" : order.priority === "high" ? "warning" : "neutral"}>{order.priority}</Badge></td><td><Badge tone={tones[order.status]}>{labels[order.status]}</Badge></td><td>{dateBR(order.due_date)}</td><td>{brl(order.total_price)}</td><td className="actions order-actions">{order.status !== "cancelled" ? <select value={order.status} disabled={order.status === "completed"} onChange={(event) => void updateStatus(order, event.target.value)}>{editableStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select> : <Badge tone="danger">Cancelado</Badge>}<button onClick={() => loadDetail(order.id)}>Abrir</button><button onClick={() => printOrder(order.id)}>PDF</button>{["super_admin", "admin", "manager"].includes(user.role) && !["completed", "cancelled"].includes(order.status) && <button className="action-danger" onClick={() => { setCancelReason(""); setCancelOrder(order); }}>Cancelar</button>}{user.role === "super_admin" && <button className="action-danger" onClick={() => { setDeleteConfirmation(""); setDeleteOrder(order); }}>Excluir definitivamente</button>}</td></tr>)}</tbody></table></div>}</div>
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
    {cancelOrder && <Modal title={`Cancelar ${cancelOrder.code}`} onClose={() => setCancelOrder(null)}><div className="stack-form"><p className="muted">O pedido permanecerá no histórico. As reservas serão liberadas e os lançamentos pendentes serão marcados como cancelados.</p><label><span>Motivo do cancelamento *</span><textarea autoFocus value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ex.: Cliente desistiu do projeto" /></label><div className="form-actions"><button className="ghost-button" onClick={() => setCancelOrder(null)}>Voltar</button><button className="danger-button" disabled={!cancelReason.trim()} onClick={() => void confirmCancel()}>Confirmar cancelamento</button></div></div></Modal>}
    {deleteOrder && <Modal title={`Excluir definitivamente ${deleteOrder.code}`} onClose={() => setDeleteOrder(null)}><div className="stack-form"><div className="alert error">Ação exclusiva do Super Administrador. O pedido, etapas, movimentações, lançamentos e anexos serão removidos. Movimentações de estoque serão revertidas antes da exclusão.</div><label><span>Digite EXCLUIR para confirmar</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><div className="form-actions"><button className="ghost-button" onClick={() => setDeleteOrder(null)}>Cancelar</button><button className="danger-button" disabled={deleteConfirmation !== "EXCLUIR"} onClick={() => void confirmDelete()}>Excluir definitivamente</button></div></div></Modal>}
    {detail && <OrderDetail detail={detail} materials={materials} onClose={() => setDetail(null)} onCancel={() => { const order = detail.order; setDetail(null); setCancelReason(""); setCancelOrder(order); }} onDelete={() => { const order = detail.order; setDetail(null); setDeleteConfirmation(""); setDeleteOrder(order); }} onChanged={async () => { const next = await api(`/orders/${detail.order.id}`); setDetail(next); await load(); }} />}
  </>;
}

function OrderDetail({ detail, materials, onClose, onCancel, onDelete, onChanged }: { detail: any; materials: any[]; onClose: () => void; onCancel: () => void; onDelete: () => void; onChanged: () => Promise<void> }) {
  const [consume, setConsume] = useState({ material_id: detail.materials[0]?.material_id || materials[0]?.id || "", quantity: 1, mode: "quantity", width_mm: 1000, height_mm: 1000, pieces: 1, notes: "" });
  const [stage, setStage] = useState("printing");
  const [error, setError] = useState("");
  const locked = ["cancelled", "completed"].includes(detail.order.status);
  const selectedMaterial = materials.find((material) => material.id === consume.material_id);
  const calculatedArea = selectedMaterial?.unit === "m2" && consume.mode === "dimensions" ? Math.round(((Number(consume.width_mm || 0) / 1000) * (Number(consume.height_mm || 0) / 1000) * Number(consume.pieces || 1)) * 1000) / 1000 : 0;
  const confirmConsume = async () => { try { setError(""); await api(`/orders/${detail.order.id}/consume`, { method: "POST", body: JSON.stringify(consume) }); await onChanged(); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao confirmar consumo"); } };
  const changeStage = async () => { try { setError(""); await api(`/orders/${detail.order.id}/stage`, { method: "POST", body: JSON.stringify({ stage }) }); await onChanged(); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao avançar etapa"); } };
  const printCurrent = () => window.open(`/api/orders/${detail.order.id}/pdf`, "_blank", "noopener,noreferrer");
  const printEvent = (eventId: string) => window.open(`/api/orders/${detail.order.id}/events/${eventId}/pdf`, "_blank", "noopener,noreferrer");
  return <Modal title={`${detail.order.code} — ${detail.order.title}`} onClose={onClose} width={1100}><div className="detail-toolbar"><button className="primary-button" onClick={printCurrent}>Imprimir Pedido / OS</button>{detail.permissions?.canCancel && <button className="secondary-button action-danger" onClick={onCancel}>Cancelar pedido</button>}{detail.permissions?.canDeletePermanent && <button className="danger-button" onClick={onDelete}>Excluir definitivamente</button>}</div>{error && <div className="alert error">{error}</div>}<div className="detail-grid"><div className="detail-card"><span>Cliente</span><strong>{detail.order.customer_name || "—"}</strong></div><div className="detail-card"><span>Status</span><Badge tone={tones[detail.order.status]}>{labels[detail.order.status]}</Badge></div><div className="detail-card"><span>Entrega</span><strong>{dateBR(detail.order.due_date)}</strong></div>{detail.permissions?.canViewFinancial && <div className="detail-card"><span>Valor</span><strong>{brl(detail.order.total_price)}</strong></div>}</div><div className="two-columns"><section className="panel inner-panel"><div className="panel-head"><h3>Materiais do pedido</h3></div>{detail.materials.length === 0 ? <p className="muted">Nenhum material planejado.</p> : <div className="table-wrap"><table><thead><tr><th>Material</th><th>Planejado</th><th>Reservado</th><th>Consumido</th><th>Devolvido</th></tr></thead><tbody>{detail.materials.map((item: any) => <tr key={item.id}><td>{item.material_name}</td><td>{item.planned_qty} {item.unit}</td><td>{item.reserved_qty} {item.unit}</td><td>{item.consumed_qty} {item.unit}</td><td>{item.returned_qty} {item.unit}</td></tr>)}</tbody></table></div>}</section><section className="panel inner-panel"><div className="panel-head"><div><h3>Confirmar consumo</h3><p>A baixa respeita a unidade de estoque cadastrada: unidade, chapa, rolo, litro, metro ou m².</p></div></div>{locked ? <p className="muted">Consumo bloqueado para pedido {labels[detail.order.status].toLowerCase()}.</p> : <div className="stack-form"><label><span>Material</span><select value={consume.material_id} onChange={(event) => setConsume({ ...consume, material_id: event.target.value, mode: "quantity" })}>{materials.filter((material) => material.active !== 0).map((material) => <option key={material.id} value={material.id}>{material.name} — saldo {Number(material.current_stock).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {material.unit}</option>)}</select></label>{selectedMaterial?.unit === "m2" && <div className="consumption-mode"><button className={consume.mode === "quantity" ? "active" : ""} onClick={() => setConsume({ ...consume, mode: "quantity" })}>Informar m²</button><button className={consume.mode === "dimensions" ? "active" : ""} onClick={() => setConsume({ ...consume, mode: "dimensions" })}>Calcular por medidas</button></div>}{selectedMaterial?.unit === "m2" && consume.mode === "dimensions" ? <div className="area-calculator"><label><span>Largura (mm)</span><input type="number" min="1" step="1" value={consume.width_mm} onChange={(event) => setConsume({ ...consume, width_mm: Number(event.target.value) })} /></label><label><span>Altura (mm)</span><input type="number" min="1" step="1" value={consume.height_mm} onChange={(event) => setConsume({ ...consume, height_mm: Number(event.target.value) })} /></label><label><span>Quantidade de peças</span><input type="number" min="1" step="1" value={consume.pieces} onChange={(event) => setConsume({ ...consume, pieces: Number(event.target.value) })} /></label><div className="calculated-area"><span>Área calculada</span><strong>{calculatedArea.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m²</strong></div></div> : <label><span>Quantidade consumida ({selectedMaterial?.unit || "un"})</span><input type="number" min={(["un", "chapa", "rolo", "lata", "kit", "pct"].includes(selectedMaterial?.unit) ? 1 : 0.001)} step={(["un", "chapa", "rolo", "lata", "kit", "pct"].includes(selectedMaterial?.unit) ? 1 : 0.001)} value={consume.quantity} onChange={(event) => setConsume({ ...consume, quantity: Number(event.target.value) })} /></label>}<input placeholder="Observação" value={consume.notes} onChange={(event) => setConsume({ ...consume, notes: event.target.value })} /><button className="primary-button" disabled={selectedMaterial?.unit === "m2" && consume.mode === "dimensions" && calculatedArea <= 0} onClick={() => void confirmConsume()}>Confirmar baixa</button></div>}</section></div><section className="panel inner-panel"><div className="panel-head"><div><h3>Produção</h3><p>Avance o pedido pela linha de produção.</p></div>{!locked && <div className="inline-actions"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="briefing">Briefing</option><option value="design">Criação / arte</option><option value="printing">Impressão</option><option value="finishing">Acabamento</option><option value="installation">Instalação</option><option value="completed">Concluído</option></select><button className="secondary-button" onClick={() => void changeStage()}>Avançar etapa</button></div>}</div><div className="timeline">{detail.steps.map((step: any) => <div key={step.id} className={`timeline-item ${step.status}`}><i /><div><strong>{step.stage}</strong><small>{step.status} · {step.assignee_name || "Sem responsável"}</small></div></div>)}</div></section><section className="panel inner-panel"><div className="panel-head"><div><h3>Histórico e movimentações</h3><p>Cada evento mantém um snapshot auditável e pode gerar seu próprio PDF.</p></div></div>{!detail.events?.length ? <p className="muted">Nenhuma movimentação registrada.</p> : <div className="event-list">{detail.events.map((event: any) => <article className="event-row" key={event.id}><div className="event-dot" /><div className="event-content"><strong>{event.label}</strong><small>{dateTimeBR(event.created_at)} · {event.user_name || "Sistema"} · {labels[event.status] || event.status || "—"}</small>{event.notes && <p>{event.notes}</p>}</div><button className="secondary-button" onClick={() => printEvent(event.id)}>Imprimir PDF</button></article>)}</div>}</section></Modal>;
}
