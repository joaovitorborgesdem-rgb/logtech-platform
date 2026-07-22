import { Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

const DURATION_BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5];

/**
 * Registro Prometheus (`prom-client`) com as métricas padrão do processo
 * Node (CPU, memória, event loop lag, GC) mais duas métricas HTTP
 * customizadas usadas por `MetricsMiddleware`. Um único registry por
 * processo, injetado tanto no middleware quanto no controller que expõe
 * `/metrics` (ver ADR-013).
 */
@Injectable()
export class MetricsRegistry {
  readonly registry = new Registry();
  readonly httpRequestsTotal: Counter<"method" | "route" | "status_code">;
  readonly httpRequestDurationSeconds: Histogram<
    "method" | "route" | "status_code"
  >;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total de requisições HTTP processadas",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: "http_request_duration_seconds",
      help: "Duração das requisições HTTP em segundos",
      labelNames: ["method", "route", "status_code"],
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [this.registry],
    });
  }
}
