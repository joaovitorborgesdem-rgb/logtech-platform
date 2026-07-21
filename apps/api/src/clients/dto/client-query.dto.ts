import { IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

const SORTABLE_FIELDS = [
  "name",
  "email",
  "document",
  "city",
  "state",
  "createdAt",
  "updatedAt",
] as const;

export class ClientQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

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
  @IsIn(SORTABLE_FIELDS)
  sortBy: (typeof SORTABLE_FIELDS)[number] = "createdAt";
}
