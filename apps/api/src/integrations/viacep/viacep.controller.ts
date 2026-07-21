import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { SearchCepDto } from "./dto/search-cep.dto";
import { ViaCepService } from "./viacep.service";

@Controller("integrations/viacep")
@UseGuards(JwtAuthGuard)
export class ViaCepController {
  constructor(private readonly viaCepService: ViaCepService) {}

  @Get("search")
  search(@Query() query: SearchCepDto) {
    return this.viaCepService.searchByAddress(
      query.uf,
      query.city,
      query.street,
    );
  }
}
