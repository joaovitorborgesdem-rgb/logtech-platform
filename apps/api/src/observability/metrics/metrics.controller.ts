import { Controller, Get, Header } from "@nestjs/common";
import { MetricsRegistry } from "./metrics.registry";

/**
 * `GET /metrics` não tem `JwtAuthGuard` — é o padrão para scraping do
 * Prometheus, que não carrega um JWT de usuário. Em produção, o acesso deve
 * ser restrito por rede (VPC/firewall), não por autenticação de aplicação
 * (ver ADR-013).
 */
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsRegistry) {}

  @Get()
  @Header("Content-Type", "text/plain")
  getMetrics(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
