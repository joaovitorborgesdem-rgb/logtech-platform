import { PrismaClient } from "@prisma/client";

/**
 * Nomes de tabela = nomes dos models (nenhum `@@map` no schema.prisma).
 * FK checks desligados durante o delete para não precisar respeitar a ordem
 * de dependência entre tabelas. `DELETE FROM` em vez de `TRUNCATE`: TRUNCATE
 * é DDL (commit implícito) e, neste MySQL local, ~1.4s por tabela — 10
 * tabelas deixavam o `beforeEach` de cada spec estourando o timeout da
 * transação. `DELETE FROM` nas mesmas tabelas é ~0.2s no total.
 */
const TABLES = [
  "AuditLog",
  "Attachment",
  "DailyMetricsSnapshot",
  "FreightQuoteOption",
  "FreightQuote",
  "RefreshToken",
  "Client",
  "Carrier",
  "User",
  "Tenant",
];

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // `$transaction` fixa uma única conexão do pool para todo o callback —
  // sem isso, o `SET FOREIGN_KEY_CHECKS=0` e os deletes podem cair em
  // conexões diferentes do driver adapter e o flag não valer.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of TABLES) {
      await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    }
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  });
}
