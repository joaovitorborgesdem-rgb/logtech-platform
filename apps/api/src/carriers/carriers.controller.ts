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
import { CarriersService } from "./carriers.service";
import { CarrierQueryDto } from "./dto/carrier-query.dto";
import { CreateCarrierDto } from "./dto/create-carrier.dto";
import { UpdateCarrierDto } from "./dto/update-carrier.dto";

@Controller("carriers")
@UseGuards(JwtAuthGuard)
export class CarriersController {
  constructor(private readonly carriersService: CarriersService) {}

  @Post()
  create(@Body() dto: CreateCarrierDto) {
    return this.carriersService.create(dto);
  }

  @Get()
  findAll(@Query() query: CarrierQueryDto) {
    return this.carriersService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.carriersService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCarrierDto) {
    return this.carriersService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.carriersService.remove(id, user.id);
  }
}
