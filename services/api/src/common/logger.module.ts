import { randomUUID } from "node:crypto";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import { ENV, type Env } from "../config/env";

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

export const LoggerModule = PinoLoggerModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id =
          typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { singleLine: true } }
          : undefined,
    },
  }),
});
