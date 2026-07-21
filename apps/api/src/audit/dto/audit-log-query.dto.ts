import { AuditAction } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

const SORTABLE_FIELDS = ["createdAt", "action"] as const;

export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: (typeof SORTABLE_FIELDS)[number] = "createdAt";
}
