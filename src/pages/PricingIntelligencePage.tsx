import { useEffect, useMemo, useState } from "react";
import { api, brl, dateTimeBR } from "../lib/api";
import { Badge, EmptyState, PageHeader, StatCard } from "../components/UI";

const blankItem = () => ({ description: "", pricing_mode: "area", quantity: 1, width_cm: 0, height_cm: 0, cost_per_m2: 17, cost_per_unit: 0, markup_pct: 200, notes: "" });

type QuoteItem = ReturnType<typeof blankItem> & { id?: string; unit_area_m2?: number; total_area_m2?: number; unit_cost?: number; line_cost?: number; unit_price?: number; line_total?: number };
type QuoteRow = { id: string; code: string; title: string; customer_name?: string; status: string; total_area_m2: number; production_cost: number; sale_total: number; gross_profit: number; market_median?: number; market_confidence?: string; created_at: string; item_count?: number };
type QuoteSnapshot = { quote: QuoteRow & { default_cost_per_m2: number; default_markup_pct: number; region: string; notes?: string; market_low?: number; market_high?: number; market_recommended?: number }; items: QuoteItem[]; scenarios: any[]; marketResearch: any[] };

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function r(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function liveItem(item: QuoteItem, defaultCost: number, defaultMarkup: number) {
  const qty = Math.max(n(item.quantity), 0);
  const mode = item.pricing_mode === "unit" ? "unit" : "area";
  const area = mode === "area" ? r((n(item.width_cm) / 100) * (n(item.height_cm) / 100), 6) : 0;
  const totalArea = r(area * qty, 4);
  const costM2 = n(item.cost_per_m2 || defaultCost);
  const unitCost = mode === "area" ? area * costM2 : n(item.cost_per_unit);
  const lineCost = r(unitCost * qty, 2);
  const markup = n(item.markup_pct ?? defaultMarkup);
  const unitPrice = r(unitCost * (1 + markup / 100), 4);
  const lineTotal = r(lineCost * (1 + markup / 100), 2);
  return { ...item, quantity: qty, unit_area_m2: area, total_area_m2: totalArea, unit_cost: unitCost, line_cost: lineCost, unit_price: unitPrice, line_total: lineTotal };
}

function statusLabel(value: string) {
  return ({ draft: "Rascunho", sent: "Enviado", approved: "Aprovado", rejected: "Recusado", archived: "Arquivado" } as Record<string, string>)[value] || value;
}

export function PricingIntelligencePage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [selected, setSelected] = useState<QuoteSnapshot | null>(null);
  const [insider, setInsider] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [briefing, setBriefing] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [form, setForm] = useState({ id: "", customer_id: "", title: "Orçamento de comunicação visual", status: "draft", region: "Fortaleza/CE", default_cost_per_m2: 17, default_markup_pct: 200, notes: "", items: [blankItem()] as QuoteItem[] });

  const calculated = useMemo(() => {
    const items = form.items.map((item) => liveItem(item, n(form.default_cost_per_m2), n(form.default_markup_pct)));
    const area = r(items.reduce((sum, item) => sum + n(item.total_area_m2), 0), 4);
    const cost = r(items.reduce((sum, item) => sum + n(item.line_cost), 0), 2);
    const sale = r(items.reduce((sum, item) => sum + n(item.line_total), 0), 2);
    const profit = r(sale - cost, 2);
    const margin = sale > 0 ? r((profit / sale) * 100, 2) : 0;
    return { items, area, cost, sale, profit, margin };
  }, [form]);

  const load = async () => {
    try {
      const [quoteData, customerData, analyticsData, healthData] = await Promise.all([
        api<{ items: QuoteRow[] }>("/pricing/quotes"),
        api<{ items: any[] }>("/customers"),
        api<any>("/pricing/analytics"),
        api<any>("/pricing/health"),
      ]);
      setQuotes(quoteData.items);
      setCustomers(customerData.items);
      setAnalytics(analyticsData);
      setHealth(healthData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar inteligência comercial");
    }
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setSelected(null);
    setInsider(null);
    setQuestions([]);
    setForm({ id: "", customer_id: "", title: "Orçamento de comunicação visual", status: "draft", region: "Fortaleza/CE", default_cost_per_m2: 17, default_markup_pct: 200, notes: "", items: [blankItem()] });
  };

  const updateItem = (index: number, key: keyof QuoteItem, value: any) => {
    setForm((current) => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  };

  const addItem = () => setForm((current) => ({ ...current, items: [...current.items, { ...blankItem(), cost_per_m2: current.default_cost_per_m2, markup_pct: current.default_markup_pct }] }));
  const removeItem = (index: number) => setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));

  const save = async () => {
    setBusy("save"); setError("");
    try {
      const payload = { ...form, items: calculated.items };
      const result = form.id
        ? await api<QuoteSnapshot>(`/pricing/quotes/${form.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<QuoteSnapshot>("/pricing/quotes", { method: "POST", body: JSON.stringify(payload) });
      setSelected(result);
      setForm((current) => ({ ...current, id: result.quote.id }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar orçamento"); }
    finally { setBusy(""); }
  };

  const openQuote = async (id: string) => {
    setBusy(`quote-${id}`); setError(""); setInsider(null);
    try {
      const snapshot = await api<QuoteSnapshot>(`/pricing/quotes/${id}`);
      setSelected(snapshot);
      setForm({
        id: snapshot.quote.id,
        customer_id: (snapshot.quote as any).customer_id || "",
        title: snapshot.quote.title,
        status: snapshot.quote.status,
        region: snapshot.quote.region || "Fortaleza/CE",
        default_cost_per_m2: n(snapshot.quote.default_cost_per_m2),
        default_markup_pct: n(snapshot.quote.default_markup_pct),
        notes: snapshot.quote.notes || "",
        items: snapshot.items.map((item) => ({ ...item } as QuoteItem)),
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao abrir orçamento"); }
    finally { setBusy(""); }
  };

  const askEstimator = async () => {
    setBusy("assistant"); setError(""); setQuestions([]);
    try {
      const result = await api<any>("/pricing/assistant", { method: "POST", body: JSON.stringify({ description: briefing, region: form.region, default_cost_per_m2: form.default_cost_per_m2, default_markup_pct: form.default_markup_pct }) });
      const items = Array.isArray(result.items) && result.items.length ? result.items : [blankItem()];
      setForm((current) => ({ ...current, title: result.title || current.title, items: items.map((item: any) => ({ ...blankItem(), ...item })) }));
      setQuestions(Array.isArray(result.questions) ? result.questions : []);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no Orçamentista IA"); }
    finally { setBusy(""); }
  };

  const researchMarket = async () => {
    if (!form.id) { setError("Salve o orçamento antes de pesquisar o mercado."); return; }
    setBusy("market"); setError("");
    try {
      await api(`/pricing/quotes/${form.id}/market-research`, { method: "POST" });
      await openQuote(form.id);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no Analytics de Mercado"); }
    finally { setBusy(""); }
  };

  const runInsider = async () => {
    if (!form.id) { setError("Salve o orçamento antes de rodar o Insider."); return; }
    setBusy("insider"); setError("");
    try { setInsider(await api(`/pricing/quotes/${form.id}/insider?ai=1`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha no Insider"); }
    finally { setBusy(""); }
  };

  const openPdf = (view: "commercial" | "internal") => {
    if (!form.id) { setError("Salve o orçamento antes de gerar o PDF."); return; }
    window.open(`/api/pricing/quotes/${encodeURIComponent(form.id)}/pdf?view=${view}&v=${Date.now()}`, "_blank", "noopener,noreferrer");
  };

  const latestMarket = selected?.marketResearch?.[0];
  const summary = analytics?.summary || {};

  return <>
    <PageHeader
      eyebrow="INTELIGÊNCIA COMERCIAL MKNG"
      title="Orçamentista IA + Insider + Analytics"
      description="Calcule custo real, compare markups, pesquise o mercado e proteja a margem antes de enviar a proposta."
      action={<button className="ghost-button" onClick={reset}>Novo orçamento</button>}
    />

    {error && <div className="pricing-alert pricing-alert-error">{error}</div>}
    {!health?.aiConfigured && <div className="pricing-alert">Os cálculos funcionam normalmente. Para usar Orçamentista IA, Insider IA e pesquisa web, configure o Secret OPENAI_API_KEY no Worker.</div>}

    <div className="pricing-agent-grid">
      <article className="pricing-agent"><span>01</span><h3>Orçamentista IA</h3><p>Transforma briefing em itens, medidas e estrutura de cálculo. O preço final continua sob aprovação humana.</p></article>
      <article className="pricing-agent"><span>02</span><h3>Insider</h3><p>Enxerga margem, risco, desconto e proteção contra retrabalho usando os números internos do orçamento.</p></article>
      <article className="pricing-agent"><span>03</span><h3>Analytics de Mercado</h3><p>Pesquisa referências atuais e separa faixa encontrada de recomendação comercial, com fontes e confiança.</p></article>
    </div>

    <div className="stats-grid pricing-stats">
      <StatCard label="Orçamentos" value={summary.quote_count || 0} detail="histórico do módulo" />
      <StatCard label="Valor orçado" value={brl(summary.sales || 0)} detail="soma das propostas" tone="purple" />
      <StatCard label="Lucro bruto projetado" value={brl(summary.profit || 0)} detail={`${n(summary.realized_margin_pct)}% sobre venda`} tone="green" />
      <StatCard label="Markup médio" value={`${r(n(summary.avg_markup))}%`} detail="acréscimo sobre custo" tone="blue" />
    </div>

    <section className="panel pricing-ai-brief">
      <div className="pricing-section-title"><div><span className="eyebrow">ORÇAMENTISTA IA</span><h2>Descreva o serviço em linguagem natural</h2></div><Badge tone={health?.aiConfigured ? "success" : "neutral"}>{health?.aiConfigured ? `IA ativa · ${health.model}` : "IA aguardando chave"}</Badge></div>
      <textarea rows={4} value={briefing} onChange={(event) => setBriefing(event.target.value)} placeholder="Ex.: 50 mil adesivos 10 x 10 cm, 10 mil leitosos 10 x 30 cm e mil perfurados 80 x 40 cm. Custo base R$ 17/m² e 200% sobre o custo." />
      <div className="pricing-action-row"><button className="primary-button" disabled={busy === "assistant" || briefing.trim().length < 10} onClick={askEstimator}>{busy === "assistant" ? "Interpretando..." : "Montar orçamento com IA"}</button><small>A IA estrutura o briefing. Medidas, materiais e custos devem ser conferidos antes do envio.</small></div>
      {!!questions.length && <div className="pricing-questions"><strong>Confirmações necessárias</strong>{questions.map((question, index) => <p key={index}>• {question}</p>)}</div>}
    </section>

    <section className="panel">
      <div className="pricing-section-title"><div><span className="eyebrow">MEMÓRIA DE CÁLCULO</span><h2>{form.id ? `Editando ${selected?.quote.code || "orçamento"}` : "Novo orçamento"}</h2></div><Badge tone={form.id ? "success" : "neutral"}>{form.id ? "Salvo" : "Rascunho local"}</Badge></div>
      <div className="pricing-form-grid">
        <label>Cliente<select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">A definir</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Região<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></label>
        <label>Custo padrão / m²<input type="number" step="0.01" min="0" value={form.default_cost_per_m2} onChange={(event) => setForm({ ...form, default_cost_per_m2: n(event.target.value) })} /></label>
        <label>Markup padrão sobre custo<input type="number" step="1" min="0" value={form.default_markup_pct} onChange={(event) => setForm({ ...form, default_markup_pct: n(event.target.value) })} /></label>
        <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Rascunho</option><option value="sent">Enviado</option><option value="approved">Aprovado</option><option value="rejected">Recusado</option><option value="archived">Arquivado</option></select></label>
      </div>

      <div className="pricing-items-head"><h3>Itens</h3><button className="ghost-button" onClick={addItem}>+ Adicionar item</button></div>
      <div className="pricing-table-wrap">
        <table className="pricing-table"><thead><tr><th>Descrição</th><th>Modo</th><th>Qtd.</th><th>L x A (cm)</th><th>Custo base</th><th>Markup</th><th>Área total</th><th>Unitário venda</th><th>Total</th><th /></tr></thead>
          <tbody>{calculated.items.map((item, index) => <tr key={index}>
            <td><input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} placeholder="Material / serviço" /></td>
            <td><select value={item.pricing_mode} onChange={(event) => updateItem(index, "pricing_mode", event.target.value)}><option value="area">Por m²</option><option value="unit">Por unidade</option></select></td>
            <td><input className="compact" type="number" min="0" step="1" value={item.quantity} onChange={(event) => updateItem(index, "quantity", n(event.target.value))} /></td>
            <td>{item.pricing_mode === "area" ? <div className="pricing-dimensions"><input type="number" min="0" value={item.width_cm} onChange={(event) => updateItem(index, "width_cm", n(event.target.value))} /><span>×</span><input type="number" min="0" value={item.height_cm} onChange={(event) => updateItem(index, "height_cm", n(event.target.value))} /></div> : <span className="muted">unitário</span>}</td>
            <td>{item.pricing_mode === "area" ? <input type="number" min="0" step="0.01" value={item.cost_per_m2} onChange={(event) => updateItem(index, "cost_per_m2", n(event.target.value))} /> : <input type="number" min="0" step="0.01" value={item.cost_per_unit} onChange={(event) => updateItem(index, "cost_per_unit", n(event.target.value))} />}</td>
            <td><input className="compact" type="number" min="0" step="1" value={item.markup_pct} onChange={(event) => updateItem(index, "markup_pct", n(event.target.value))} /></td>
            <td>{item.pricing_mode === "area" ? `${n(item.total_area_m2).toLocaleString("pt-BR")} m²` : "—"}</td>
            <td><strong>{brl(item.unit_price || 0)}</strong></td><td><strong>{brl(item.line_total || 0)}</strong></td>
            <td><button className="icon-danger" onClick={() => removeItem(index)} disabled={form.items.length === 1}>×</button></td>
          </tr>)}</tbody>
        </table>
      </div>

      <div className="pricing-total-grid">
        <div><span>Área total</span><strong>{calculated.area.toLocaleString("pt-BR")} m²</strong></div>
        <div><span>Custo interno</span><strong>{brl(calculated.cost)}</strong></div>
        <div><span>Venda</span><strong>{brl(calculated.sale)}</strong></div>
        <div><span>Lucro bruto</span><strong>{brl(calculated.profit)}</strong></div>
        <div><span>Margem sobre venda</span><strong>{calculated.margin}%</strong></div>
      </div>

      <div className="pricing-scenario-strip">
        {[100, n(form.default_markup_pct), 200].filter((value, index, arr) => arr.indexOf(value) === index).sort((a, b) => a - b).map((markup) => {
          const sale = calculated.cost * (1 + markup / 100); const profit = sale - calculated.cost; const margin = sale > 0 ? (profit / sale) * 100 : 0;
          return <button key={markup} className={markup === n(form.default_markup_pct) ? "active" : ""} onClick={() => setForm({ ...form, default_markup_pct: markup, items: form.items.map((item) => ({ ...item, markup_pct: markup })) })}><span>{markup}% sobre custo</span><strong>{brl(sale)}</strong><small>margem {r(margin)}%</small></button>;
        })}
      </div>

      <label className="pricing-notes">Observações<textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <div className="pricing-action-row pricing-actions-main">
        <button className="primary-button" disabled={busy === "save"} onClick={save}>{busy === "save" ? "Salvando..." : form.id ? "Salvar alterações" : "Salvar orçamento"}</button>
        <button className="ghost-button" disabled={!form.id} onClick={() => openPdf("commercial")}>PDF comercial</button>
        <button className="ghost-button" disabled={!form.id} onClick={() => openPdf("internal")}>Memória interna</button>
        <button className="ghost-button" disabled={!form.id || busy === "insider"} onClick={runInsider}>{busy === "insider" ? "Analisando..." : "Rodar Insider"}</button>
        <button className="ghost-button" disabled={!form.id || busy === "market"} onClick={researchMarket}>{busy === "market" ? "Pesquisando web..." : "Pesquisar mercado"}</button>
      </div>
    </section>

    {(selected || insider) && <div className="pricing-intelligence-grid">
      <section className="panel">
        <div className="pricing-section-title"><div><span className="eyebrow">INSIDER</span><h2>Proteção de margem</h2></div>{insider && <Badge tone={insider.risk === "alto" ? "danger" : insider.risk === "moderado" ? "warning" : "success"}>Risco {insider.risk}</Badge>}</div>
        {!insider ? <EmptyState title="Análise ainda não executada" text="Salve o orçamento e clique em Rodar Insider para avaliar rentabilidade e negociação." /> : <>
          <div className="pricing-insider-metrics"><div><span>Margem</span><strong>{insider.margin_pct}%</strong></div><div><span>Venda atual</span><strong>{brl(insider.negotiation?.current)}</strong></div><div><span>Com 10% desconto</span><strong>{brl(insider.negotiation?.ten_percent_discount)}</strong></div><div><span>Lucro após desconto</span><strong>{brl(insider.negotiation?.gross_profit_after_discount)}</strong></div></div>
          <div className="pricing-findings">{(insider.findings || []).map((finding: string, index: number) => <p key={index}>• {finding}</p>)}</div>
          {insider.ai_analysis && <div className="pricing-ai-analysis"><strong>Análise do Insider IA</strong><p>{insider.ai_analysis}</p></div>}
        </>}
      </section>

      <section className="panel">
        <div className="pricing-section-title"><div><span className="eyebrow">ANALYTICS DE MERCADO</span><h2>Faixa externa pesquisada</h2></div>{latestMarket && <Badge tone={latestMarket.confidence === "alta" ? "success" : latestMarket.confidence === "media" ? "warning" : "neutral"}>Confiança {latestMarket.confidence}</Badge>}</div>
        {!latestMarket ? <EmptyState title="Sem pesquisa vinculada" text="Clique em Pesquisar mercado para consultar referências públicas atuais para este escopo." /> : <>
          <div className="pricing-market-range"><div><span>Faixa baixa</span><strong>{brl(latestMarket.low_price)}</strong></div><div><span>Mediana</span><strong>{brl(latestMarket.median_price)}</strong></div><div><span>Faixa alta</span><strong>{brl(latestMarket.high_price)}</strong></div><div><span>Referência sugerida</span><strong>{brl(latestMarket.recommended_price)}</strong></div></div>
          <p className="pricing-market-summary">{latestMarket.summary}</p>
          {!!latestMarket.sources?.length && <div className="pricing-sources"><strong>Fontes consultadas</strong>{latestMarket.sources.map((source: any, index: number) => <a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}</div>}
          <small className="muted">Preço de mercado é referência, não tabela oficial. Escopo, acabamento, instalação, frete, prazo e volume podem alterar substancialmente a comparação.</small>
        </>}
      </section>
    </div>}

    <section className="panel">
      <div className="pricing-section-title"><div><span className="eyebrow">HISTÓRICO</span><h2>Orçamentos salvos</h2></div><span className="muted">{quotes.length} registros</span></div>
      {!quotes.length ? <EmptyState title="Nenhum orçamento salvo" text="Crie o primeiro orçamento acima para iniciar o histórico e os indicadores." /> : <div className="pricing-table-wrap"><table className="pricing-table pricing-history"><thead><tr><th>Código</th><th>Título</th><th>Cliente</th><th>Status</th><th>Área</th><th>Venda</th><th>Lucro</th><th>Mercado</th><th>Emissão</th><th /></tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id}><td><strong>{quote.code}</strong></td><td>{quote.title}</td><td>{quote.customer_name || "A definir"}</td><td><Badge>{statusLabel(quote.status)}</Badge></td><td>{n(quote.total_area_m2).toLocaleString("pt-BR")} m²</td><td>{brl(quote.sale_total)}</td><td>{brl(quote.gross_profit)}</td><td>{quote.market_median ? brl(quote.market_median) : "—"}</td><td>{dateTimeBR(quote.created_at)}</td><td><button className="ghost-button compact-button" disabled={busy === `quote-${quote.id}`} onClick={() => openQuote(quote.id)}>Abrir</button></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
