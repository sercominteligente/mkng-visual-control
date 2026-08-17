import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./lib/api";
import { navigate, usePath } from "./lib/router";
import { Layout, type User } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductionPage } from "./pages/ProductionPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { StockPage } from "./pages/StockPage";
import { LossesPage } from "./pages/LossesPage";
import { CustomersPage } from "./pages/CustomersPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { FinancePage } from "./pages/FinancePage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PricingIntelligencePage } from "./pages/PricingIntelligencePage";
import { Loading } from "./components/UI";
import { defaultBranding, type BrandingConfig } from "./lib/branding";
import "./pricing.css";

export function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [branding, setBranding] = useState<BrandingConfig>(defaultBranding);

  const refreshBranding = useCallback(async () => {
    try {
      const config = await api<BrandingConfig>("/public/config");
      setBranding(config);
      document.documentElement.style.setProperty("--orange", config.primary_color || defaultBranding.primary_color);
      document.documentElement.style.setProperty("--purple", config.accent_color || defaultBranding.accent_color);
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement("link");
      favicon.rel = "icon";
      favicon.href = `${config.favicon_url || "/favicon.svg"}${(config.favicon_url || "").includes("?") ? "&" : "?"}v=${Date.now()}`;
      if (!favicon.parentNode) document.head.appendChild(favicon);
      document.title = `${config.company_name} — ${config.department_name}`;
    } catch (error) {
      console.error("Falha ao carregar identidade visual", error);
    }
  }, []);

  useEffect(() => {
    void refreshBranding();
    api<{ user: User }>("/me").then((data) => {
      setUser(data.user);
      if (path === "/" || path === "/login") navigate("/dashboard");
    }).catch((error) => {
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error);
      setUser(null);
      if (path !== "/login") navigate("/login");
    }).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="boot-screen"><img src={branding.sidebar_logo_url || "/mkng-logo.svg"} alt={branding.company_name} /><Loading /></div>;
  if (!user) return <LoginPage branding={branding} onLogin={(nextUser) => { setUser(nextUser); navigate("/dashboard"); }} />;

  let page: React.ReactNode;
  if (path === "/dashboard" || path === "/") page = <DashboardPage userName={user.name} />;
  else if (path === "/orders" || path.startsWith("/orders/")) page = <OrdersPage user={user} />;
  else if (path === "/pricing") page = <PricingIntelligencePage />;
  else if (path === "/production") page = <ProductionPage user={user} />;
  else if (path === "/materials") page = <MaterialsPage user={user} />;
  else if (path === "/purchases") page = <PurchasesPage user={user} />;
  else if (path === "/stock") page = <StockPage user={user} />;
  else if (path === "/losses") page = <LossesPage user={user} />;
  else if (path === "/customers") page = <CustomersPage user={user} />;
  else if (path === "/suppliers") page = <SuppliersPage user={user} />;
  else if (path === "/finance") page = <FinancePage user={user} />;
  else if (path === "/reports") page = <ReportsPage />;
  else if (path === "/users") page = <UsersPage user={user} />;
  else if (path === "/settings") page = <SettingsPage user={user} branding={branding} onBrandingChanged={refreshBranding} />;
  else page = <div className="panel"><h2>Página não encontrada</h2><button className="primary-button" onClick={() => navigate("/dashboard")}>Voltar ao painel</button></div>;

  return <Layout path={path} user={user} branding={branding} onLogout={() => setUser(null)}>{page}</Layout>;
}
