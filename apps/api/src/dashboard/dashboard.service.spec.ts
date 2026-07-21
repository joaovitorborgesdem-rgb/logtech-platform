import { FreightQuoteStatus, UserRole } from "@prisma/client";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import { RedisService } from "../redis/redis.service";
import * as tenantContext from "../tenant/tenant-context";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: {
    freightQuote: { count: jest.Mock; groupBy: jest.Mock; findMany: jest.Mock };
    carrier: { count: jest.Mock };
    client: { count: jest.Mock };
    freightQuoteOption: { aggregate: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock };
  let getTenantContextSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      freightQuote: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([
          { status: FreightQuoteStatus.DONE, _count: 7 },
          { status: FreightQuoteStatus.ERROR, _count: 1 },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      carrier: { count: jest.fn().mockResolvedValue(3) },
      client: { count: jest.fn().mockResolvedValue(5) },
      freightQuoteOption: {
        aggregate: jest.fn().mockResolvedValue({ _avg: { price: "42.50" } }),
      },
    };
    redis = { get: jest.fn(), set: jest.fn() };

    getTenantContextSpy = jest
      .spyOn(tenantContext, "getTenantContext")
      .mockReturnValue({
        tenantId: "tenant-1",
        userId: "user-1",
        role: UserRole.MEMBER,
      });

    service = new DashboardService(
      prisma as unknown as TenantScopedPrismaClient,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    getTenantContextSpy.mockRestore();
  });

  it("retorna métricas do cache quando disponíveis, sem consultar o banco", async () => {
    const cachedMetrics = { totalFreightQuotes: 99 };
    redis.get.mockResolvedValue(JSON.stringify(cachedMetrics));

    const result = await service.getMetrics();

    expect(result).toEqual(cachedMetrics);
    expect(prisma.freightQuote.count).not.toHaveBeenCalled();
  });

  it("calcula e cacheia as métricas quando não há cache", async () => {
    redis.get.mockResolvedValue(null);

    const result = await service.getMetrics();

    expect(result.totalFreightQuotes).toBe(10);
    expect(result.freightQuotesByStatus).toEqual({
      PENDING: 0,
      PROCESSING: 0,
      DONE: 7,
      ERROR: 1,
    });
    expect(result.avgFreightPrice).toBe(42.5);
    expect(result.totalActiveCarriers).toBe(3);
    expect(result.totalActiveClients).toBe(5);
    expect(result.errorRate).toBeCloseTo(0.1, 5);
    expect(result.freightQuotesLast7Days).toHaveLength(7);

    expect(prisma.freightQuoteOption.aggregate).toHaveBeenCalledWith({
      _avg: { price: true },
      where: {
        quote: {
          tenantId: "tenant-1",
          deletedAt: null,
          status: FreightQuoteStatus.DONE,
        },
      },
    });

    expect(redis.set).toHaveBeenCalledWith(
      "dashboard:metrics:tenant-1",
      expect.any(String),
      "EX",
      30,
    );
  });

  it("retorna avgFreightPrice nulo e errorRate 0 quando não há cotações", async () => {
    redis.get.mockResolvedValue(null);
    prisma.freightQuote.count.mockResolvedValue(0);
    prisma.freightQuote.groupBy.mockResolvedValue([]);
    prisma.freightQuoteOption.aggregate.mockResolvedValue({
      _avg: { price: null },
    });

    const result = await service.getMetrics();

    expect(result.avgFreightPrice).toBeNull();
    expect(result.errorRate).toBe(0);
    expect(result.freightQuotesByStatus).toEqual({
      PENDING: 0,
      PROCESSING: 0,
      DONE: 0,
      ERROR: 0,
    });
  });

  it("lança quando não há contexto de tenant", async () => {
    getTenantContextSpy.mockReturnValue(undefined);

    await expect(service.getMetrics()).rejects.toThrow(
      "Contexto de tenant ausente ao calcular métricas do dashboard",
    );
  });
});
