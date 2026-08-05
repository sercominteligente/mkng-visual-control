import { useState } from "react";
import { PageHeader } from "../components/UI";

const reports = [
  { type: "orders", title: "Pedidos e produção", text: "Pedidos criados, clientes, prazos, status e valores." },
  { type: "stock", title: "Posição de estoque", text: "Saldo, estoque mínimo, custo médio e localização dos materiais." },
  { type: "movements", title: "Movimentações de estoque", text: "Entradas, consumos, devoluções e ajustes por período." },
  { type: "finance", title: "Financeiro", text: "Contas a receber e pagar no período selecionado." },
];

export function ReportsPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const open = (type: string) => {
    const params = new URLSearchParams({ from, to, v: String(Date.now()) });
    window.open(`/api/reports/${encodeURIComponent(type)}/pdf?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return <>
    <PageHeader
      eyebrow="DOCUMENTOS GERENCIAIS"
      title="Relatórios em PDF"
      description="Gere documentos gerenciais com a identidade visual configurada no sistema."
    />
    <div className="panel report-filter">
      <label>Data inicial<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Data final<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </div>
    <div className="report-grid">
      {reports.map((report) => <article className="report-card" key={report.type}>
        <div className="report-icon">PDF</div>
        <h3>{report.title}</h3>
        <p>{report.text}</p>
        <button className="primary-button" onClick={() => open(report.type)}>Gerar relatório</button>
      </article>)}
    </div>
  </>;
}
