import { IsOptional, IsString, Matches } from "class-validator";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class TriggerAggregationDto {
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_REGEX, { message: "date deve estar no formato YYYY-MM-DD" })
  date?: string;
}
