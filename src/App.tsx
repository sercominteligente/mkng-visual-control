import { useEffect, useState } from "react";
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
import { CustomersPage } from "./pages/CustomersPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { FinancePage } from "./pages/FinancePage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Loading } from "./components/UI";

export function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/me").then((data) => {
      setUser(data.user);
      if (path === "/" || path === "/login") navigate("/dashboard");
    }).catch((error) => {
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error);
      setUser(null);
      if (path !== "/login") navigate("/login");
    }).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="boot-screen"><img src="/mkng-logo.svg" alt="MKNG" /><Loading /></div>;
  if (!user) return <LoginPage onLogin={(nextUser) => { setUser(nextUser); navigate("/dashboard"); }} />;

  let page: React.ReactNode;
  if (path === "/dashboard" || path === "/") page = <DashboardPage userName={user.name} />;
  else if (path === "/orders" || path.startsWith("/orders/")) page = <OrdersPage />;
  else if (path === "/production") page = <ProductionPage />;
  else if (path === "/materials") page = <MaterialsPage />;
  else if (path === "/purchases") page = <PurchasesPage />;
  else if (path === "/stock") page = <StockPage />;
  else if (path === "/customers") page = <CustomersPage />;
  else if (path === "/suppliers") page = <SuppliersPage />;
  else if (path === "/finance") page = <FinancePage />;
  else if (path === "/reports") page = <ReportsPage />;
  else if (path === "/users") page = <UsersPage />;
  else if (path === "/settings") page = <SettingsPage />;
  else page = <div className="panel"><h2>Página não encontrada</h2><button className="primary-button" onClick={() => navigate("/dashboard")}>Voltar ao painel</button></div>;

  return <Layout path={path} user={user} onLogout={() => setUser(null)}>{page}</Layout>;
}
