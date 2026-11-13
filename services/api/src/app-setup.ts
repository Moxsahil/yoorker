import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { Env } from "./config/env";

export function configureApp(app: NestExpressApplication, env: Env): void {
  // Behind a proxy, req.ip is the proxy unless we trust it to report the caller.
  // Per-IP OTP limits depend on this being exactly the number of proxies.
  app.set("trust proxy", env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false);
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.enableShutdownHooks();
}
