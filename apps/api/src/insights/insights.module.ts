import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { InsightsAggregationProcessor } from "./insights-aggregation.processor";
import { INSIGHTS_QUEUE } from "./insights-queue.constants";
import { InsightsController } from "./insights.controller";
import { InsightsService } from "./insights.service";

@Module({
  imports: [BullModule.registerQueue({ name: INSIGHTS_QUEUE })],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsAggregationProcessor],
})
export class InsightsModule {}
