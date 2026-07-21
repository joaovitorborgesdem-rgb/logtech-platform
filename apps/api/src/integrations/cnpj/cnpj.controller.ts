import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CnpjService } from "./cnpj.service";
import { CnpjParamDto } from "./dto/cnpj-param.dto";

@Controller("integrations/cnpj")
@UseGuards(JwtAuthGuard)
export class CnpjController {
  constructor(private readonly cnpjService: CnpjService) {}

  @Get(":cnpj")
  lookup(@Param() params: CnpjParamDto) {
    return this.cnpjService.lookup(params.cnpj);
  }
}
