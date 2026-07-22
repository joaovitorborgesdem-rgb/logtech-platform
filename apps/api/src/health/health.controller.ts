import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { HealthIndicatorsService } from "./health-indicators.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorsService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.indicators.checkDatabase(),
      () => this.indicators.checkRedis(),
      () => this.indicators.checkFreightQuoteQueue(),
      () => this.indicators.checkInsightsQueue(),
    ]);
  }
}
