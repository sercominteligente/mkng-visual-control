import { useEffect, useMemo, useState } from "react";
import { api, brl, dateTimeBR } from "../lib/api";
import { Modal } from "../components/Modal";
import { Badge, EmptyState, Loading, PageHeader, StatCard } from "../components/UI";
import { LossForm } from "../components/LossForm";
import type { User } from "../components/Layout";

const typeLabels: Record<string, string> = {
  operational: "Operacional",
  setup: "Configuração",
  human_error: "Erro humano",
  material_defect: "Defeito do material",
  scrap: "Sobra não reaproveitável",
};

const typeTones: Record<string, string> = {
  operational: "danger",
  setup: "warning",
  human_error: "purple",
  material_defect: "info",
  scrap: "neutral",
};

function monthStart(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function qty(value: unknown): string {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function LossesPage({ user }: { user: User }) {
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, totalCost: 0, reprints: 0, topReason: "—", topMachine: "—", topOperator: "—" });
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [losses, orderData, materialData] = await Promise.all([
        api<{ items: any[]; stats: any }>(`/losses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api<{ items: any[] }>("/orders"),
        api<{ items: any[] }>("/materials"),
      ]);
      setItems(losses.items); setStats(losses.stats); setOrders(orderData.items); setMaterials(materialData.items); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as perdas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeCount = useMemo(() => items.filter((item) => item.status === "confirmed").length, [items]);

  const reverse = async (item: any) => {
    const reason = window.prompt(`Estornar a perda de ${item.material_name}?\n\nInforme o motivo do estorno.`);
    if (!reason?.trim()) return;
    try {
      await api(`/losses/${item.id}/reverse`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setNotice("Perda estornada e saldo devolvido ao estoque.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível estornar a perda");
    }
  };

  const printReport = () => window.open(`/api/reports/losses/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, "_blank", "noopener,noreferrer");

  return <>
    <PageHeader
      eyebrow="CONTROLE DE DESPERDÍCIOS"
      title="Perdas e reimpressões"
      description="Registre falhas, refugos e reimpressões para manter o estoque e o custo real de cada Job corretos."
      action={<div className="header-actions"><button className="secondary-button" onClick={printReport}>Gerar PDF</button><button className="primary-button" onClick={() => setOpen(true)}>+ Registrar perda</button></div>}
    />
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <div className="stats-grid loss-stats">
      <StatCard label="Perdas no período" value={stats.total ?? activeCount} detail="Registros confirmados" tone="red" />
      <StatCard label="Custo estimado" value={brl(stats.totalCost || 0)} detail="Material baixado como perda" tone="orange" />
      <StatCard label="Reimpressões" value={stats.reprints || 0} detail="Reposições solicitadas" tone="purple" />
      <StatCard label="Motivo recorrente" value={stats.topReason || "—"} detail="Maior frequência no período" tone="green" />
      <StatCard label="Máquina recorrente" value={stats.topMachine || "—"} detail="Equipamento com mais registros" tone="orange" />
      <StatCard label="Operador recorrente" value={stats.topOperator || "—"} detail="Usuário com mais registros" tone="purple" />
    </div>
    <div className="panel report-filter loss-filter"><label>Data inicial<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Data final<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="secondary-button" onClick={() => void load()}>Atualizar período</button></div>
    <div className="panel table-panel">{loading ? <Loading /> : items.length === 0 ? <EmptyState title="Nenhuma perda registrada" text="Quando ocorrer uma falha de impressão, corte ou acabamento, registre aqui para que a baixa reflita no estoque." /> : <div className="table-wrap"><table><thead><tr><th>Data</th><th>Pedido / OS</th><th>Material</th><th>Tipo</th><th>Quantidade</th><th>Custo</th><th>Etapa / Máquina</th><th>Operador</th><th>Motivo</th><th>Reimpressão</th><th>Status</th>{user.role === "super_admin" && <th>Ações</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className={item.status === "reversed" ? "row-inactive" : ""}><td>{dateTimeBR(item.created_at)}</td><td>{item.order_code ? <><strong>{item.order_code}</strong><small className="cell-sub">{item.order_title}</small></> : "Perda geral"}</td><td><strong>{item.material_name}</strong></td><td><Badge tone={typeTones[item.loss_type]}>{typeLabels[item.loss_type] || item.loss_type}</Badge></td><td className="negative-value">{qty(item.quantity)} {item.unit}</td><td>{brl(item.total_cost)}</td><td>{item.stage_label || item.stage || "—"}<small className="cell-sub">{item.machine || "Sem máquina"}</small></td><td>{item.created_by_name || "Sistema"}</td><td>{item.reason}<small className="cell-sub">{item.notes || ""}</small></td><td>{item.requires_reprint ? <><Badge tone="warning">Sim</Badge><small className="cell-sub">{qty(item.reprint_qty)} {item.unit}</small></> : "Não"}</td><td><Badge tone={item.status === "confirmed" ? "danger" : "neutral"}>{item.status === "confirmed" ? "Confirmada" : "Estornada"}</Badge></td>{user.role === "super_admin" && <td className="actions">{item.status === "confirmed" ? <button className="action-danger" onClick={() => void reverse(item)}>Estornar</button> : <span className="muted">Sem ação</span>}</td>}</tr>)}</tbody></table></div>}</div>
    {open && <Modal title="Registrar perda de material" onClose={() => setOpen(false)} width={980}><LossForm materials={materials} orders={orders} onCancel={() => setOpen(false)} onSaved={async (result) => { setOpen(false); setNotice(`Perda registrada: ${qty(result.quantity)} ${result.unit}. Novo saldo: ${qty(result.newStock)} ${result.unit}.`); await load(); }} /></Modal>}
  </>;
}
