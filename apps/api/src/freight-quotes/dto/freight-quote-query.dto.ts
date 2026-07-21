import { FreightQuoteStatus } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

const SORTABLE_FIELDS = [
  "createdAt",
  "updatedAt",
  "weightKg",
  "cargoValue",
  "status",
] as const;

export class FreightQuoteQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(FreightQuoteStatus)
  status?: FreightQuoteStatus;

  @IsOptional()
  @IsString()
  originZipCode?: string;

  @IsOptional()
  @IsString()
  destinationZipCode?: string;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: (typeof SORTABLE_FIELDS)[number] = "createdAt";
}
