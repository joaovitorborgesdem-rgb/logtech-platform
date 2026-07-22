import { randomUUID } from "crypto";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { IncomingMessage, ServerResponse } from "http";
import { LoggerModule } from "nestjs-pino";

/**
 * Logging estruturado (JSON) via pino, com correlação de request ID (ver
 * ADR-013): `genReqId` reaproveita `X-Request-Id` se o cliente/proxy já
 * mandou um, senão gera um novo e devolve no header de resposta. Todo log
 * emitido durante aquela requisição — incluindo `new Logger(...)` do
 * `@nestjs/common` usado em qualquer service existente — herda esse id
 * automaticamente depois de `app.useLogger(app.get(Logger))` no bootstrap,
 * sem precisar tocar em código já escrito.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>("NODE_ENV") === "production";

        return {
          pinoHttp: {
            level: isProduction ? "info" : "debug",
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existing = req.headers["x-request-id"];
              const id = typeof existing === "string" ? existing : randomUUID();
              res.setHeader("X-Request-Id", id);
              return id;
            },
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers['set-cookie']",
            ],
            transport: isProduction
              ? undefined
              : {
                  target: "pino-pretty",
                  options: { singleLine: true, colorize: true },
                },
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
