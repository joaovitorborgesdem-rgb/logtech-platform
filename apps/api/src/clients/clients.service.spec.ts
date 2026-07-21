import { ConflictException, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import { ClientsService } from "./clients.service";

describe("ClientsService", () => {
  let service: ClientsService;
  let prisma: {
    client: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };

  const baseClient = {
    id: "client-1",
    tenantId: "tenant-1",
    name: "Cliente X",
    email: "cliente@example.com",
    phone: null,
    document: "12345678901234",
    city: null,
    state: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      client: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };

    service = new ClientsService(prisma as unknown as TenantScopedPrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("cria um cliente", async () => {
      prisma.client.create.mockResolvedValue(baseClient);

      const result = await service.create({
        name: "Cliente X",
        email: "cliente@example.com",
        document: "12345678901234",
      });

      expect(result).toEqual(baseClient);
    });

    it("lança ConflictException em violação de documento único", async () => {
      prisma.client.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicado", {
          code: "P2002",
          clientVersion: "7.8.0",
        }),
      );

      await expect(
        service.create({
          name: "X",
          email: "x@example.com",
          document: "12345678901234",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("findAll", () => {
    it("retorna resultado paginado filtrando registros removidos", async () => {
      prisma.client.findMany.mockResolvedValue([baseClient]);
      prisma.client.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortOrder: "desc",
        sortBy: "createdAt",
      });

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
      expect(result.data).toEqual([baseClient]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it("aplica filtros informados na query", async () => {
      prisma.client.findMany.mockResolvedValue([]);
      prisma.client.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 20,
        sortOrder: "asc",
        sortBy: "name",
        name: "Cliente",
        city: "São Paulo",
      });

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            name: { contains: "Cliente" },
            city: { contains: "São Paulo" },
          },
          orderBy: { name: "asc" },
        }),
      );
    });
  });

  describe("findOne", () => {
    it("retorna o cliente quando encontrado", async () => {
      prisma.client.findFirst.mockResolvedValue(baseClient);

      const result = await service.findOne("client-1");

      expect(result).toEqual(baseClient);
    });

    it("lança NotFoundException quando não encontrado", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.findOne("inexistente")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("atualiza o cliente existente", async () => {
      prisma.client.findFirst.mockResolvedValue(baseClient);
      prisma.client.update.mockResolvedValue({
        ...baseClient,
        name: "Novo nome",
      });

      const result = await service.update("client-1", { name: "Novo nome" });

      expect(result.name).toBe("Novo nome");
    });

    it("lança NotFoundException ao atualizar cliente inexistente", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.update("inexistente", { name: "X" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("marca deletedAt e registra auditoria", async () => {
      prisma.client.findFirst.mockResolvedValue(baseClient);
      prisma.client.update.mockResolvedValue({
        ...baseClient,
        deletedAt: new Date(),
      });

      await service.remove("client-1", "user-1");

      const [updateCall] = prisma.client.update.mock.calls as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >;
      expect(updateCall[0].where).toEqual({ id: "client-1" });
      expect(updateCall[0].data.deletedAt).toBeInstanceOf(Date);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          action: AuditAction.CLIENT_DELETED,
          metadata: { clientId: "client-1" },
        },
      });
    });

    it("lança NotFoundException ao remover cliente inexistente", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.remove("inexistente", "user-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });
});
