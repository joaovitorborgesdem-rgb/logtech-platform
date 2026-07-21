export const INSIGHTS_QUEUE = "insights-daily-aggregation";
export const INSIGHTS_AGGREGATION_JOB = "aggregate-daily-metrics";
export const DAILY_AGGREGATION_REPEAT_JOB_ID = "daily-metrics-aggregation";

export interface InsightsAggregationJobData {
  /** Data (YYYY-MM-DD, UTC) a agregar. Quando ausente, agrega o dia anterior. */
  date?: string;
}
