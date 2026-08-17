import { Hono } from "hono";
import legacyApp from "./worker";
import { authMiddleware } from "./server/auth";
import { registerPricingRoutes } from "./server/pricing";
import type { AppEnv } from "./server/types";

const app = new Hono<AppEnv>();

// A v0.6 adiciona apenas as rotas de inteligência comercial.
// Todo o restante continua sendo atendido pelo worker v0.5, reduzindo risco de regressão.
app.use("/api/pricing/*", authMiddleware);
registerPricingRoutes(app);
app.route("/", legacyApp);

export default app;
