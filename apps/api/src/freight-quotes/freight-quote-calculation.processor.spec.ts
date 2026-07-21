import { FreightQuoteStatus, UserRole } from "@prisma/client";
import { Job } from "bullmq";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import * as tenantContext from "../tenant/tenant-context";
import { FreightCalculationService } from "./freight-calculation.service";
import { FreightQuoteCalculationProcessor } from "./freight-quote-calculation.processor";
import { FreightQuoteJobData } from "./freight-quote-queue.constants";

describe("FreightQuoteCalculationProcessor", () => {
  let processor: FreightQuoteCalculationProcessor;
  let prisma: {
    freightQuote: { findFirstOrThrow: jest.Mock; update: jest.Mock };
  };
  let freightCalculationService: { generateOptions: jest.Mock };
  let runWithTenantContextSpy: jest.SpyInstance;

  const jobData: FreightQuoteJobData = {
    quoteId: "quote-1",
    tenantId: "tenant-1",
    userId: "user-1",
    role: UserRole.MEMBER,
  };

  const baseQuote = {
    id: "quote-1",
    tenantId: "tenant-1",
    originZipCode: "01310-100",
    destinationZipCode: "20040-020",
    weightKg: 12.5,
    lengthCm: 40,
    widthCm: 30,
    heightCm: 20,
    cargoValue: 500,
    status: FreightQuoteStatus.PENDING,
  };

  beforeEach(() => {
    prisma = {
      freightQuote: {
        findFirstOrThrow: jest.fn().mockResolvedValue(baseQuote),
        update: jest.fn(),
      },
    };
    freightCalculationService = { generateOptions: jest.fn() };

    runWithTenantContextSpy = jest
      .spyOn(tenantContext, "runWithTenantContext")
      .mockImplementation((_context, callback: () => unknown) => callback());

    processor = new FreightQuoteCalculationProcessor(
      prisma as unknown as TenantScopedPrismaClient,
      freightCalculationService as unknown as FreightCalculationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    runWithTenantContextSpy.mockRestore();
  });

  describe("process", () => {
    it("reconstrói o contexto de tenant, marca PROCESSING e calcula as opções", async () => {
      const job = { data: jobData } as Job<FreightQuoteJobData>;

      await processor.process(job);

      expect(runWithTenantContextSpy).toHaveBeenCalledWith(
        { tenantId: "tenant-1", userId: "user-1", role: UserRole.MEMBER },
        expect.any(Function),
      );
      expect(prisma.freightQuote.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: "quote-1" },
      });
      expect(prisma.freightQuote.update).toHaveBeenCalledWith({
        where: { id: "quote-1" },
        data: { status: FreightQuoteStatus.PROCESSING },
      });
      expect(freightCalculationService.generateOptions).toHaveBeenCalledWith(
        baseQuote,
      );
    });
  });

  describe("onFailed", () => {
    it("marca a cotação como ERROR quando o job falha definitivamente", async () => {
      const job = {
        id: "job-1",
        data: jobData,
        failedReason: "falha simulada",
      } as Job<FreightQuoteJobData>;

      await processor.onFailed(job);

      expect(runWithTenantContextSpy).toHaveBeenCalledWith(
        { tenantId: "tenant-1", userId: "user-1", role: UserRole.MEMBER },
        expect.any(Function),
      );
      expect(prisma.freightQuote.update).toHaveBeenCalledWith({
        where: { id: "quote-1" },
        data: { status: FreightQuoteStatus.ERROR },
      });
    });

    it("não faz nada quando o job é undefined", async () => {
      await processor.onFailed(undefined);

      expect(runWithTenantContextSpy).not.toHaveBeenCalled();
      expect(prisma.freightQuote.update).not.toHaveBeenCalled();
    });
  });
});
