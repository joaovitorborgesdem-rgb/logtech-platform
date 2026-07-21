import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class InsightsTrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days: number = 30;
}
