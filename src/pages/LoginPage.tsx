import { useState } from "react";
import { api } from "../lib/api";
import type { BrandingConfig } from "../lib/branding";

export function LoginPage({ branding, onLogin }: { branding: BrandingConfig; onLogin: (user: any) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const result = await api<{ user: any }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, remember }) });
      onLogin(result.user);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível entrar"); }
    finally { setLoading(false); }
  };
  const titleParts = branding.login_title.split(/\s+/);
  const highlightStart = Math.max(1, titleParts.length - 2);
  const first = titleParts.slice(0, highlightStart).join(" ");
  const highlighted = titleParts.slice(highlightStart).join(" ");
  return <main className="login-page"><div className="login-ambient ambient-one" /><div className="login-ambient ambient-two" /><section className="login-shell"><div className="login-brand-panel">{branding.login_logo_url ? <img className="login-custom-logo" src={branding.login_logo_url} alt={branding.company_name} /> : <div className="login-mark"><span>MKNG</span></div>}<p className="login-kicker">{branding.login_subtitle}</p><h1>{first}<br /><em>{highlighted}</em></h1><p className="login-copy">{branding.login_description}</p><div className="login-features"><div><i>◆</i><span><strong>Operação integrada</strong><small>Pedido, produção e estoque</small></span></div><div><i>▦</i><span><strong>Controle de materiais</strong><small>Chapas, tintas e insumos</small></span></div><div><i>✓</i><span><strong>Dados protegidos</strong><small>Infraestrutura Cloudflare</small></span></div></div></div><div className="login-form-panel"><div className="login-form-head"><div className="lock-icon">⌑</div><span>Acesso ao sistema</span><h2>Acesse sua conta</h2><p>Entre com seu e-mail e sua senha de usuário autorizado.</p></div><form onSubmit={submit}><label><span>Usuário ou e-mail</span><div className="input-icon"><i>◎</i><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Digite seu e-mail" required autoComplete="username" /></div></label><label><span>Senha</span><div className="input-icon"><i>▣</i><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" required autoComplete="current-password" /></div></label><div className="login-options"><label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Lembrar meu acesso</span></label><button type="button" className="text-button" onClick={() => window.alert("A recuperação automática será ativada após configurar o serviço de e-mail. Solicite a redefinição ao administrador.")}>Esqueci minha senha</button></div>{error && <div className="alert error">{error}</div>}<button className="login-button" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button></form><div className="powered"><span>Powered by:</span><strong>SER Comunicação Inteligente</strong><small>& Hakham IA</small></div></div></section><footer className="login-footer">© {new Date().getFullYear()} {branding.company_name}. Todos os direitos reservados.</footer></main>;
}
