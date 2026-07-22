import { HealthIndicatorService } from "@nestjs/terminus";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { HealthIndicatorsService } from "./health-indicators.service";

describe("HealthIndicatorsService", () => {
  let service: HealthIndicatorsService;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };
  let freightQuoteQueue: { getJobCounts: jest.Mock };
  let insightsQueue: { getJobCounts: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    redis = { ping: jest.fn() };
    freightQuoteQueue = { getJobCounts: jest.fn() };
    insightsQueue = { getJobCounts: jest.fn() };

    service = new HealthIndicatorsService(
      new HealthIndicatorService(),
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      freightQuoteQueue as unknown as Queue,
      insightsQueue as unknown as Queue,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("checkDatabase", () => {
    it("retorna up quando a query de ping funciona", async () => {
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const result = await service.checkDatabase();

      expect(result.database.status).toBe("up");
    });

    it("retorna down quando a query falha", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("conexão recusada"));

      const result = await service.checkDatabase();

      expect(result.database.status).toBe("down");
      expect(result.database.message).toBe("conexão recusada");
    });
  });

  describe("checkRedis", () => {
    it("retorna up quando o ping responde", async () => {
      redis.ping.mockResolvedValue("PONG");

      const result = await service.checkRedis();

      expect(result.redis.status).toBe("up");
    });

    it("retorna down quando o ping falha", async () => {
      redis.ping.mockRejectedValue(new Error("indisponível"));

      const result = await service.checkRedis();

      expect(result.redis.status).toBe("down");
    });
  });

  describe("checkFreightQuoteQueue", () => {
    it("retorna up com as contagens de job quando a fila responde", async () => {
      freightQuoteQueue.getJobCounts.mockResolvedValue({
        active: 0,
        waiting: 2,
      });

      const result = await service.checkFreightQuoteQueue();

      expect(result["freight-quote-queue"].status).toBe("up");
      expect(result["freight-quote-queue"].counts).toEqual({
        active: 0,
        waiting: 2,
      });
    });

    it("retorna down quando a fila não responde", async () => {
      freightQuoteQueue.getJobCounts.mockRejectedValue(
        new Error("redis indisponível"),
      );

      const result = await service.checkFreightQuoteQueue();

      expect(result["freight-quote-queue"].status).toBe("down");
    });
  });

  describe("checkInsightsQueue", () => {
    it("retorna up com as contagens de job quando a fila responde", async () => {
      insightsQueue.getJobCounts.mockResolvedValue({ active: 1 });

      const result = await service.checkInsightsQueue();

      expect(result["insights-queue"].status).toBe("up");
    });
  });
});
