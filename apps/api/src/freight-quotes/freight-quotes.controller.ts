import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";
import { CreateFreightQuoteDto } from "./dto/create-freight-quote.dto";
import { FreightQuoteQueryDto } from "./dto/freight-quote-query.dto";
import { UpdateFreightQuoteDto } from "./dto/update-freight-quote.dto";
import { FreightQuotesService } from "./freight-quotes.service";

@Controller("freight-quotes")
@UseGuards(JwtAuthGuard)
export class FreightQuotesController {
  constructor(private readonly freightQuotesService: FreightQuotesService) {}

  @Post()
  create(
    @Body() dto: CreateFreightQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.freightQuotesService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: FreightQuoteQueryDto) {
    return this.freightQuotesService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.freightQuotesService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateFreightQuoteDto) {
    return this.freightQuotesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.freightQuotesService.remove(id, user.id);
  }
}
