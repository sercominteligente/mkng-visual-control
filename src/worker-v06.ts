import { Hono } from "hono";
import legacyApp from "./worker";
import { authMiddleware } from "./server/auth";
import { registerPricingReferenceRoutes } from "./server/pricing-reference";
import { registerPricingRoutes } from "./server/pricing";
import type { AppEnv } from "./server/types";

const app = new Hono<AppEnv>();

// A v0.6 adiciona apenas as rotas de inteligência comercial.
// Todo o restante continua sendo atendido pelo worker v0.5, reduzindo risco de regressão.
app.use("/api/pricing/*", authMiddleware);
// A tabela mestre registra primeiro o endpoint do Orçamentista IA e passa a ser a fonte interna prioritária.
registerPricingReferenceRoutes(app);
registerPricingRoutes(app);
app.route("/", legacyApp);

export default app;
