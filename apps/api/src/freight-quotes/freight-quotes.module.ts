import { Module } from "@nestjs/common";
import { FreightCalculationService } from "./freight-calculation.service";
import { FreightQuotesController } from "./freight-quotes.controller";
import { FreightQuotesService } from "./freight-quotes.service";

@Module({
  controllers: [FreightQuotesController],
  providers: [FreightQuotesService, FreightCalculationService],
  exports: [FreightCalculationService],
})
export class FreightQuotesModule {}
