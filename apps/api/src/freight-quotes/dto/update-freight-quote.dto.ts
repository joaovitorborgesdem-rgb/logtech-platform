import { PartialType } from "@nestjs/mapped-types";
import { FreightQuoteStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { CreateFreightQuoteDto } from "./create-freight-quote.dto";

export class UpdateFreightQuoteDto extends PartialType(CreateFreightQuoteDto) {
  @IsOptional()
  @IsEnum(FreightQuoteStatus)
  status?: FreightQuoteStatus;
}
