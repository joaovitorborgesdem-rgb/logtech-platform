import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { FREIGHT_QUOTE_QUEUE } from "../freight-quotes/freight-quote-queue.constants";
import { INSIGHTS_QUEUE } from "../insights/insights-queue.constants";
import { HealthIndicatorsService } from "./health-indicators.service";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue(
      { name: FREIGHT_QUOTE_QUEUE },
      { name: INSIGHTS_QUEUE },
    ),
  ],
  controllers: [HealthController],
  providers: [HealthIndicatorsService],
})
export class HealthModule {}
