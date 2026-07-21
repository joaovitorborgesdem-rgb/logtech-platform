import { InternalServerErrorException } from "@nestjs/common";
import { FreightQuoteStatus, UserRole } from "@prisma/client";
import { Queue } from "bullmq";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import * as tenantContext from "../tenant/tenant-context";
import { InsightsService } from "./insights.service";

describe("InsightsService", () => {
  let service: InsightsService;
  let prisma: {
    dailyMetricsSnapshot: { findMany: jest.Mock };
    freightQuote: {
      count: jest.Mock;
      groupBy: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    freightQuoteOption: { aggregate: jest.Mock; groupBy: jest.Mock };
    carrier: { findMany: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let getTenantContextSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      dailyMetricsSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      freightQuote: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { cargoValue: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      freightQuoteOption: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _avg: { price: null }, _sum: { price: null } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      carrier: { findMany: jest.fn().mockResolvedValue([]) },
    };
    queue = { add: jest.fn().mockResolvedValue({ id: "job-1" }) };

    getTenantContextSpy = jest
      .spyOn(tenantContext, "getTenantContext")
      .mockReturnValue({
        tenantId: "tenant-1",
        userId: "user-1",
        role: UserRole.MEMBER,
      });

    service = new InsightsService(
      prisma as unknown as TenantScopedPrismaClient,
      queue as unknown as Queue,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    getTenantContextSpy.mockRestore();
  });

  describe("onModuleInit", () => {
    it("registra o job repetível diário com jobId fixo", async () => {
      await service.onModuleInit();

      expect(queue.add).toHaveBeenCalledWith(
        "aggregate-daily-metrics",
        {},
        {
          repeat: { pattern: "0 1 * * *" },
          jobId: "daily-metrics-aggregation",
        },
      );
    });
  });

  describe("triggerAggregation", () => {
    it("enfileira um job avulso com a data informada", async () => {
      const result = await service.triggerAggregation("2026-07-20");

      expect(queue.add).toHaveBeenCalledWith("aggregate-daily-metrics", {
        date: "2026-07-20",
      });
      expect(result).toEqual({ jobId: "job-1" });
    });
  });

  describe("getTrend", () => {
    it("lança quando não há contexto de tenant", async () => {
      getTenantContextSpy.mockReturnValue(undefined);

      await expect(service.getTrend(7)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it("retorna clampedDays pontos, combinando snapshots com o dia atual calculado ao vivo", async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      prisma.dailyMetricsSnapshot.findMany.mockResolvedValue([
        {
          date: yesterday,
          totalQuotes: 4,
          doneCount: 3,
          errorCount: 1,
          totalCargoValue: "800.00",
          totalQuotedValue: "200.00",
          avgFreightPrice: "50.00",
        },
      ]);
      prisma.freightQuote.count.mockResolvedValue(2);
      prisma.freightQuote.groupBy.mockResolvedValue([
        { status: FreightQuoteStatus.DONE, _count: 2 },
      ]);
      prisma.freightQuoteOption.aggregate.mockResolvedValue({
        _avg: { price: "30.00" },
        _sum: { price: "60.00" },
      });
      prisma.freightQuote.aggregate.mockResolvedValue({
        _sum: { cargoValue: "300.00" },
      });

      const result = await service.getTrend(7);

      expect(result).toHaveLength(7);
      const todayKey = new Date().toISOString().slice(0, 10);
      const todayPoint = result.find((p) => p.date === todayKey);
      expect(todayPoint).toMatchObject({
        totalQuotes: 2,
        doneCount: 2,
        avgFreightPrice: 30,
      });

      const yesterdayKey = yesterday.toISOString().slice(0, 10);
      const yesterdayPoint = result.find((p) => p.date === yesterdayKey);
      expect(yesterdayPoint).toMatchObject({
        totalQuotes: 4,
        doneCount: 3,
        errorCount: 1,
        totalCargoValue: 800,
        avgFreightPrice: 50,
      });
    });

    it("limita days a no máximo 180", async () => {
      await service.getTrend(500);

      expect(prisma.dailyMetricsSnapshot.findMany).toHaveBeenCalled();
    });
  });

  describe("getCarrierPerformance", () => {
    it("retorna vazio quando não há opções geradas", async () => {
      const result = await service.getCarrierPerformance();
      expect(result).toEqual([]);
      expect(prisma.carrier.findMany).not.toHaveBeenCalled();
    });

    it("retorna o ranking de transportadoras ordenado por volume", async () => {
      prisma.freightQuoteOption.groupBy.mockResolvedValue([
        {
          carrierId: "carrier-1",
          _count: 5,
          _avg: { price: "40.00", estimatedDays: 2 },
        },
        {
          carrierId: "carrier-2",
          _count: 10,
          _avg: { price: "60.00", estimatedDays: 3 },
        },
      ]);
      prisma.carrier.findMany.mockResolvedValue([
        { id: "carrier-1", name: "Transportadora A" },
        { id: "carrier-2", name: "Transportadora B" },
      ]);

      const result = await service.getCarrierPerformance();

      expect(result).toEqual([
        {
          carrierId: "carrier-2",
          carrierName: "Transportadora B",
          quotesCount: 10,
          avgPrice: 60,
          avgEstimatedDays: 3,
        },
        {
          carrierId: "carrier-1",
          carrierName: "Transportadora A",
          quotesCount: 5,
          avgPrice: 40,
          avgEstimatedDays: 2,
        },
      ]);
    });
  });

  describe("exportReport", () => {
    it("gera CSV a partir das cotações do tenant", async () => {
      prisma.freightQuote.findMany.mockResolvedValue([
        {
          id: "quote-1",
          createdAt: new Date("2026-07-21T10:00:00.000Z"),
          originZipCode: "01310-100",
          destinationZipCode: "20040-020",
          weightKg: "12.5",
          cargoValue: "500.00",
          status: FreightQuoteStatus.DONE,
          options: [{ price: "54.40" }],
        },
      ]);

      const result = await service.exportReport("csv");

      expect(result.contentType).toBe("text/csv");
      expect(result.filename).toBe("freight-quotes-report.csv");
      expect(result.buffer.toString("utf-8")).toContain("quote-1");
    });

    it("gera PDF a partir das cotações do tenant", async () => {
      prisma.freightQuote.findMany.mockResolvedValue([]);

      const result = await service.exportReport("pdf");

      expect(result.contentType).toBe("application/pdf");
      expect(result.buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    });
  });
});
