import type { Hono } from "hono";
import type { AppEnv } from "./types";

const PRICING_ROLES = new Set(["super_admin", "admin", "manager", "finance"]);
const MAX_CATALOG_CHARS = 400_000;
const MAX_CONTEXT_CHARS = 48_000;

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

function requirePricingUser(c: any): Response | null {
  const user = c.get("user");
  if (!user || !PRICING_ROLES.has(user.role)) return c.json({ error: "Acesso à base de preços do Orçamentista IA não autorizado" }, 403);
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

async function callOpenAI(env: AppEnv["Bindings"], prompt: string): Promise<{ text: string; model: string }> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada no Worker");
  const model = env.OPENAI_PRICING_MODEL || "gpt-5.6";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt }),
  });
  const raw = await response.json<any>();
  if (!response.ok) throw new Error(raw?.error?.message || `Falha na IA (${response.status})`);
  const text = extractOutputText(raw);
  if (!text) throw new Error("A IA respondeu sem conteúdo utilizável");
  return { text, model };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokensFromBriefing(description: string): string[] {
  const stop = new Set([
    "para", "com", "sem", "uma", "uns", "umas", "por", "dos", "das", "que", "mil", "cada", "mais", "menos",
    "cm", "mm", "metro", "metros", "quadrado", "quadrados", "unidade", "unidades", "quantidade", "preciso", "quero",
    "fazer", "orcamento", "orcamentar", "cliente", "valor", "preco", "custo", "sobre", "lucro", "markup",
  ]);
  return [...new Set(normalize(description).split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !stop.has(token)))];
}

function selectCatalogContext(content: string, description: string): string {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const tokens = tokensFromBriefing(description);
  const headers = lines.slice(0, Math.min(8, lines.length));
  const scored = lines.map((line, index) => {
    const normalized = normalize(line);
    let score = 0;
    for (const token of tokens) {
      if (normalized.includes(token)) score += token.length >= 7 ? 4 : 2;
    }
    if (/\b(r\$|custo|pre[cç]o|valor|m2|m²|un|unidade|markup)\b/i.test(line)) score += 0.25;
    return { line, index, score };
  });
  const selected = scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 100)
    .sort((a, b) => a.index - b.index)
    .map((row) => row.line);
  const fallback = selected.length ? selected : lines.slice(0, 120);
  const unique = [...new Set([...headers, ...fallback])];
  return unique.join("\n").slice(0, MAX_CONTEXT_CHARS);
}

async function loadActiveCatalog(env: AppEnv["Bindings"]): Promise<any | null> {
  return env.DB.prepare(
    `SELECT c.id,c.filename,c.content,c.content_chars,c.line_count,c.created_at,c.updated_at,u.name AS created_by_name
       FROM pricing_reference_catalogs c
       LEFT JOIN users u ON u.id=c.created_by
      WHERE c.active=1
      ORDER BY c.updated_at DESC,c.created_at DESC
      LIMIT 1`,
  ).first<any>();
}

function assistantPrompt(description: string, region: string, costPerM2: number, markupPct: number, catalog: any | null): string {
  const catalogContext = catalog ? selectCatalogContext(String(catalog.content || ""), description) : "";
  const catalogBlock = catalogContext
    ? `\n\nTABELA MESTRE INTERNA MKNG (${catalog.filename})\n${catalogContext}\n\nREGRAS DA TABELA\n- Esta tabela é a fonte interna prioritária para nomes de produtos, modo de cobrança, custos, medidas fixas, acabamentos e observações.\n- Interprete os cabeçalhos exatamente como escritos. Colunas de custo devem alimentar cost_per_m2 ou cost_per_unit conforme a unidade.\n- Se houver preço de venda, não o trate como custo. Use-o apenas como referência em notes, a menos que a tabela também informe o custo.\n- Quando o produto do briefing estiver claramente presente na tabela, NÃO pergunte novamente material, unidade, custo ou medida fixa já informados nela.\n- Se houver mais de uma opção semelhante e a diferença alterar materialmente o preço, faça uma única pergunta objetiva.\n- O briefing explícito do usuário tem prioridade sobre a tabela quando ele informar um custo, medida ou markup específico para aquela simulação.`
    : `\n\nTABELA MESTRE INTERNA MKNG\nNenhuma tabela ativa foi encontrada. Use os padrões informados e pergunte somente o indispensável.`;

  return `Atue como Orçamentista IA especializado em comunicação visual no Brasil. Transforme o briefing em itens estruturados para cálculo e seja econômico nas perguntas. A meta é montar o orçamento com o máximo de dados disponíveis e perguntar apenas o que realmente impede um cálculo confiável.\n\nRegião: ${region}.\nCusto padrão por m²: ${costPerM2}.\nMarkup padrão sobre custo: ${markupPct}%.${catalogBlock}\n\nBRIEFING\n${description}\n\nREGRAS DE DECISÃO\n1. Prioridade de dados: briefing explícito > tabela mestre interna > padrões do formulário.\n2. Use pricing_mode=\"area\" quando a cobrança/custo for por m² e pricing_mode=\"unit\" quando for por unidade.\n3. Se a tabela trouxer dimensão fixa do produto, preencha width_cm e height_cm automaticamente.\n4. Se a dimensão variar por pedido e não estiver no briefing, coloque 0 e pergunte apenas essa dimensão.\n5. Se a tabela identificar material, acabamento e custo suficientes, não peça confirmação redundante.\n6. Faça no máximo 3 perguntas. Prefira assumir a opção mais compatível e registrar a premissa em notes quando o risco financeiro for pequeno.\n7. Nunca invente custo, produto ou acabamento ausente da tabela/briefing. Se usar o custo padrão por m², deixe isso explícito em notes.\n8. Use números puros nos campos numéricos, sem R$ e sem separador de milhar.\n\nRetorne APENAS JSON válido neste formato:\n{\n  \"title\": \"...\",\n  \"items\": [\n    {\"description\":\"...\",\"pricing_mode\":\"area\",\"quantity\":1,\"width_cm\":0,\"height_cm\":0,\"cost_per_m2\":${costPerM2},\"cost_per_unit\":0,\"markup_pct\":${markupPct},\"notes\":\"premissas e referência usada\"}\n  ],\n  \"questions\": [\"somente dúvidas indispensáveis\"]\n}`;
}

