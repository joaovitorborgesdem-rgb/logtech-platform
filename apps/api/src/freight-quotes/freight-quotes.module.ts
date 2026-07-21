import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { FreightCalculationService } from "./freight-calculation.service";
import { FreightQuoteCalculationProcessor } from "./freight-quote-calculation.processor";
import { FREIGHT_QUOTE_QUEUE } from "./freight-quote-queue.constants";
import { FreightQuotesController } from "./freight-quotes.controller";
import { FreightQuotesService } from "./freight-quotes.service";

@Module({
  imports: [BullModule.registerQueue({ name: FREIGHT_QUOTE_QUEUE })],
  controllers: [FreightQuotesController],
  providers: [
    FreightQuotesService,
    FreightCalculationService,
    FreightQuoteCalculationProcessor,
  ],
  exports: [FreightCalculationService],
})
export class FreightQuotesModule {}
