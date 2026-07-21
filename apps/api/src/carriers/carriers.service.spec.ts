import { ConflictException, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import { CarriersService } from "./carriers.service";

describe("CarriersService", () => {
  let service: CarriersService;
  let prisma: {
    carrier: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };

  const baseCarrier = {
    id: "carrier-1",
    tenantId: "tenant-1",
    name: "Transportadora X",
    document: "12345678901234",
    email: null,
    phone: null,
    city: null,
    state: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      carrier: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };

    service = new CarriersService(
      prisma as unknown as TenantScopedPrismaClient,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("cria uma transportadora", async () => {
      prisma.carrier.create.mockResolvedValue(baseCarrier);

      const result = await service.create({
        name: "Transportadora X",
        document: "12345678901234",
      });

      expect(result).toEqual(baseCarrier);
    });

    it("lança ConflictException em violação de documento único", async () => {
      prisma.carrier.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicado", {
          code: "P2002",
          clientVersion: "7.8.0",
        }),
      );

      await expect(
        service.create({ name: "X", document: "12345678901234" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("findAll", () => {
    it("retorna resultado paginado filtrando registros removidos", async () => {
      prisma.carrier.findMany.mockResolvedValue([baseCarrier]);
      prisma.carrier.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortOrder: "desc",
        sortBy: "createdAt",
      });

      expect(prisma.carrier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
      expect(result.data).toEqual([baseCarrier]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it("aplica filtros informados na query", async () => {
      prisma.carrier.findMany.mockResolvedValue([]);
      prisma.carrier.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 20,
        sortOrder: "asc",
        sortBy: "name",
        name: "Trans",
        active: true,
      });

      expect(prisma.carrier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            name: { contains: "Trans" },
            active: true,
          },
          orderBy: { name: "asc" },
        }),
      );
    });
  });

  describe("findOne", () => {
    it("retorna a transportadora quando encontrada", async () => {
      prisma.carrier.findFirst.mockResolvedValue(baseCarrier);

      const result = await service.findOne("carrier-1");

      expect(result).toEqual(baseCarrier);
      expect(prisma.carrier.findFirst).toHaveBeenCalledWith({
        where: { id: "carrier-1", deletedAt: null },
      });
    });

    it("lança NotFoundException quando não encontrada", async () => {
      prisma.carrier.findFirst.mockResolvedValue(null);

      await expect(service.findOne("inexistente")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("atualiza a transportadora existente", async () => {
      prisma.carrier.findFirst.mockResolvedValue(baseCarrier);
      prisma.carrier.update.mockResolvedValue({
        ...baseCarrier,
        name: "Novo nome",
      });

      const result = await service.update("carrier-1", { name: "Novo nome" });

      expect(result.name).toBe("Novo nome");
    });

    it("lança NotFoundException ao atualizar transportadora inexistente", async () => {
      prisma.carrier.findFirst.mockResolvedValue(null);

      await expect(
        service.update("inexistente", { name: "X" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.carrier.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("marca deletedAt e registra auditoria", async () => {
      prisma.carrier.findFirst.mockResolvedValue(baseCarrier);
      prisma.carrier.update.mockResolvedValue({
        ...baseCarrier,
        deletedAt: new Date(),
      });

      await service.remove("carrier-1", "user-1");

      const [updateCall] = prisma.carrier.update.mock.calls as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >;
      expect(updateCall[0].where).toEqual({ id: "carrier-1" });
      expect(updateCall[0].data.deletedAt).toBeInstanceOf(Date);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          action: AuditAction.CARRIER_DELETED,
          metadata: { carrierId: "carrier-1" },
        },
      });
    });

    it("lança NotFoundException ao remover transportadora inexistente", async () => {
      prisma.carrier.findFirst.mockResolvedValue(null);

      await expect(
        service.remove("inexistente", "user-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.carrier.update).not.toHaveBeenCalled();
    });
  });
});
