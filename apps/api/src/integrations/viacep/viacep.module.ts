import { Module } from "@nestjs/common";
import { ViaCepController } from "./viacep.controller";
import { ViaCepService } from "./viacep.service";

@Module({
  controllers: [ViaCepController],
  providers: [ViaCepService],
})
export class ViaCepModule {}
