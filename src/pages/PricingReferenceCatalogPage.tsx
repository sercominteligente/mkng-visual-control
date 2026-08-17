import { useEffect, useMemo, useState } from "react";
import { api, dateTimeBR } from "../lib/api";
import { Badge, EmptyState, PageHeader } from "../components/UI";
import "../pricing-reference.css";

type CatalogMeta = {
  id: string;
  filename: string;
  content_chars: number;
  line_count: number;
  active: number | boolean;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
  preview?: string;
};

type CatalogResponse = {
  active: CatalogMeta | null;
  history: CatalogMeta[];
  limits: { max_chars: number };
};

const example = `PRODUTO | MODO | CUSTO | UNIDADE | MEDIDA FIXA | OBSERVAÇÕES
Adesivo leitoso | area | 17,00 | m² | - | impressão e recorte
Adesivo perfurado | area | 22,00 | m² | - | impressão 4x0
Botton 10x10 | unit | 0,40 | un | 10x10 cm | produto unitário
Lona 440g | area | 20,00 | m² | - | acabamento consultar`;

export function PricingReferenceCatalogPage() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setError("");
    try {
      setData(await api<CatalogResponse>("/pricing/reference-catalog"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a tabela mestre");
    }
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => ({
    chars: content.length,
    lines: content ? content.split(/\r?\n/).filter((line) => line.trim()).length : 0,
  }), [content]);

  const pickFile = async (file?: File) => {
    setError(""); setSuccess("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) { setError("Selecione um arquivo .txt"); return; }
    const text = await file.text();
    if (data?.limits?.max_chars && text.length > data.limits.max_chars) {
      setError(`O arquivo excede o limite de ${data.limits.max_chars.toLocaleString("pt-BR")} caracteres.`);
      return;
    }
    setFilename(file.name);
    setContent(text);
  };

  const save = async () => {
    if (!filename || content.trim().length < 20) { setError("Selecione um TXT válido antes de ativar a tabela."); return; }
    setBusy("save"); setError(""); setSuccess("");
    try {
      await api("/pricing/reference-catalog", { method: "POST", body: JSON.stringify({ filename, content }) });
      setSuccess("Tabela enviada e ativada. O Orçamentista IA já usará esta versão como base prioritária.");
      setFilename(""); setContent("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar a tabela mestre"); }
    finally { setBusy(""); }
  };

  const activate = async (id: string) => {
    setBusy(`activate-${id}`); setError(""); setSuccess("");
    try {
      await api(`/pricing/reference-catalog/${id}/activate`, { method: "POST" });
      setSuccess("Versão reativada com sucesso.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao ativar a versão"); }
    finally { setBusy(""); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Excluir esta versão antiga da tabela?")) return;
    setBusy(`delete-${id}`); setError(""); setSuccess("");
    try {
      await api(`/pricing/reference-catalog/${id}`, { method: "DELETE" });
      setSuccess("Versão excluída.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir a versão"); }
    finally { setBusy(""); }
  };

  return <>
    <PageHeader
      eyebrow="BASE INTERNA DO ORÇAMENTISTA IA"
      title="Tabela Mestre de Produtos e Valores"
      description="Envie um TXT com produtos, custos, unidades, medidas e observações. A IA consulta esta base antes de fazer perguntas."
    />

    {error && <div className="pricing-alert pricing-alert-error">{error}</div>}
    {success && <div className="pricing-alert pricing-reference-success">{success}</div>}

    <div className="pricing-reference-grid">
      <section className="panel pricing-reference-active">
        <div className="pricing-section-title">
          <div><span className="eyebrow">TABELA ATIVA</span><h2>Fonte prioritária da IA</h2></div>
          <Badge tone={data?.active ? "success" : "neutral"}>{data?.active ? "Ativa" : "Sem tabela"}</Badge>
        </div>
        {!data?.active ? <EmptyState title="Nenhuma tabela cadastrada" text="Envie o primeiro TXT para reduzir perguntas e padronizar os custos usados pelo Orçamentista IA." /> : <>
          <div className="pricing-reference-meta">
            <div><span>Arquivo</span><strong>{data.active.filename}</strong></div>
            <div><span>Linhas</span><strong>{Number(data.active.line_count || 0).toLocaleString("pt-BR")}</strong></div>
            <div><span>Caracteres</span><strong>{Number(data.active.content_chars || 0).toLocaleString("pt-BR")}</strong></div>
            <div><span>Atualizada</span><strong>{dateTimeBR(data.active.updated_at || data.active.created_at)}</strong></div>
          </div>
          <div className="pricing-reference-preview"><strong>Prévia da tabela ativa</strong><pre>{data.active.preview || "Prévia indisponível"}</pre></div>
        </>}
      </section>

      <section className="panel pricing-reference-upload">
        <div className="pricing-section-title"><div><span className="eyebrow">NOVA VERSÃO</span><h2>Enviar tabela TXT</h2></div></div>
        <label className="pricing-reference-file">
          <span>Arquivo .txt</span>
          <input type="file" accept=".txt,text/plain" onChange={(event) => void pickFile(event.target.files?.[0])} />
        </label>
        <div className="pricing-reference-file-status">
          <strong>{filename || "Nenhum arquivo selecionado"}</strong>
          <span>{stats.lines.toLocaleString("pt-BR")} linhas · {stats.chars.toLocaleString("pt-BR")} caracteres</span>
        </div>
        <label>Conteúdo para conferência
          <textarea rows={12} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Selecione um TXT ou cole/ajuste aqui a tabela antes de ativar." />
        </label>
        <div className="pricing-action-row">
          <button className="primary-button" disabled={busy === "save" || content.trim().length < 20} onClick={save}>{busy === "save" ? "Ativando..." : "Salvar e ativar tabela"}</button>
          <small>A versão anterior permanece no histórico e pode ser reativada.</small>
        </div>
      </section>
    </div>

    <section className="panel pricing-reference-guide">
      <div className="pricing-section-title"><div><span className="eyebrow">FORMATO RECOMENDADO</span><h2>Quanto mais clara a tabela, menos a IA pergunta</h2></div></div>
      <p>O arquivo pode usar <strong>|</strong>, ponto e vírgula, tabulação ou texto organizado. Os cabeçalhos ajudam a IA a distinguir custo por m², custo unitário, medidas fixas e acabamentos.</p>
      <pre>{example}</pre>
      <div className="pricing-reference-rules">
        <span>Briefing explícito prevalece sobre a tabela.</span>
        <span>A tabela prevalece sobre o custo padrão do formulário.</span>
        <span>A IA faz no máximo 3 perguntas e somente quando forem indispensáveis.</span>
      </div>
    </section>

    <section className="panel">
      <div className="pricing-section-title"><div><span className="eyebrow">VERSÕES</span><h2>Histórico da base interna</h2></div><span className="muted">{data?.history?.length || 0} versões</span></div>
      {!data?.history?.length ? <EmptyState title="Sem histórico" text="As versões enviadas aparecerão aqui." /> : <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Arquivo</th><th>Linhas</th><th>Caracteres</th><th>Enviado por</th><th>Data</th><th>Status</th><th /></tr></thead><tbody>{data.history.map((row) => <tr key={row.id}>
        <td><strong>{row.filename}</strong></td>
        <td>{Number(row.line_count || 0).toLocaleString("pt-BR")}</td>
        <td>{Number(row.content_chars || 0).toLocaleString("pt-BR")}</td>
        <td>{row.created_by_name || "Usuário MKNG"}</td>
        <td>{dateTimeBR(row.created_at)}</td>
        <td><Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Em uso" : "Histórico"}</Badge></td>
        <td><div className="pricing-reference-actions">{!row.active && <button className="ghost-button compact-button" disabled={busy === `activate-${row.id}`} onClick={() => activate(row.id)}>Ativar</button>}{!row.active && <button className="icon-danger" disabled={busy === `delete-${row.id}`} onClick={() => remove(row.id)}>×</button>}</div></td>
      </tr>)}</tbody></table></div>}
    </section>
  </>;
}
