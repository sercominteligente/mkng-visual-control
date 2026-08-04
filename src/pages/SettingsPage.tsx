import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Field, Loading, PageHeader } from "../components/UI";

export function SettingsPage() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<{ items: { key: string; value: string }[] }>("/settings").then((data) => setForm(Object.fromEntries(data.items.map((item) => [item.key, item.value])))).finally(() => setLoading(false));
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage("");
    await api("/settings", { method: "PUT", body: JSON.stringify(form) });
    setMessage("Configurações salvas com sucesso.");
  };
  return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Configurações do sistema" description="Identidade da empresa, documentos, fuso horário, prefixos e preferências gerais." />{loading ? <Loading /> : <div className="panel settings-panel"><form className="form-grid" onSubmit={save}><Field label="Empresa"><input value={form.company_name || ""} onChange={(event) => setForm({ ...form, company_name: event.target.value })} /></Field><Field label="Setor"><input value={form.department_name || ""} onChange={(event) => setForm({ ...form, department_name: event.target.value })} /></Field><Field label="Assinatura Powered by" wide><input value={form.powered_by || ""} onChange={(event) => setForm({ ...form, powered_by: event.target.value })} /></Field><Field label="Moeda"><select value={form.currency || "BRL"} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="BRL">Real brasileiro (BRL)</option></select></Field><Field label="Fuso horário"><input value={form.timezone || "America/Fortaleza"} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></Field><Field label="Prefixo dos pedidos"><input value={form.order_prefix || "OS"} onChange={(event) => setForm({ ...form, order_prefix: event.target.value })} /></Field><Field label="Prefixo das compras"><input value={form.purchase_prefix || "CMP"} onChange={(event) => setForm({ ...form, purchase_prefix: event.target.value })} /></Field>{message && <div className="alert success wide">{message}</div>}<div className="form-actions wide"><button className="primary-button">Salvar configurações</button></div></form><div className="settings-note"><strong>Infraestrutura Cloudflare</strong><p>Banco D1, arquivos R2, aplicação Workers, SSL/TLS, proteção DDoS, observabilidade e implantação automática pelo GitHub.</p></div></div>}</>;
}
