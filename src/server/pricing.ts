import type { Hono } from "hono";
import { buildReportPdf } from "./pdf";
import type { AppEnv } from "./types";

const PRICING_ROLES = new Set(["super_admin", "admin", "manager", "finance"]);

function uid(): string {
  return crypto.randomUUID();
}

function isoNow(): string {
  return new Date().toISOString();
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: unknown, decimals = 2): number {
  const n = number(value);
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function brl(value: unknown): string {
  return number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function quoteCode(): string {
  const date = new Date();
  const compact = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `ORC-${compact}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function requirePricingUser(c: any): Response | null {
  const user = c.get("user");
  if (!user || !PRICING_ROLES.has(user.role)) return c.json({ error: "Acesso ao módulo de inteligência comercial não autorizado" }, 403);
  return null;
}

function parseJsonBlock(text: string): any {
  const trimmed = String(text ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try { return JSON.parse(candidate); } catch { /* tenta recorte */ }
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
  throw new Error("A IA não retornou JSON válido");
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractSources(response: any): Array<{ title: string; url: string }> {
  const found = new Map<string, { title: string; url: string }>();
  const walk = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) {
      found.set(value.url, { title: String(value.title || value.name || new URL(value.url).hostname), url: value.url });
    }
    if (Array.isArray(value)) value.forEach(walk);
    else Object.values(value).forEach(walk);
  };
  walk(response?.output);
  return [...found.values()].slice(0, 20);
}

async function callOpenAI(env: AppEnv["Bindings"], prompt: string, useWebSearch = false): Promise<{ text: string; sources: Array<{ title: string; url: string }>; raw: any; model: string }> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada. Cadastre o Secret no Cloudflare antes de usar os agentes IA.");
  const model = env.OPENAI_PRICING_MODEL || "gpt-5.6";
  const payload: Record<string, any> = { model, input: prompt };
  if (useWebSearch) payload.tools = [{ type: "web_search" }];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await response.json<any>();
  if (!response.ok) throw new Error(raw?.error?.message || `Falha na IA (${response.status})`);
  const text = extractOutputText(raw);
  if (!text) throw new Error("A IA respondeu sem conteúdo utilizável");
  return { text, sources: extractSources(raw), raw, model };
}

function calculateItem(raw: any, defaults: { costPerM2: number; markupPct: number }, index: number) {
  const pricingMode = raw.pricing_mode === "unit" ? "unit" : "area";
  const quantity = Math.max(number(raw.quantity, 1), 0);
  const widthCm = Math.max(number(raw.width_cm), 0);
  const heightCm = Math.max(number(raw.height_cm), 0);
  const unitAreaM2 = pricingMode === "area" ? round((widthCm / 100) * (heightCm / 100), 6) : 0;
  const totalAreaM2 = pricingMode === "area" ? round(unitAreaM2 * quantity, 4) : 0;
  const costPerM2 = Math.max(number(raw.cost_per_m2, defaults.costPerM2), 0);
  const costPerUnit = Math.max(number(raw.cost_per_unit), 0);
  const markupPct = Math.max(number(raw.markup_pct, defaults.markupPct), 0);
  const unitCost = pricingMode === "area" ? round(unitAreaM2 * costPerM2, 4) : round(costPerUnit, 4);
  const lineCost = round(unitCost * quantity, 2);
  const factor = 1 + markupPct / 100;
  const unitPrice = round(unitCost * factor, 4);
  const lineTotal = round(lineCost * factor, 2);
  return {
    id: raw.id || uid(),
    description: String(raw.description || `Item ${index + 1}`).trim(),
    pricing_mode: pricingMode,
    quantity,
    width_cm: widthCm,
    height_cm: heightCm,
    unit_area_m2: unitAreaM2,
    total_area_m2: totalAreaM2,
    cost_per_m2: costPerM2,
    cost_per_unit: costPerUnit,
    markup_pct: markupPct,
    unit_cost: unitCost,
    line_cost: lineCost,
    unit_price: unitPrice,
    line_total: lineTotal,
    notes: raw.notes ? String(raw.notes) : null,
    sort_order: index,
  };
}

function calculateQuote(rawItems: any[], costPerM2: number, markupPct: number) {
  const items = (Array.isArray(rawItems) ? rawItems : []).map((item, index) => calculateItem(item, { costPerM2, markupPct }, index));
  const totalAreaM2 = round(items.reduce((sum, item) => sum + item.total_area_m2, 0), 4);
  const productionCost = round(items.reduce((sum, item) => sum + item.line_cost, 0), 2);
  const saleTotal = round(items.reduce((sum, item) => sum + item.line_total, 0), 2);
  const grossProfit = round(saleTotal - productionCost, 2);
  const marginPct = saleTotal > 0 ? round((grossProfit / saleTotal) * 100, 2) : 0;
  return { items, totalAreaM2, productionCost, saleTotal, grossProfit, marginPct };
}

function scenarioFromCost(productionCost: number, markupPct: number, label?: string) {
  const saleTotal = round(productionCost * (1 + markupPct / 100), 2);
  const grossProfit = round(saleTotal - productionCost, 2);
  const marginPct = saleTotal > 0 ? round((grossProfit / saleTotal) * 100, 2) : 0;
  return { id: uid(), label: label || `${markupPct}% sobre custo`, markup_pct: markupPct, sale_total: saleTotal, gross_profit: grossProfit, margin_pct: marginPct };
}

function defaultScenarios(productionCost: number, selectedMarkup: number) {
  const values = [...new Set([100, selectedMarkup, 200].map((value) => round(value, 2)))].sort((a, b) => a - b);
  return values.map((value) => scenarioFromCost(productionCost, value, value === selectedMarkup ? `Atual · ${value}%` : `${value}% sobre custo`));
}

async function loadQuote(env: AppEnv["Bindings"], quoteId: string): Promise<any | null> {
  const quote = await env.DB.prepare(
    `SELECT q.*,c.name AS customer_name,u.name AS created_by_name
       FROM pricing_quotes q
       LEFT JOIN customers c ON c.id=q.customer_id
       LEFT JOIN users u ON u.id=q.created_by
      WHERE q.id=?`,
  ).bind(quoteId).first<any>();
  if (!quote) return null;
  const [items, scenarios, research] = await Promise.all([
    env.DB.prepare("SELECT * FROM pricing_quote_items WHERE quote_id=? ORDER BY sort_order,rowid").bind(quoteId).all<any>(),
    env.DB.prepare("SELECT * FROM pricing_scenarios WHERE quote_id=? ORDER BY markup_pct").bind(quoteId).all<any>(),
    env.DB.prepare("SELECT * FROM pricing_market_research WHERE quote_id=? ORDER BY created_at DESC LIMIT 10").bind(quoteId).all<any>(),
  ]);
  return {
    quote,
    items: items.results,
    scenarios: scenarios.results,
    marketResearch: research.results.map((row: any) => ({ ...row, sources: row.sources_json ? JSON.parse(row.sources_json) : [] })),
  };
}

async function saveQuote(c: any, quoteId: string | null, data: any): Promise<any> {
  const title = String(data.title || "Orçamento de comunicação visual").trim();
  const costPerM2 = Math.max(number(data.default_cost_per_m2, 0), 0);
  const markupPct = Math.max(number(data.default_markup_pct, 100), 0);
  const calculated = calculateQuote(data.items, costPerM2, markupPct);
  if (!calculated.items.length) return { error: c.json({ error: "Adicione pelo menos um item ao orçamento" }, 400) };
  if (calculated.items.some((item) => item.quantity <= 0)) return { error: c.json({ error: "Todos os itens precisam ter quantidade maior que zero" }, 400) };
  if (calculated.items.some((item) => item.pricing_mode === "area" && (item.width_cm <= 0 || item.height_cm <= 0))) {
    return { error: c.json({ error: "Itens por m² precisam ter largura e altura maiores que zero" }, 400) };
  }
  const id = quoteId || uid();
  const existing = quoteId ? await c.env.DB.prepare("SELECT id,code,created_by FROM pricing_quotes WHERE id=?").bind(id).first<any>() : null;
  if (quoteId && !existing) return { error: c.json({ error: "Orçamento não encontrado" }, 404) };
  const code = existing?.code || quoteCode();
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(c.env.DB.prepare(
      `UPDATE pricing_quotes SET customer_id=?,title=?,status=?,region=?,default_cost_per_m2=?,default_markup_pct=?,total_area_m2=?,production_cost=?,sale_total=?,gross_profit=?,notes=?,updated_at=? WHERE id=?`,
    ).bind(data.customer_id || null, title, data.status || "draft", data.region || "Fortaleza/CE", costPerM2, markupPct, calculated.totalAreaM2, calculated.productionCost, calculated.saleTotal, calculated.grossProfit, data.notes || null, isoNow(), id));
    statements.push(c.env.DB.prepare("DELETE FROM pricing_quote_items WHERE quote_id=?").bind(id));
    statements.push(c.env.DB.prepare("DELETE FROM pricing_scenarios WHERE quote_id=?").bind(id));
  } else {
    statements.push(c.env.DB.prepare(
      `INSERT INTO pricing_quotes (id,code,customer_id,title,status,region,default_cost_per_m2,default_markup_pct,total_area_m2,production_cost,sale_total,gross_profit,notes,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, code, data.customer_id || null, title, data.status || "draft", data.region || "Fortaleza/CE", costPerM2, markupPct, calculated.totalAreaM2, calculated.productionCost, calculated.saleTotal, calculated.grossProfit, data.notes || null, c.get("user").id, isoNow(), isoNow()));
  }
  for (const item of calculated.items) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO pricing_quote_items (id,quote_id,description,pricing_mode,quantity,width_cm,height_cm,unit_area_m2,total_area_m2,cost_per_m2,cost_per_unit,markup_pct,unit_cost,line_cost,unit_price,line_total,notes,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(item.id, id, item.description, item.pricing_mode, item.quantity, item.width_cm, item.height_cm, item.unit_area_m2, item.total_area_m2, item.cost_per_m2, item.cost_per_unit, item.markup_pct, item.unit_cost, item.line_cost, item.unit_price, item.line_total, item.notes, item.sort_order));
  }
  const scenarios = defaultScenarios(calculated.productionCost, markupPct);
  for (const scenario of scenarios) {
    statements.push(c.env.DB.prepare(
      "INSERT INTO pricing_scenarios (id,quote_id,label,markup_pct,sale_total,gross_profit,margin_pct) VALUES (?,?,?,?,?,?,?)",
    ).bind(scenario.id, id, scenario.label, scenario.markup_pct, scenario.sale_total, scenario.gross_profit, scenario.margin_pct));
  }
  await c.env.DB.batch(statements);
  return { id, code, calculated, scenarios };
}

