export interface DailyMetricPoint {
  date: string;
  totalQuotes: number;
  doneCount: number;
  errorCount: number;
  totalCargoValue: number;
  totalQuotedValue: number;
  avgFreightPrice: number | null;
}
