import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { MetricsRegistry } from "./metrics.registry";

const UNMATCHED_ROUTE_LABEL = "unmatched";

/**
 * Middleware (não interceptor): lê `req.route`/`res.statusCode` dentro do
 * evento `finish` do response, quando o Express já terminou de rotear e
 * enviar a resposta — garante o status code final real, diferente de um
 * interceptor Nest, cujo `tap` de erro roda antes do exception filter global
 * escrever a resposta (ver ADR-013).
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsRegistry) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route =
        (req.route as { path?: string } | undefined)?.path ??
        UNMATCHED_ROUTE_LABEL;

      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };

      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    });

    next();
  }
}
