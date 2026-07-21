import { FreightQuoteStatus } from "@prisma/client";

export interface DashboardMetrics {
  totalFreightQuotes: number;
  freightQuotesByStatus: Record<FreightQuoteStatus, number>;
  avgFreightPrice: number | null;
  totalActiveCarriers: number;
  totalActiveClients: number;
  errorRate: number;
  freightQuotesLast7Days: { date: string; count: number }[];
  generatedAt: string;
}