function marketPrompt(snapshot: any): string {
  const q = snapshot.quote;
  const itemLines = snapshot.items.map((item: any) => {
    const dimensions = item.pricing_mode === "area" ? `${item.width_cm} x ${item.height_cm} cm` : "precificação por unidade";
    return `- ${item.description}: ${item.quantity} un, ${dimensions}, área total ${item.total_area_m2 || 0} m²`;
  }).join("\n");
  return `Você é um analista de preços do mercado brasileiro de comunicação visual. Faça pesquisa WEB atual para comparar o orçamento abaixo com preços publicamente anunciados por empresas, gráficas, bureaus, marketplaces e fornecedores. Priorize fontes do Brasil e, quando possível, da região ${q.region}. Não invente preços nem fontes. Diferencie impressão/material de instalação, frete, acabamento especial e criação de arte. Grandes tiragens normalmente têm preço unitário menor: leve volume em conta.\n\nPROJETO\n${q.title}\n${itemLines}\nÁrea total: ${q.total_area_m2} m²\nPreço interno calculado: ${brl(q.sale_total)}\n\nRetorne APENAS JSON válido neste formato, com valores monetários totais para o projeto equivalente em BRL:\n{\n  "low_price": 0,\n  "median_price": 0,\n  "high_price": 0,\n  "recommended_price": 0,\n  "confidence": "baixa|media|alta",\n  "summary": "explicação curta das diferenças e premissas",\n  "warnings": ["..."],\n  "evidence_count": 0\n}\n\nSe não houver evidência suficiente para inferir um total equivalente, use confiança baixa e explique a limitação. Não transforme preço por unidade em preço total sem considerar exatamente a quantidade e as medidas.`;
}

