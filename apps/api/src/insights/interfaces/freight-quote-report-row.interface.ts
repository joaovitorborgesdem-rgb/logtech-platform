export interface FreightQuoteReportRow {
  id: string;
  createdAt: string;
  originZipCode: string;
  destinationZipCode: string;
  weightKg: number;
  cargoValue: number;
  status: string;
  bestPrice: number | null;
}
