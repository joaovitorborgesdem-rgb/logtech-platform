import { AuditAction } from "@prisma/client";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import { AuditLogsService } from "./audit-logs.service";

describe("AuditLogsService", () => {
  let service: AuditLogsService;
  let prisma: { auditLog: { findMany: jest.Mock; count: jest.Mock } };

  const baseLog = {
    id: "log-1",
    tenantId: "tenant-1",
    userId: "user-1",
    action: AuditAction.CARRIER_DELETED,
    description: null,
    metadata: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new AuditLogsService(
      prisma as unknown as TenantScopedPrismaClient,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("retorna resultado paginado sem filtros", async () => {
    prisma.auditLog.findMany.mockResolvedValue([baseLog]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.findAll({
      page: 1,
      limit: 20,
      sortOrder: "desc",
      sortBy: "createdAt",
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(result.data).toEqual([baseLog]);
    expect(result.meta.total).toBe(1);
  });

  it("aplica filtro de action e userId", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.findAll({
      page: 1,
      limit: 20,
      sortOrder: "desc",
      sortBy: "createdAt",
      action: AuditAction.CARRIER_DELETED,
      userId: "user-1",
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: AuditAction.CARRIER_DELETED, userId: "user-1" },
      }),
    );
  });

  it("aplica filtro de intervalo de datas", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.findAll({
      page: 1,
      limit: 20,
      sortOrder: "desc",
      sortBy: "createdAt",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    const [call] = prisma.auditLog.findMany.mock.calls as Array<
      [{ where: { createdAt: { gte: Date; lte: Date } } }]
    >;
    expect(call[0].where.createdAt.gte).toEqual(new Date("2026-07-01"));
    expect(call[0].where.createdAt.lte).toEqual(new Date("2026-07-31"));
  });
});