export function registerPricingReferenceRoutes(app: Hono<AppEnv>) {
  app.get("/api/pricing/reference-catalog", async (c) => {
    const denied = requirePricingUser(c); if (denied) return denied;
    const active = await loadActiveCatalog(c.env);
    const history = await c.env.DB.prepare(
      `SELECT c.id,c.filename,c.content_chars,c.line_count,c.active,c.created_at,c.updated_at,u.name AS created_by_name
         FROM pricing_reference_catalogs c
         LEFT JOIN users u ON u.id=c.created_by
        ORDER BY c.created_at DESC LIMIT 20`,
    ).all<any>();
    return c.json({
      active: active ? { ...active, preview: String(active.content || "").slice(0, 12_000) } : null,
      history: history.results,
      limits: { max_chars: MAX_CATALOG_CHARS },
    });
  });

  app.post("/api/pricing/reference-catalog", async (c) => {
    const denied = requirePricingUser(c); if (denied) return denied;
    const data = await c.req.json<any>();
    const filename = String(data.filename || "tabela-precos.txt").trim();
    const content = String(data.content || "").replace(/\u0000/g, "").trim();
    if (!filename.toLowerCase().endsWith(".txt")) return c.json({ error: "Envie um arquivo .txt" }, 400);
    if (content.length < 20) return c.json({ error: "A tabela TXT está vazia ou pequena demais" }, 400);
    if (content.length > MAX_CATALOG_CHARS) return c.json({ error: `Arquivo muito grande. Limite: ${MAX_CATALOG_CHARS.toLocaleString("pt-BR")} caracteres` }, 413);
    const id = uid();
    const now = isoNow();
    const lineCount = content.split(/\r?\n/).filter((line) => line.trim()).length;
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE pricing_reference_catalogs SET active=0,updated_at=? WHERE active=1").bind(now),
      c.env.DB.prepare(
        "INSERT INTO pricing_reference_catalogs (id,filename,content,content_chars,line_count,active,created_by,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?)",
      ).bind(id, filename, content, content.length, lineCount, c.get("user").id, now, now),
    ]);
    return c.json({ id, filename, content_chars: content.length, line_count: lineCount, active: true, created_at: now });
  });

  app.post("/api/pricing/reference-catalog/:id/activate", async (c) => {
    const denied = requirePricingUser(c); if (denied) return denied;
    const row = await c.env.DB.prepare("SELECT id FROM pricing_reference_catalogs WHERE id=?").bind(c.req.param("id")).first<any>();
    if (!row) return c.json({ error: "Versão da tabela não encontrada" }, 404);
    const now = isoNow();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE pricing_reference_catalogs SET active=0,updated_at=? WHERE active=1").bind(now),
      c.env.DB.prepare("UPDATE pricing_reference_catalogs SET active=1,updated_at=? WHERE id=?").bind(now, row.id),
    ]);
    return c.json({ ok: true });
  });

  app.delete("/api/pricing/reference-catalog/:id", async (c) => {
    const denied = requirePricingUser(c); if (denied) return denied;
    const row = await c.env.DB.prepare("SELECT id,active FROM pricing_reference_catalogs WHERE id=?").bind(c.req.param("id")).first<any>();
    if (!row) return c.json({ error: "Versão da tabela não encontrada" }, 404);
    if (Number(row.active) === 1) return c.json({ error: "Ative outra versão antes de excluir a tabela atualmente em uso" }, 409);
    await c.env.DB.prepare("DELETE FROM pricing_reference_catalogs WHERE id=?").bind(row.id).run();
    return c.json({ ok: true });
  });

  // Registrada antes das rotas legadas de pricing para substituir apenas o Orçamentista IA.
  app.post("/api/pricing/assistant", async (c) => {
    const denied = requirePricingUser(c); if (denied) return denied;
    const data = await c.req.json<any>();
    const description = String(data.description || "").trim();
    if (description.length < 10) return c.json({ error: "Descreva o material, quantidade e medidas para o Orçamentista IA" }, 400);
    try {
      const catalog = await loadActiveCatalog(c.env);
      const ai = await callOpenAI(
        c.env,
        assistantPrompt(
          description,
          data.region || "Fortaleza/CE",
          number(data.default_cost_per_m2, 0),
          number(data.default_markup_pct, 100),
          catalog,
        ),
      );
      const parsed = parseJsonBlock(ai.text);
      const questions = Array.isArray(parsed.questions) ? parsed.questions.filter(Boolean).slice(0, 3) : [];
      await c.env.DB.prepare("INSERT INTO pricing_ai_runs (id,agent,model,prompt_summary,response_text,sources_json,created_by) VALUES (?,?,?,?,?,?,?)")
        .bind(
          uid(),
          "orcamentista_catalogo",
          ai.model,
          `${description.slice(0, 380)}${catalog ? ` | tabela:${catalog.filename}` : " | sem tabela"}`,
          ai.text,
          "[]",
          c.get("user").id,
        ).run();
      return c.json({ ...parsed, questions, model: ai.model, catalog: catalog ? { id: catalog.id, filename: catalog.filename, updated_at: catalog.updated_at } : null });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Falha no Orçamentista IA" }, 503);
    }
  });
}