function assistantPrompt(description: string, region: string, costPerM2: number, markupPct: number): string {
  return `Atue como Orçamentista IA especializado em comunicação visual no Brasil. Transforme o briefing em itens estruturados para cálculo. Não invente medidas ausentes: quando uma medida não estiver clara, coloque 0 e registre a dúvida em notes. Use pricing_mode="area" para adesivos, lonas, placas e impressos vendidos por m²; use pricing_mode="unit" apenas quando o briefing trouxer custo unitário explícito ou o produto for naturalmente unitário. Região: ${region}. Custo padrão por m²: ${costPerM2}. Markup padrão sobre custo: ${markupPct}%.\n\nBRIEFING:\n${description}\n\nRetorne APENAS JSON válido:\n{\n  "title": "...",\n  "items": [\n    {"description":"...","pricing_mode":"area","quantity":1,"width_cm":0,"height_cm":0,"cost_per_m2":${costPerM2},"cost_per_unit":0,"markup_pct":${markupPct},"notes":""}\n  ],\n  "questions": ["informações que ainda precisam ser confirmadas"]\n}`;
}

function insiderRules(snapshot: any) {
  const q = snapshot.quote;
  const market = snapshot.marketResearch?.[0] || null;
  const marginPct = q.sale_total > 0 ? round(((q.sale_total - q.production_cost) / q.sale_total) * 100, 2) : 0;
  const findings: string[] = [];
  let risk: "baixo" | "moderado" | "alto" = "baixo";
  if (q.production_cost <= 0) { findings.push("Custo de produção zerado ou incompleto. Revise a base antes de enviar ao cliente."); risk = "alto"; }
  if (marginPct < 30) { findings.push(`Margem sobre a venda em ${marginPct}%, abaixo de uma zona confortável para absorver perdas e retrabalho.`); risk = "alto"; }
  else if (marginPct < 45) { findings.push(`Margem sobre a venda em ${marginPct}%. Há espaço, mas desconto e retrabalho podem consumir a proteção.`); risk = "moderado"; }
  else findings.push(`Margem sobre a venda em ${marginPct}%, com boa proteção bruta antes de impostos, frete e instalação.`);
  if (market?.low_price && q.sale_total < market.low_price) { findings.push("Preço atual está abaixo da faixa baixa encontrada no mercado. Pode haver espaço para capturar mais margem."); }
  if (market?.high_price && q.sale_total > market.high_price) { findings.push("Preço atual está acima da faixa alta pesquisada. Reforce diferenciais ou revise escopo antes de apresentar."); risk = risk === "alto" ? "alto" : "moderado"; }
  if (!market) findings.push("Ainda não há pesquisa de mercado vinculada. O posicionamento externo não foi validado.");
  const discountFloor10 = round(q.sale_total * 0.9, 2);
  const profitAt10 = round(discountFloor10 - q.production_cost, 2);
  return { margin_pct: marginPct, risk, findings, negotiation: { current: q.sale_total, ten_percent_discount: discountFloor10, gross_profit_after_discount: profitAt10 } };
}

