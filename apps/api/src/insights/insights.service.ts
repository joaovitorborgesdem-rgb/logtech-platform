import { InjectQueue } from "@nestjs/bullmq";
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from "@nestjs/common";
import { FreightQuoteStatus } from "@prisma/client";
import { Queue } from "bullmq";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { getTenantContext, TenantContext } from "../tenant/tenant-context";
import { CarrierPerformance } from "./interfaces/carrier-performance.interface";
import { DailyMetricPoint } from "./interfaces/daily-metric-point.interface";
import { FreightQuoteReportRow } from "./interfaces/freight-quote-report-row.interface";
import { buildCsvReport, buildPdfReport } from "./insights-report.util";
import {
  DAILY_AGGREGATION_REPEAT_JOB_ID,
  INSIGHTS_AGGREGATION_JOB,
  INSIGHTS_QUEUE,
  InsightsAggregationJobData,
} from "./insights-queue.constants";
import { InsightsExportFormat } from "./dto/insights-export-query.dto";

const MAX_TREND_DAYS = 180;
const EXPORT_ROW_LIMIT = 500;
const DAILY_AGGREGATION_CRON = "0 1 * * *";

export interface ExportedReport {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

@Injectable()
export class InsightsService implements OnModuleInit {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
    @InjectQueue(INSIGHTS_QUEUE)
    private readonly insightsQueue: Queue<InsightsAggregationJobData>,
  ) {}

  /**
   * Registra o job repetível diário uma única vez (jobId fixo evita
   * duplicar o agendamento a cada restart do processo, ver ADR-009).
   */
  async onModuleInit(): Promise<void> {
    await this.insightsQueue.add(
      INSIGHTS_AGGREGATION_JOB,
      {},
      {
        repeat: { pattern: DAILY_AGGREGATION_CRON },
        jobId: DAILY_AGGREGATION_REPEAT_JOB_ID,
      },
    );
  }

  async triggerAggregation(date?: string): Promise<{ jobId: string }> {
    const job = await this.insightsQueue.add(INSIGHTS_AGGREGATION_JOB, {
      date,
    });
    return { jobId: job.id ?? "" };
  }

  async getTrend(days: number): Promise<DailyMetricPoint[]> {
    const { tenantId } = this.requireTenantContext();
    const clampedDays = Math.min(Math.max(days, 1), MAX_TREND_DAYS);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const rangeStart = new Date(todayStart);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (clampedDays - 1));

    const [snapshots, todayPoint] = await Promise.all([
      this.prisma.dailyMetricsSnapshot.findMany({
        where: { date: { gte: rangeStart, lt: todayStart } },
        orderBy: { date: "asc" },
      }),
      this.computeLiveDay(tenantId, todayStart),
    ]);

    const points = new Map<string, DailyMetricPoint>();
    for (let i = 0; i < clampedDays; i++) {
      const date = new Date(rangeStart);
      date.setUTCDate(date.getUTCDate() + i);
      const key = date.toISOString().slice(0, 10);
      points.set(key, {
        date: key,
        totalQuotes: 0,
        doneCount: 0,
        errorCount: 0,
        totalCargoValue: 0,
        totalQuotedValue: 0,
        avgFreightPrice: null,
      });
    }

    for (const snapshot of snapshots) {
      const key = snapshot.date.toISOString().slice(0, 10);
      points.set(key, {
        date: key,
        totalQuotes: snapshot.totalQuotes,
        doneCount: snapshot.doneCount,
        errorCount: snapshot.errorCount,
        totalCargoValue: Number(snapshot.totalCargoValue),
        totalQuotedValue: Number(snapshot.totalQuotedValue),
        avgFreightPrice: snapshot.avgFreightPrice
          ? Number(snapshot.avgFreightPrice)
          : null,
      });
    }

    points.set(todayPoint.date, todayPoint);

    return Array.from(points.values());
  }

  async getCarrierPerformance(): Promise<CarrierPerformance[]> {
    const { tenantId } = this.requireTenantContext();

    const groups = await this.prisma.freightQuoteOption.groupBy({
      by: ["carrierId"],
      where: { quote: { tenantId, deletedAt: null } },
      _count: true,
      _avg: { price: true, estimatedDays: true },
    });

    if (groups.length === 0) {
      return [];
    }

    const carriers = await this.prisma.carrier.findMany({
      where: { id: { in: groups.map((group) => group.carrierId) } },
      select: { id: true, name: true },
    });
    const carrierNameById = new Map(
      carriers.map((carrier) => [carrier.id, carrier.name]),
    );

    return groups
      .map((group) => ({
        carrierId: group.carrierId,
        carrierName: carrierNameById.get(group.carrierId) ?? "—",
        quotesCount: group._count,
        avgPrice: group._avg.price ? Number(group._avg.price) : 0,
        avgEstimatedDays: group._avg.estimatedDays ?? null,
      }))
      .sort((a, b) => b.quotesCount - a.quotesCount);
  }

  async exportReport(format: InsightsExportFormat): Promise<ExportedReport> {
    this.requireTenantContext();

    const quotes = await this.prisma.freightQuote.findMany({
      where: { deletedAt: null },
      include: { options: { orderBy: { price: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: EXPORT_ROW_LIMIT,
    });

    const rows: FreightQuoteReportRow[] = quotes.map((quote) => ({
      id: quote.id,
      createdAt: quote.createdAt.toISOString(),
      originZipCode: quote.originZipCode,
      destinationZipCode: quote.destinationZipCode,
      weightKg: Number(quote.weightKg),
      cargoValue: Number(quote.cargoValue),
      status: quote.status,
      bestPrice: quote.options[0] ? Number(quote.options[0].price) : null,
    }));

    if (format === "csv") {
      return {
        buffer: Buffer.from(buildCsvReport(rows), "utf-8"),
        filename: "freight-quotes-report.csv",
        contentType: "text/csv",
      };
    }

    return {
      buffer: await buildPdfReport(rows),
      filename: "freight-quotes-report.pdf",
      contentType: "application/pdf",
    };
  }

  private async computeLiveDay(
    tenantId: string,
    dayStart: Date,
  ): Promise<DailyMetricPoint> {
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const [totalQuotes, statusGroups, priceAggregate, cargoAggregate] =
      await Promise.all([
        this.prisma.freightQuote.count({
          where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } },
        }),
        this.prisma.freightQuote.groupBy({
          by: ["status"],
          where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } },
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
          where: { deletedAt: null, createdAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);

    const doneCount =
      statusGroups.find((group) => group.status === FreightQuoteStatus.DONE)
        ?._count ?? 0;
    const errorCount =
      statusGroups.find((group) => group.status === FreightQuoteStatus.ERROR)
        ?._count ?? 0;

    return {
      date: dayStart.toISOString().slice(0, 10),
      totalQuotes,
      doneCount,
      errorCount,
      totalCargoValue: cargoAggregate._sum.cargoValue
        ? Number(cargoAggregate._sum.cargoValue)
        : 0,
      totalQuotedValue: priceAggregate._sum.price
        ? Number(priceAggregate._sum.price)
        : 0,
      avgFreightPrice: priceAggregate._avg.price
        ? Number(priceAggregate._avg.price)
        : null,
    };
  }

  private requireTenantContext(): TenantContext {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new InternalServerErrorException(
        "Contexto de tenant ausente ao calcular insights",
      );
    }
    return tenantContext;
  }
}
