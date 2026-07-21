import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { FreightQuoteStatus } from "@prisma/client";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import {
  INSIGHTS_QUEUE,
  InsightsAggregationJobData,
} from "./insights-queue.constants";

function resolveTargetDayStart(dateInput: string | undefined): Date {
  if (dateInput) {
    return new Date(`${dateInput}T00:00:00.000Z`);
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  return yesterday;
}

/**
 * Job diário (BullMQ repeatable, ver ADR-009) que pré-agrega, por tenant, as
 * métricas do dia anterior em `DailyMetricsSnapshot`. Roda fora de qualquer
 * contexto de tenant e itera todos os tenants, então usa `PrismaService` cru
 * (não o `TENANT_SCOPED_PRISMA`) e filtra `tenantId` manualmente em cada
 * consulta — mesmo racional do `FreightQuoteCalculationProcessor` (ADR-006),
 * mas aqui não há um único tenant por job, então não há contexto único a
 * reconstruir via `runWithTenantContext`.
 */
@Processor(INSIGHTS_QUEUE)
export class InsightsAggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(InsightsAggregationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<InsightsAggregationJobData>): Promise<void> {
    const dayStart = resolveTargetDayStart(job.data?.date);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });

    for (const tenant of tenants) {
      await this.aggregateTenantDay(tenant.id, dayStart, dayEnd);
    }

    this.logger.log(
      `Agregação diária concluída para ${tenants.length} tenant(s) — dia ${dayStart
        .toISOString()
        .slice(0, 10)}`,
    );
  }

  private async aggregateTenantDay(
    tenantId: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<void> {
    const [totalQuotes, statusGroups, priceAggregate, cargoAggregate] =
      await Promise.all([
        this.prisma.freightQuote.count({
          where: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        this.prisma.freightQuote.groupBy({
          by: ["status"],
          where: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: dayStart, lt: dayEnd },
          },
          _count: true,
        }),
        this.prisma.freightQuoteOption.aggregate({
          _avg: { price: true },
          _sum: { price: true },
          where: {
            quote: {
              tenantId,
              deletedAt: null,
              status: FreightQuoteStatus.DONE,
              createdAt: { gte: dayStart, lt: dayEnd },
            },
          },
        }),
        this.prisma.freightQuote.aggregate({
          _sum: { cargoValue: true },
          where: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

    if (totalQuotes === 0) {
      return;
    }

    const doneCount =
      statusGroups.find((group) => group.status === FreightQuoteStatus.DONE)
        ?._count ?? 0;
    const errorCount =
      statusGroups.find((group) => group.status === FreightQuoteStatus.ERROR)
        ?._count ?? 0;

    const snapshotData = {
      totalQuotes,
      doneCount,
      errorCount,
      totalCargoValue: cargoAggregate._sum.cargoValue ?? 0,
      totalQuotedValue: priceAggregate._sum.price ?? 0,
      avgFreightPrice: priceAggregate._avg.price ?? null,
    };

    await this.prisma.dailyMetricsSnapshot.upsert({
      where: { tenantId_date: { tenantId, date: dayStart } },
      create: { tenantId, date: dayStart, ...snapshotData },
      update: snapshotData,
    });
  }
}
