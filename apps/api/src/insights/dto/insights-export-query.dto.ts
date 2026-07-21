import { IsIn } from "class-validator";

export type InsightsExportFormat = "csv" | "pdf";

export class InsightsExportQueryDto {
  @IsIn(["csv", "pdf"])
  format!: InsightsExportFormat;
}
