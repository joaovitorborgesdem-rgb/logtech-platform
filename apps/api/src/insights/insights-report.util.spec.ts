import { FreightQuoteReportRow } from "./interfaces/freight-quote-report-row.interface";
import { buildCsvReport, buildPdfReport } from "./insights-report.util";

describe("insights-report.util", () => {
  const rows: FreightQuoteReportRow[] = [
    {
      id: "quote-1",
      createdAt: "2026-07-21T10:00:00.000Z",
      originZipCode: "01310-100",
      destinationZipCode: "20040-020",
      weightKg: 12.5,
      cargoValue: 500,
      status: "DONE",
      bestPrice: 54.4,
    },
    {
      id: "quote-2",
      createdAt: "2026-07-21T11:00:00.000Z",
      originZipCode: "01310-100",
      destinationZipCode: "20040-020",
      weightKg: 5,
      cargoValue: 100,
      status: "ERROR",
      bestPrice: null,
    },
  ];

  describe("buildCsvReport", () => {
    it("gera cabeçalho e uma linha por cotação", () => {
      const csv = buildCsvReport(rows);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(
        "ID,Criado em,CEP origem,CEP destino,Peso (kg),Valor da carga (R$),Status,Melhor preço (R$)",
      );
      expect(lines[1]).toContain("quote-1");
      expect(lines[1]).toContain("54.4");
      expect(lines[2]).toContain("quote-2");
    });

    it("escapa valores nulos como campo vazio", () => {
      const csv = buildCsvReport(rows);
      const lines = csv.split("\n");

      expect(lines[2].endsWith(",")).toBe(true);
    });

    it("escapa vírgulas e aspas em campos", () => {
      const csv = buildCsvReport([
        { ...rows[0], originZipCode: 'contains "quotes", and comma' },
      ]);

      expect(csv).toContain('"contains ""quotes"", and comma"');
    });

    it("retorna apenas o cabeçalho quando não há linhas", () => {
      const csv = buildCsvReport([]);
      expect(csv.split("\n")).toHaveLength(1);
    });
  });

  describe("buildPdfReport", () => {
    it("gera um buffer com o cabeçalho de arquivo PDF", async () => {
      const buffer = await buildPdfReport(rows);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    });
  });
});
