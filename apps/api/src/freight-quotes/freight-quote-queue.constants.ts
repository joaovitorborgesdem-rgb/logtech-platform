import { UserRole } from "@prisma/client";

export const FREIGHT_QUOTE_QUEUE = "freight-quote-calculation";
export const FREIGHT_QUOTE_CALCULATION_JOB = "calculate-options";

export interface FreightQuoteJobData {
  quoteId: string;
  tenantId: string;
  userId: string;
  role: UserRole;
}
