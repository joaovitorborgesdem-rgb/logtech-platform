import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { FreightQuoteStatus } from "@prisma/client";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { RedisService } from "../redis/redis.service";
import { getTenantContext } from "../tenant/tenant-context";
import { DashboardMetrics } from "./dashboard-metrics.interface";

const CACHE_TTL_SECONDS = 30;
const TREND_DAYS = 7;

function buildCacheKey(tenantId: string): string {
  return `dashboard:metrics:${tenantId}`;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
    private readonly redis: RedisService,
  ) {}

  /**
   * Métricas cacheadas em Redis por `CACHE_TTL_SECONDS` (ver ADR-008) — o
   * dashboard não precisa refletir mutações em tempo real, então um cache
   * curto por tenant evita recalcular agregações a cada carregamento da tela.
   */
  async getMetrics(): Promise<DashboardMetrics> {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new InternalServerErrorException(
        "Contexto de tenant ausente ao calcular métricas do dashboard",
      );
    }

    const cacheKey = buildCacheKey(tenantContext.tenantId);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as DashboardMetrics;
    }

    const metrics = await this.computeMetrics(tenantContext.tenantId);
    await this.redis.set(
      cacheKey,
      JSON.stringify(metrics),
      "EX",
      CACHE_TTL_SECONDS,
    );

    return metrics;
  }

  private async computeMetrics(tenantId: string): Promise<DashboardMetrics> {
    const trendStart = new Date();
    trendStart.setUTCHours(0, 0, 0, 0);
    trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));

    const [
      totalFreightQuotes,
      statusGroups,
      totalActiveCarriers,
      totalActiveClients,
      priceAggregate,
      recentQuotes,
    ] = await Promise.all([
      this.prisma.freightQuote.count({ where: { deletedAt: null } }),
      this.prisma.freightQuote.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.carrier.count({ where: { active: true, deletedAt: null } }),
      this.prisma.client.count({ where: { deletedAt: null } }),
      this.prisma.freightQuoteOption.aggregate({
        _avg: { price: true },
        where: {
          quote: {
            tenantId,
            deletedAt: null,
            status: FreightQuoteStatus.DONE,
          },
        },
      }),
      this.prisma.freightQuote.findMany({
        where: { deletedAt: null, createdAt: { gte: trendStart } },
        select: { createdAt: true },
      }),
    ]);

    const freightQuotesByStatus = this.buildStatusCounts(statusGroups);
    const errorCount = freightQuotesByStatus[FreightQuoteStatus.ERROR];
    const errorRate =
      totalFreightQuotes > 0 ? errorCount / totalFreightQuotes : 0;

    return {
      totalFreightQuotes,
      freightQuotesByStatus,
      avgFreightPrice: priceAggregate._avg.price
        ? Number(priceAggregate._avg.price)
        : null,
      totalActiveCarriers,
      totalActiveClients,
      errorRate,
      freightQuotesLast7Days: this.buildTrend(recentQuotes),
      generatedAt: new Date().toISOString(),
    };
  }

  private buildStatusCounts(
    groups: { status: FreightQuoteStatus; _count: number }[],
  ): Record<FreightQuoteStatus, number> {
    const counts = Object.fromEntries(
      Object.values(FreightQuoteStatus).map((status) => [status, 0]),
    ) as Record<FreightQuoteStatus, number>;

    for (const group of groups) {
      counts[group.status] = group._count;
    }

    return counts;
  }

  private buildTrend(
    quotes: { createdAt: Date }[],
  ): { date: string; count: number }[] {
    const buckets = new Map<string, number>();
    const now = new Date();

    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - i);
      buckets.set(date.toISOString().slice(0, 10), 0);
    }

    for (const quote of quotes) {
      const key = quote.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }
}
