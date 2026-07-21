import { Module } from "@nestjs/common";
import { CarriersController } from "./carriers.controller";
import { CarriersService } from "./carriers.service";

@Module({
  controllers: [CarriersController],
  providers: [CarriersService],
})
export class CarriersModule {}
