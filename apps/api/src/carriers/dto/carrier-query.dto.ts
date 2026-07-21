import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

const SORTABLE_FIELDS = [
  "name",
  "document",
  "city",
  "state",
  "createdAt",
  "updatedAt",
] as const;

export class CarrierQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: (typeof SORTABLE_FIELDS)[number] = "createdAt";
}