export function registerPricingRoutes(app: Hono<AppEnv>) {
  app.use("/api/pricing/*", async (c, next) => {
    const denied = requirePricingUser(c);
    if (denied) return denied;
    await next();
  });

  app.get("/api/pricing/health", (c) => c.json({ ok: true, module: "MKNG Pricing Intelligence", aiConfigured: Boolean(c.env.OPENAI_API_KEY), model: c.env.OPENAI_PRICING_MODEL || "gpt-5.6" }));

  app.get("/api/pricing/quotes", async (c) => {
    const result = await c.env.DB.prepare(
      `SELECT q.*,c.name AS customer_name,u.name AS created_by_name,
              (SELECT COUNT(*) FROM pricing_quote_items i WHERE i.quote_id=q.id) AS item_count
         FROM pricing_quotes q
         LEFT JOIN customers c ON c.id=q.customer_id
         LEFT JOIN users u ON u.id=q.created_by
        ORDER BY q.created_at DESC LIMIT 200`,
    ).all<any>();
    return c.json({ items: result.results });
  });

  app.get("/api/pricing/quotes/:id", async (c) => {
    const snapshot = await loadQuote(c.env, c.req.param("id"));
    if (!snapshot) return c.json({ error: "Orçamento não encontrado" }, 404);
    return c.json(snapshot);
  });

  app.post("/api/pricing/quotes", async (c) => {
    const data = await c.req.json<any>();
    const saved = await saveQuote(c, null, data);
    if (saved.error) return saved.error;
    return c.json(await loadQuote(c.env, saved.id), 201);
  });

  app.put("/api/pricing/quotes/:id", async (c) => {
    const data = await c.req.json<any>();
    const saved = await saveQuote(c, c.req.param("id"), data);
    if (saved.error) return saved.error;
    return c.json(await loadQuote(c.env, saved.id));
  });

  app.delete("/api/pricing/quotes/:id", async (c) => {
    if (c.get("user").role !== "super_admin") return c.json({ error: "Exclusão definitiva é exclusiva do Super Administrador" }, 403);
    const row = await c.env.DB.prepare("SELECT id,code FROM pricing_quotes WHERE id=?").bind(c.req.param("id")).first<any>();
    if (!row) return c.json({ error: "Orçamento não encontrado" }, 404);
    await c.env.DB.prepare("DELETE FROM pricing_quotes WHERE id=?").bind(row.id).run();
    return c.json({ ok: true });
  });

  app.post("/api/pricing/assistant", async (c) => {
    const data = await c.req.json<any>();
    const description = String(data.description || "").trim();
    if (description.length < 10) return c.json({ error: "Descreva o material, quantidade e medidas para o Orçamentista IA" }, 400);
    try {
      const ai = await callOpenAI(c.env, assistantPrompt(description, data.region || "Fortaleza/CE", number(data.default_cost_per_m2, 0), number(data.default_markup_pct, 100)), false);
      const parsed = parseJsonBlock(ai.text);
      await c.env.DB.prepare("INSERT INTO pricing_ai_runs (id,agent,model,prompt_summary,response_text,sources_json,created_by) VALUES (?,?,?,?,?,?,?)")
        .bind(uid(), "orcamentista", ai.model, description.slice(0, 500), ai.text, JSON.stringify(ai.sources), c.get("user").id).run();
      return c.json({ ...parsed, model: ai.model });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Falha no Orçamentista IA" }, 503);
    }
  });

  app.post("/api/pricing/quotes/:id/market-research", async (c) => {
    const snapshot = await loadQuote(c.env, c.req.param("id"));
    if (!snapshot) return c.json({ error: "Orçamento não encontrado" }, 404);
    try {
      const prompt = marketPrompt(snapshot);
      const ai = await callOpenAI(c.env, prompt, true);
      const parsed = parseJsonBlock(ai.text);
      const researchId = uid();
      const low = Math.max(number(parsed.low_price), 0);
      const median = Math.max(number(parsed.median_price), 0);
      const high = Math.max(number(parsed.high_price), 0);
      const recommended = Math.max(number(parsed.recommended_price), 0);
      const confidence = String(parsed.confidence || "baixa");
      const summary = String(parsed.summary || "");
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO pricing_market_research (id,quote_id,query,region,low_price,median_price,high_price,recommended_price,confidence,summary,sources_json,raw_response_json,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(researchId, snapshot.quote.id, prompt.slice(0, 3000), snapshot.quote.region, low, median, high, recommended, confidence, summary, JSON.stringify(ai.sources), JSON.stringify(ai.raw), c.get("user").id, isoNow()),
        c.env.DB.prepare("UPDATE pricing_quotes SET market_low=?,market_median=?,market_high=?,market_recommended=?,market_confidence=?,updated_at=? WHERE id=?")
          .bind(low || null, median || null, high || null, recommended || null, confidence, isoNow(), snapshot.quote.id),
        c.env.DB.prepare("INSERT INTO pricing_ai_runs (id,quote_id,agent,model,prompt_summary,response_text,sources_json,created_by) VALUES (?,?,?,?,?,?,?,?)")
          .bind(uid(), snapshot.quote.id, "analytics_mercado", ai.model, prompt.slice(0, 500), ai.text, JSON.stringify(ai.sources), c.get("user").id),
      ]);
      return c.json({ id: researchId, ...parsed, sources: ai.sources, model: ai.model });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Falha na pesquisa de mercado" }, 503);
    }
  });

  app.get("/api/pricing/quotes/:id/insider", async (c) => {
    const snapshot = await loadQuote(c.env, c.req.param("id"));
    if (!snapshot) return c.json({ error: "Orçamento não encontrado" }, 404);
    const rules = insiderRules(snapshot);
    let aiAnalysis: string | null = null;
    let model: string | null = null;
    if (c.req.query("ai") === "1" && c.env.OPENAI_API_KEY) {
      const prompt = `Você é o Insider MKNG, analista interno de rentabilidade em comunicação visual. Analise os números abaixo sem inventar dados. Aponte riscos de margem, desconto, perdas/reimpressão, posicionamento frente ao mercado e uma recomendação prática de negociação. Custos internos são confidenciais e nunca devem aparecer em texto destinado ao cliente.\n\n${JSON.stringify({ quote: snapshot.quote, items: snapshot.items, scenarios: snapshot.scenarios, latestMarket: snapshot.marketResearch?.[0] || null, deterministicAnalysis: rules })}`;
      try {
        const ai = await callOpenAI(c.env, prompt, false);
        aiAnalysis = ai.text;
        model = ai.model;
        await c.env.DB.prepare("INSERT INTO pricing_ai_runs (id,quote_id,agent,model,prompt_summary,response_text,sources_json,created_by) VALUES (?,?,?,?,?,?,?,?)")
          .bind(uid(), snapshot.quote.id, "insider", ai.model, "Análise interna de rentabilidade", ai.text, "[]", c.get("user").id).run();
      } catch { /* mantém análise determinística */ }
    }
    return c.json({ ...rules, ai_analysis: aiAnalysis, model });
  });

  app.get("/api/pricing/analytics", async (c) => {
    const [summary, byStatus, recent] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS quote_count,COALESCE(SUM(sale_total),0) AS sales,COALESCE(SUM(production_cost),0) AS costs,COALESCE(SUM(gross_profit),0) AS profit,COALESCE(AVG(default_markup_pct),0) AS avg_markup FROM pricing_quotes`).first<any>(),
      c.env.DB.prepare("SELECT status,COUNT(*) AS total,COALESCE(SUM(sale_total),0) AS value FROM pricing_quotes GROUP BY status ORDER BY total DESC").all<any>(),
      c.env.DB.prepare("SELECT id,code,title,status,sale_total,gross_profit,market_median,created_at FROM pricing_quotes ORDER BY created_at DESC LIMIT 12").all<any>(),
    ]);
    const sales = number(summary?.sales);
    const profit = number(summary?.profit);
    return c.json({ summary: { ...summary, realized_margin_pct: sales > 0 ? round((profit / sales) * 100, 2) : 0 }, byStatus: byStatus.results, recent: recent.results });
  });

  app.get("/api/pricing/quotes/:id/pdf", async (c) => {
    const snapshot = await loadQuote(c.env, c.req.param("id"));
    if (!snapshot) return c.json({ error: "Orçamento não encontrado" }, 404);
    const internal = c.req.query("view") === "internal";
    const q = snapshot.quote;
    const settings = await c.env.DB.prepare("SELECT key,value FROM settings").all<any>();
    const map = Object.fromEntries(settings.results.map((row: any) => [row.key, row.value]));
    const brand = { companyName: map.company_name || "MKNG Soluções", departmentName: map.department_name || "Setor de Comunicação Visual", poweredBy: map.powered_by || "SER Comunicação Inteligente & Hakham IA", primaryColor: map.primary_color || "#ff6a00" };
    const summary = internal
      ? [`CONTROLE INTERNO — NÃO ENCAMINHAR AO CLIENTE`, `Orçamento: ${q.code}`, `Custo de produção: ${brl(q.production_cost)}`, `Venda: ${brl(q.sale_total)}`, `Lucro bruto: ${brl(q.gross_profit)}`, `Markup padrão: ${q.default_markup_pct}% sobre custo`]
      : [`Orçamento: ${q.code}`, `Cliente: ${q.customer_name || "A definir"}`, `Quantidade de itens: ${snapshot.items.length}`, `Área total: ${number(q.total_area_m2).toLocaleString("pt-BR")} m²`, `VALOR TOTAL: ${brl(q.sale_total)}`];
    const columns = internal
      ? [
          { label: "Item", width: 170, value: (r: any) => r.description },
          { label: "Qtd.", width: 55, value: (r: any) => String(r.quantity) },
          { label: "Área", width: 70, value: (r: any) => `${r.total_area_m2} m²` },
          { label: "Custo", width: 85, value: (r: any) => brl(r.line_cost) },
          { label: "Markup", width: 65, value: (r: any) => `${r.markup_pct}%` },
          { label: "Venda", width: 90, value: (r: any) => brl(r.line_total) },
          { label: "Lucro", width: 85, value: (r: any) => brl(number(r.line_total) - number(r.line_cost)) },
        ]
      : [
          { label: "Descrição", width: 220, value: (r: any) => r.description },
          { label: "Qtd.", width: 60, value: (r: any) => String(r.quantity) },
          { label: "Medidas", width: 100, value: (r: any) => r.pricing_mode === "area" ? `${r.width_cm} x ${r.height_cm} cm` : "Por unidade" },
          { label: "Área total", width: 90, value: (r: any) => r.pricing_mode === "area" ? `${r.total_area_m2} m²` : "—" },
          { label: "Valor un.", width: 95, value: (r: any) => brl(r.unit_price) },
          { label: "Total", width: 105, value: (r: any) => brl(r.line_total) },
        ];
    const pdf = await buildReportPdf({ title: internal ? "Memória de Cálculo Interna" : "Orçamento Comercial", subtitle: q.title, rows: snapshot.items, summary, columns, brand });
    return new Response(pdf as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.code}-${internal ? "interno" : "comercial"}.pdf"`, "Cache-Control": "private, no-store" } });
  });
}
