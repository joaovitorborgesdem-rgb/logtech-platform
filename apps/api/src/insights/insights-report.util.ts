import PDFDocument from "pdfkit";
import { FreightQuoteReportRow } from "./interfaces/freight-quote-report-row.interface";

const CSV_COLUMNS: { key: keyof FreightQuoteReportRow; header: string }[] = [
  { key: "id", header: "ID" },
  { key: "createdAt", header: "Criado em" },
  { key: "originZipCode", header: "CEP origem" },
  { key: "destinationZipCode", header: "CEP destino" },
  { key: "weightKg", header: "Peso (kg)" },
  { key: "cargoValue", header: "Valor da carga (R$)" },
  { key: "status", header: "Status" },
  { key: "bestPrice", header: "Melhor preço (R$)" },
];

function escapeCsvValue(value: string | number | null): string {
  const stringValue = value === null ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildCsvReport(rows: FreightQuoteReportRow[]): string {
  const header = CSV_COLUMNS.map((column) =>
    escapeCsvValue(column.header),
  ).join(",");
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(row[column.key])).join(","),
  );

  return [header, ...lines].join("\n");
}

export function buildPdfReport(rows: FreightQuoteReportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      layout: "landscape",
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Relatório de cotações de frete");
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text(
        `Gerado em ${new Date().toISOString()} — ${rows.length} registro(s)`,
      );
    doc.moveDown(1);

    doc.fontSize(9).fillColor("#000000");
    for (const row of rows) {
      const bestPriceLabel =
        row.bestPrice !== null ? `R$ ${row.bestPrice.toFixed(2)}` : "—";
      doc.text(
        `${row.createdAt} | ${row.originZipCode} -> ${row.destinationZipCode} | ` +
          `${row.weightKg}kg | R$ ${row.cargoValue.toFixed(2)} | ${row.status} | ${bestPriceLabel}`,
      );
    }

    doc.end();
  });
}
