import { FreightQuoteStatus } from "@prisma/client";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { InsightsAggregationProcessor } from "./insights-aggregation.processor";
import { InsightsAggregationJobData } from "./insights-queue.constants";

describe("InsightsAggregationProcessor", () => {
  let processor: InsightsAggregationProcessor;
  let prisma: {
    tenant: { findMany: jest.Mock };
    freightQuote: {
      count: jest.Mock;
      groupBy: jest.Mock;
      aggregate: jest.Mock;
    };
    freightQuoteOption: { aggregate: jest.Mock };
    dailyMetricsSnapshot: { upsert: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      tenant: { findMany: jest.fn() },
      freightQuote: {
        count: jest.fn(),
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
      freightQuoteOption: { aggregate: jest.fn() },
      dailyMetricsSnapshot: { upsert: jest.fn() },
    };

    processor = new InsightsAggregationProcessor(
      prisma as unknown as PrismaService,
    );
  });

  it("agrega o dia informado no job.data.date para cada tenant", async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: "tenant-1" },
      { id: "tenant-2" },
    ]);
    prisma.freightQuote.count.mockResolvedValue(5);
    prisma.freightQuote.groupBy.mockResolvedValue([
      { status: FreightQuoteStatus.DONE, _count: 3 },
      { status: FreightQuoteStatus.ERROR, _count: 1 },
    ]);
    prisma.freightQuoteOption.aggregate.mockResolvedValue({
      _avg: { price: "40.00" },
      _sum: { price: "120.00" },
    });
    prisma.freightQuote.aggregate.mockResolvedValue({
      _sum: { cargoValue: "1500.00" },
    });

    const job = {
      data: { date: "2026-07-20" },
    } as Job<InsightsAggregationJobData>;

    await processor.process(job);

    expect(prisma.dailyMetricsSnapshot.upsert).toHaveBeenCalledTimes(2);

    const [firstCall] = prisma.dailyMetricsSnapshot.upsert.mock.calls as Array<
      [
        {
          where: { tenantId_date: { tenantId: string; date: Date } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        },
      ]
    >;

    expect(firstCall[0].where.tenantId_date.tenantId).toBe("tenant-1");
    expect(firstCall[0].where.tenantId_date.date.toISOString()).toBe(
      "2026-07-20T00:00:00.000Z",
    );
    expect(firstCall[0].create).toMatchObject({
      tenantId: "tenant-1",
      totalQuotes: 5,
      doneCount: 3,
      errorCount: 1,
      totalCargoValue: "1500.00",
      totalQuotedValue: "120.00",
      avgFreightPrice: "40.00",
    });
  });

  it("não grava snapshot para tenants sem cotações no dia", async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: "tenant-1" }]);
    prisma.freightQuote.count.mockResolvedValue(0);
    prisma.freightQuote.groupBy.mockResolvedValue([]);
    prisma.freightQuoteOption.aggregate.mockResolvedValue({
      _avg: { price: null },
      _sum: { price: null },
    });
    prisma.freightQuote.aggregate.mockResolvedValue({
      _sum: { cargoValue: null },
    });

    const job = {
      data: { date: "2026-07-20" },
    } as Job<InsightsAggregationJobData>;

    await processor.process(job);

    expect(prisma.dailyMetricsSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("agrega o dia anterior (UTC) quando nenhuma data é informada", async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: "tenant-1" }]);
    prisma.freightQuote.count.mockResolvedValue(1);
    prisma.freightQuote.groupBy.mockResolvedValue([
      { status: FreightQuoteStatus.DONE, _count: 1 },
    ]);
    prisma.freightQuoteOption.aggregate.mockResolvedValue({
      _avg: { price: "10.00" },
      _sum: { price: "10.00" },
    });
    prisma.freightQuote.aggregate.mockResolvedValue({
      _sum: { cargoValue: "50.00" },
    });

    const job = { data: {} } as Job<InsightsAggregationJobData>;
    await processor.process(job);

    const expectedYesterday = new Date();
    expectedYesterday.setUTCDate(expectedYesterday.getUTCDate() - 1);
    expectedYesterday.setUTCHours(0, 0, 0, 0);

    const [call] = prisma.dailyMetricsSnapshot.upsert.mock.calls as Array<
      [{ where: { tenantId_date: { date: Date } } }]
    >;
    expect(call[0].where.tenantId_date.date.toISOString()).toBe(
      expectedYesterday.toISOString(),
    );
  });
});
