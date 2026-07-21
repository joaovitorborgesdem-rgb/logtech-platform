import {
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, FreightQuoteStatus, UserRole } from "@prisma/client";
import { Queue } from "bullmq";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import * as tenantContext from "../tenant/tenant-context";
import { FreightQuotesService } from "./freight-quotes.service";

describe("FreightQuotesService", () => {
  let service: FreightQuotesService;
  let prisma: {
    freightQuote: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let freightQuoteQueue: { add: jest.Mock };
  let getTenantContextSpy: jest.SpyInstance;

  const baseQuote = {
    id: "quote-1",
    tenantId: "tenant-1",
    userId: "user-1",
    originZipCode: "01310-100",
    destinationZipCode: "20040-020",
    weightKg: 12.5,
    lengthCm: 40,
    widthCm: 30,
    heightCm: 20,
    cargoValue: 500,
    status: FreightQuoteStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const baseQuoteWithOptions = { ...baseQuote, options: [] };

  beforeEach(() => {
    prisma = {
      freightQuote: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    freightQuoteQueue = { add: jest.fn() };

    getTenantContextSpy = jest
      .spyOn(tenantContext, "getTenantContext")
      .mockReturnValue({
        tenantId: "tenant-1",
        userId: "user-1",
        role: UserRole.MEMBER,
      });

    service = new FreightQuotesService(
      prisma as unknown as TenantScopedPrismaClient,
      freightQuoteQueue as unknown as Queue,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    getTenantContextSpy.mockRestore();
  });

  describe("create", () => {
    it("cria a cotação como PENDING e enfileira o cálculo de opções", async () => {
      prisma.freightQuote.create.mockResolvedValue(baseQuote);
      prisma.freightQuote.findFirst.mockResolvedValue(baseQuoteWithOptions);

      const result = await service.create(
        {
          originZipCode: "01310-100",
          destinationZipCode: "20040-020",
          weightKg: 12.5,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 20,
          cargoValue: 500,
        },
        "user-1",
      );

      expect(result).toEqual(baseQuoteWithOptions);
      const [createCall] = prisma.freightQuote.create.mock.calls as Array<
        [{ data: { userId: string } }]
      >;
      expect(createCall[0].data.userId).toBe("user-1");

      expect(freightQuoteQueue.add).toHaveBeenCalledWith(
        "calculate-options",
        {
          quoteId: "quote-1",
          tenantId: "tenant-1",
          userId: "user-1",
          role: UserRole.MEMBER,
        },
        { attempts: 1 },
      );
    });

    it("lança InternalServerErrorException quando não há contexto de tenant", async () => {
      prisma.freightQuote.create.mockResolvedValue(baseQuote);
      getTenantContextSpy.mockReturnValue(undefined);

      await expect(
        service.create(
          {
            originZipCode: "01310-100",
            destinationZipCode: "20040-020",
            weightKg: 12.5,
            lengthCm: 40,
            widthCm: 30,
            heightCm: 20,
            cargoValue: 500,
          },
          "user-1",
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(freightQuoteQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("retorna resultado paginado filtrando registros removidos", async () => {
      prisma.freightQuote.findMany.mockResolvedValue([baseQuote]);
      prisma.freightQuote.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortOrder: "desc",
        sortBy: "createdAt",
      });

      expect(prisma.freightQuote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
      expect(result.data).toEqual([baseQuote]);
      expect(result.meta.total).toBe(1);
    });

    it("aplica filtro de status", async () => {
      prisma.freightQuote.findMany.mockResolvedValue([]);
      prisma.freightQuote.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 20,
        sortOrder: "desc",
        sortBy: "createdAt",
        status: FreightQuoteStatus.DONE,
      });

      expect(prisma.freightQuote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, status: FreightQuoteStatus.DONE },
        }),
      );
    });
  });

  describe("findOne", () => {
    it("retorna a cotação com as opções calculadas quando encontrada", async () => {
      prisma.freightQuote.findFirst.mockResolvedValue(baseQuoteWithOptions);

      const result = await service.findOne("quote-1");

      expect(result).toEqual(baseQuoteWithOptions);
      const [findFirstCall] = prisma.freightQuote.findFirst.mock.calls as Array<
        [{ where: { id: string; deletedAt: null }; include: object }]
      >;
      expect(findFirstCall[0].where).toEqual({
        id: "quote-1",
        deletedAt: null,
      });
      expect(findFirstCall[0].include).toBeDefined();
    });

    it("lança NotFoundException quando não encontrada", async () => {
      prisma.freightQuote.findFirst.mockResolvedValue(null);

      await expect(service.findOne("inexistente")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("atualiza a cotação existente", async () => {
      prisma.freightQuote.findFirst.mockResolvedValue(baseQuoteWithOptions);
      prisma.freightQuote.update.mockResolvedValue({
        ...baseQuote,
        status: FreightQuoteStatus.PROCESSING,
      });

      const result = await service.update("quote-1", {
        status: FreightQuoteStatus.PROCESSING,
      });

      expect(result.status).toBe(FreightQuoteStatus.PROCESSING);
    });

    it("lança NotFoundException ao atualizar cotação inexistente", async () => {
      prisma.freightQuote.findFirst.mockResolvedValue(null);

      await expect(
        service.update("inexistente", { status: FreightQuoteStatus.DONE }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.freightQuote.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("marca deletedAt e registra auditoria", async () => {
      prisma.freightQuote.findFirst.mockResolvedValue(baseQuoteWithOptions);
      prisma.freightQuote.update.mockResolvedValue({
        ...baseQuote,
        deletedAt: new Date(),
      });

      await service.remove("quote-1", "user-1");

      const [updateCall] = prisma.freightQuote.update.mock.calls as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >;
      expect(updateCall[0].where).toEqual({ id: "quote-1" });
      expect(updateCall[0].data.deletedAt).toBeInstanceOf(Date);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          action: AuditAction.FREIGHT_QUOTE_DELETED,
          metadata: { freightQuoteId: "quote-1" },
        },
      });
    });

    it("lança NotFoundException ao remover cotação inexistente", async () => {
      prisma.freightQuote.findFirst.mockResolvedValue(null);

      await expect(
        service.remove("inexistente", "user-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.freightQuote.update).not.toHaveBeenCalled();
    });
  });
});
