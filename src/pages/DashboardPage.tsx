import { useEffect, useState } from "react";
import { api, brl, dateBR } from "../lib/api";
import { Badge, EmptyState, Loading, PageHeader, StatCard } from "../components/UI";
import { navigate } from "../lib/router";

const toneByStatus: Record<string, string> = {
  draft: "neutral", approved: "info", production: "warning", finishing: "warning", installation: "purple", completed: "success", cancelled: "danger",
};

export function DashboardPage({ userName }: { userName: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then(setData).catch((error) => setError(error.message));
  }, []);

  return (
    <>
      <PageHeader eyebrow="VISÃO GERAL DA OPERAÇÃO" title={`Olá, ${userName.split(" ")[0]}`} description="Acompanhe pedidos, produção, estoque e financeiro em tempo real." action={<button className="primary-button" onClick={() => navigate("/orders")}>+ Novo pedido</button>} />
      {error && <div className="alert error">{error}</div>}
      {!data ? <Loading /> : <>
        <div className="stats-grid five">
          <StatCard label="Pedidos ativos" value={data.activeOrders} detail="Em aberto" />
          <StatCard label="Em produção" value={data.inProduction} detail="Execução e acabamento" tone="purple" />
          <StatCard label="Estoque crítico" value={data.lowStock} detail="No mínimo ou abaixo" tone={data.lowStock ? "red" : "green"} />
          <StatCard label="A receber" value={brl(data.receivable)} detail="Pendências financeiras" tone="green" />
          <StatCard label="A pagar" value={brl(data.payable)} detail="Compromissos em aberto" tone="red" />
        </div>
        <div className="dashboard-grid">
          <div className="panel span-2">
            <div className="panel-head"><div><span className="eyebrow">OPERAÇÃO</span><h3>Pedidos recentes</h3></div><button className="text-button" onClick={() => navigate("/orders")}>Ver todos</button></div>
            {data.recentOrders.length === 0 ? <EmptyState title="Nenhum pedido cadastrado" text="Crie o primeiro pedido para iniciar a operação." /> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Pedido</th><th>Cliente</th><th>Status</th><th>Entrega</th></tr></thead><tbody>{data.recentOrders.map((order: any) => <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="clickable"><td><strong>{order.code}</strong></td><td>{order.title}</td><td>{order.customer_name || "—"}</td><td><Badge tone={toneByStatus[order.status] || "neutral"}>{order.status}</Badge></td><td>{dateBR(order.due_date)}</td></tr>)}</tbody></table></div>}
          </div>
          <div className="panel quick-panel">
            <div className="panel-head"><div><span className="eyebrow">ATALHOS</span><h3>Ações rápidas</h3></div></div>
            <button onClick={() => navigate("/materials")}>Cadastrar material <span>→</span></button>
            <button onClick={() => navigate("/purchases")}>Registrar compra <span>→</span></button>
            <button onClick={() => navigate("/stock")}>Confirmar consumo <span>→</span></button>
            <button onClick={() => navigate("/reports")}>Gerar relatório PDF <span>→</span></button>
          </div>
        </div>
      </>}
    </>
  );
}
