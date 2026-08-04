import { useEffect, useState } from "react";
import { api, dateBR } from "../lib/api";
import { Badge, EmptyState, Loading, PageHeader } from "../components/UI";

const columns = [
  ["approved", "Aprovado"], ["production", "Em produção"], ["finishing", "Acabamento"], ["installation", "Instalação"], ["completed", "Concluído"],
] as const;

export function ProductionPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const data = await api<{ items: any[] }>("/orders"); setItems(data.items); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const move = async (order: any, stage: string) => { await api(`/orders/${order.id}/stage`, { method: "POST", body: JSON.stringify({ stage }) }); await load(); };
  const nextStage: Record<string, string> = { approved: "printing", production: "finishing", finishing: "installation", installation: "completed" };
  return <><PageHeader eyebrow="CHÃO DE FÁBRICA" title="Produção e andamento" description="Acompanhe cada OS desde a aprovação até a instalação e conclusão." />{loading ? <Loading /> : <div className="kanban">{columns.map(([status, label]) => { const list = items.filter((item) => item.status === status); return <section key={status} className="kanban-column"><div className="kanban-head"><strong>{label}</strong><Badge>{list.length}</Badge></div><div className="kanban-list">{list.length === 0 ? <EmptyState title="Sem pedidos" text="Nenhuma OS nesta etapa." /> : list.map((order) => <article className="kanban-card" key={order.id}><div className="kanban-code">{order.code}<Badge tone={order.priority === "urgent" ? "danger" : "neutral"}>{order.priority}</Badge></div><h3>{order.title}</h3><p>{order.customer_name || "Sem cliente"}</p><div className="kanban-meta"><span>Entrega</span><strong>{dateBR(order.due_date)}</strong></div>{nextStage[status] && <button className="secondary-button full" onClick={() => void move(order, nextStage[status])}>Avançar etapa →</button>}</article>)}</div></section>; })}</div>}</>;
}
