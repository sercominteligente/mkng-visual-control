import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Field, Loading, PageHeader } from "../components/UI";
import type { User } from "../components/Layout";
import type { BrandingConfig } from "../lib/branding";

const fixedPoweredBy = "SER Comunicação Inteligente & Hakham IA";

type CleanupPreview = {
  draftOrders: number;
  draftPurchases: number;
  testCustomers: number;
  testMaterials: number;
  draftFinance: number;
};

export function SettingsPage({ user, branding, onBrandingChanged }: { user: User; branding: BrandingConfig; onBrandingChanged: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState("");
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [cleanup, setCleanup] = useState({ draftOrders: true, draftPurchases: true, testCustomers: false, testMaterials: false, draftFinance: false });
  const [confirmation, setConfirmation] = useState("");
  const isSuperAdmin = user.role === "super_admin";

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ items: { key: string; value: string }[] }>("/settings");
      setForm(Object.fromEntries(data.items.map((item) => [item.key, item.value])));
      if (isSuperAdmin) setPreview(await api<CleanupPreview>("/settings/test-data/preview"));
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar as configurações"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(""); setError("");
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({ ...form, powered_by: fixedPoweredBy }) });
      await onBrandingChanged();
      setMessage("Configurações salvas e aplicadas ao sistema.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar"); }
  };

  const uploadBranding = async (slot: "sidebar" | "login" | "favicon", file?: File) => {
    if (!file) return;
    setUploading(slot); setError(""); setMessage("");
    try {
      const data = new FormData(); data.append("file", file);
      await api(`/settings/branding/${slot}`, { method: "POST", body: data });
      await onBrandingChanged();
      setMessage("Identidade visual atualizada com sucesso.");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha no envio da imagem"); }
    finally { setUploading(""); }
  };

  const resetBranding = async (slot: "sidebar" | "login" | "favicon") => {
    if (!window.confirm("Restaurar o arquivo padrão desta identidade visual?")) return;
    try {
      await api(`/settings/branding/${slot}`, { method: "DELETE" });
      await onBrandingChanged();
      setMessage("Arquivo padrão restaurado.");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao restaurar arquivo"); }
  };

  const runCleanup = async () => {
    setError(""); setMessage("");
    try {
      const result = await api<{ deleted: Record<string, number> }>("/settings/test-data/cleanup", {
        method: "POST",
        body: JSON.stringify({ ...cleanup, confirmation }),
      });
      setMessage(`Limpeza concluída: ${Object.values(result.deleted).reduce((sum, value) => sum + Number(value || 0), 0)} registro(s) removido(s).`);
      setConfirmation("");
      setPreview(await api<CleanupPreview>("/settings/test-data/preview"));
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível limpar os dados de teste"); }
  };

  return <>
    <PageHeader eyebrow="ADMINISTRAÇÃO" title="Configurações do sistema" description="Identidade da empresa, documentos, fuso horário, prefixos e preferências gerais." />
    {error && <div className="alert error">{error}</div>}
    {message && <div className="alert success">{message}</div>}
    {loading ? <Loading /> : <div className="settings-sections">
      <section className="panel settings-panel">
        <form className="form-grid" onSubmit={save}>
          <Field label="Empresa"><input value={form.company_name || ""} onChange={(event) => setForm({ ...form, company_name: event.target.value })} /></Field>
          <Field label="Setor"><input value={form.department_name || ""} onChange={(event) => setForm({ ...form, department_name: event.target.value })} /></Field>
          <Field label="Assinatura Powered by" wide><input value={fixedPoweredBy} readOnly disabled /><small>Assinatura técnica protegida.</small></Field>
          <Field label="Moeda"><select value={form.currency || "BRL"} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="BRL">Real brasileiro (BRL)</option></select></Field>
          <Field label="Fuso horário"><input value={form.timezone || "America/Fortaleza"} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></Field>
          <Field label="Prefixo dos pedidos"><input value={form.order_prefix || "OS"} onChange={(event) => setForm({ ...form, order_prefix: event.target.value })} /></Field>
          <Field label="Prefixo das compras"><input value={form.purchase_prefix || "CMP"} onChange={(event) => setForm({ ...form, purchase_prefix: event.target.value })} /></Field>
          <div className="form-actions wide"><button className="primary-button">Salvar configurações</button></div>
        </form>
        <div className="settings-note"><strong>Infraestrutura Cloudflare</strong><p>Banco D1, arquivos R2, aplicação Workers, SSL/TLS, proteção DDoS, observabilidade e implantação automática pelo GitHub.</p></div>
      </section>

      {isSuperAdmin && <section className="panel identity-panel">
        <div className="panel-head"><div><span className="eyebrow">SUPER ADMINISTRADOR</span><h2>Identidade visual</h2><p>Personalize logotipos, textos e cores sem alterar o código nem realizar novo deploy.</p></div></div>
        <div className="identity-grid">
          <form className="identity-form" onSubmit={save}>
            <Field label="Título da tela de login" wide><input value={form.login_title || ""} onChange={(event) => setForm({ ...form, login_title: event.target.value })} /></Field>
            <Field label="Identificação acima do título"><input value={form.login_subtitle || ""} onChange={(event) => setForm({ ...form, login_subtitle: event.target.value })} /></Field>
            <Field label="Cor principal"><div className="color-field"><input type="color" value={form.primary_color || "#ff6a00"} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} /><input value={form.primary_color || "#ff6a00"} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} /></div></Field>
            <Field label="Texto de apresentação" wide><textarea value={form.login_description || ""} onChange={(event) => setForm({ ...form, login_description: event.target.value })} /></Field>
            <Field label="Cor secundária"><div className="color-field"><input type="color" value={form.accent_color || "#8a4dff"} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} /><input value={form.accent_color || "#8a4dff"} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} /></div></Field>
            <div className="form-actions wide"><button className="primary-button">Salvar identidade e textos</button></div>
          </form>
          <div className="branding-upload-grid">
            <BrandUpload title="Logo do painel" text="Formato horizontal, preferencialmente com fundo transparente." recommended="720 × 240 px" minimum="360 × 120 px" src={branding.sidebar_logo_url} loading={uploading === "sidebar"} onFile={(file) => void uploadBranding("sidebar", file)} onReset={() => void resetBranding("sidebar")} />
            <BrandUpload title="Logo da tela de login" text="Versão principal da marca para a tela de acesso." recommended="1200 × 1200 px" minimum="600 × 600 px" src={branding.login_logo_url} loading={uploading === "login"} onFile={(file) => void uploadBranding("login", file)} onReset={() => void resetBranding("login")} />
            <BrandUpload title="Ícone do navegador" text="Favicon quadrado em SVG, PNG ou ICO." recommended="512 × 512 px" minimum="128 × 128 px" src={branding.favicon_url} loading={uploading === "favicon"} onFile={(file) => void uploadBranding("favicon", file)} onReset={() => void resetBranding("favicon")} />
          </div>
        </div>
        <div className="branding-preview" style={{ borderColor: form.primary_color || branding.primary_color }}>
          <div className="preview-sidebar"><img src={branding.sidebar_logo_url} alt="Prévia do logo" /><small>{form.department_name || branding.department_name}</small></div>
          <div className="preview-login"><span>{form.login_subtitle || branding.login_subtitle}</span><h3>{form.login_title || branding.login_title}</h3><p>{form.login_description || branding.login_description}</p></div>
        </div>
      </section>}

      {isSuperAdmin && <section className="panel maintenance-panel">
        <div className="panel-head"><div><span className="eyebrow">ACESSO EXCLUSIVO</span><h2>Manutenção e limpeza de testes</h2><p>Remove apenas registros seguros e elegíveis. Dados operacionais concluídos ou com movimentações são preservados.</p></div></div>
        {!preview ? <Loading /> : <div className="cleanup-grid">
          <CleanupOption checked={cleanup.draftOrders} onChange={(checked) => setCleanup({ ...cleanup, draftOrders: checked })} title="Rascunhos de pedidos / OS" count={preview.draftOrders} text="Sem consumo de estoque e sem contas a receber vinculadas." />
          <CleanupOption checked={cleanup.draftPurchases} onChange={(checked) => setCleanup({ ...cleanup, draftPurchases: checked })} title="Compras em rascunho" count={preview.draftPurchases} text="Somente compras que ainda não geraram entrada no estoque." />
          <CleanupOption checked={cleanup.testCustomers} onChange={(checked) => setCleanup({ ...cleanup, testCustomers: checked })} title="Clientes de teste sem histórico" count={preview.testCustomers} text="Nomes contendo teste, demo ou exemplo e sem pedidos vinculados." />
          <CleanupOption checked={cleanup.testMaterials} onChange={(checked) => setCleanup({ ...cleanup, testMaterials: checked })} title="Materiais de teste sem movimentação" count={preview.testMaterials} text="Saldo zero, sem compras, pedidos ou movimentações." />
          <CleanupOption checked={cleanup.draftFinance} onChange={(checked) => setCleanup({ ...cleanup, draftFinance: checked })} title="Financeiro em rascunho" count={preview.draftFinance} text="Contas a pagar e receber ainda não efetivadas." />
        </div>}
        <div className="cleanup-confirm"><div className="alert error"><strong>Ação irreversível.</strong> Usuários Administrador, Gestor, Produção, Financeiro e Estoque não têm acesso a esta função.</div><label><span>Digite LIMPAR TESTES para continuar</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="danger-button" disabled={confirmation !== "LIMPAR TESTES"} onClick={() => void runCleanup()}>Limpar dados selecionados</button></div>
      </section>}
    </div>}
  </>;
}

