import { Module } from "@nestjs/common";
import { FreightQuotesController } from "./freight-quotes.controller";
import { FreightQuotesService } from "./freight-quotes.service";

@Module({
  controllers: [FreightQuotesController],
  providers: [FreightQuotesService],
})
export class FreightQuotesModule {}
