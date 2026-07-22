import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsMiddleware } from "./metrics.middleware";
import { MetricsRegistry } from "./metrics.registry";

@Module({
  controllers: [MetricsController],
  providers: [MetricsRegistry, MetricsMiddleware],
  exports: [MetricsRegistry, MetricsMiddleware],
})
export class MetricsModule {}