function BrandUpload({ title, text, recommended, minimum, src, loading, onFile, onReset }: { title: string; text: string; recommended: string; minimum: string; src?: string; loading: boolean; onFile: (file?: File) => void; onReset: () => void }) {
  return <article className="brand-upload-card"><div className="brand-upload-preview">{src ? <img src={`${src}${src.includes("?") ? "&" : "?"}preview=1`} alt={title} /> : <span>Sem arquivo personalizado</span>}</div><h3>{title}</h3><p>{text}</p><div className="image-specs"><div><span>Medida recomendada</span><strong>{recommended}</strong></div><div><span>Mínimo aceito</span><strong>{minimum}</strong></div><small>Formatos: SVG, PNG, WEBP ou JPG. Até 3 MB. Use fundo transparente quando possível.</small></div><label className="secondary-button file-button">{loading ? "Enviando..." : "Selecionar arquivo"}<input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg,image/x-icon" disabled={loading} onChange={(event) => onFile(event.target.files?.[0])} /></label><button className="text-button action-danger" type="button" onClick={onReset}>Restaurar padrão</button></article>;
}

function CleanupOption({ checked, onChange, title, count, text }: { checked: boolean; onChange: (checked: boolean) => void; title: string; count: number; text: string }) {
  return <label className="cleanup-option"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><div><strong>{title}</strong><p>{text}</p></div><b>{count}</b></label>;
}
