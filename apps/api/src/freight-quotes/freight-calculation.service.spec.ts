import { FreightQuoteStatus } from "@prisma/client";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import { FreightCalculationService } from "./freight-calculation.service";

describe("FreightCalculationService", () => {
  let service: FreightCalculationService;
  let prisma: {
    carrier: { findMany: jest.Mock };
    freightQuoteOption: { createMany: jest.Mock };
    freightQuote: { update: jest.Mock };
  };

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
    status: FreightQuoteStatus.PROCESSING,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const activeCarrier = {
    id: "carrier-1",
    tenantId: "tenant-1",
    name: "Transportadora A",
    document: "12345678000199",
    active: true,
    deletedAt: null,
    basePrice: "20.00",
    pricePerKg: "0.80",
    pricePerKm: "0.05",
    insuranceRate: "0.003",
    avgSpeedKmPerDay: 500,
    handlingDays: 1,
  };

  beforeEach(() => {
    prisma = {
      carrier: { findMany: jest.fn() },
      freightQuoteOption: { createMany: jest.fn() },
      freightQuote: { update: jest.fn() },
    };

    service = new FreightCalculationService(
      prisma as unknown as TenantScopedPrismaClient,
    );
  });

  it("gera uma opção por transportadora ativa e marca a cotação como DONE", async () => {
    prisma.carrier.findMany.mockResolvedValue([activeCarrier]);

    await service.generateOptions(baseQuote as never);

    expect(prisma.carrier.findMany).toHaveBeenCalledWith({
      where: { active: true, deletedAt: null },
    });

    const [createManyCall] = prisma.freightQuoteOption.createMany.mock
      .calls as Array<[{ data: Array<Record<string, unknown>> }]>;
    expect(createManyCall[0].data).toHaveLength(1);
    expect(createManyCall[0].data[0]).toMatchObject({
      quoteId: "quote-1",
      carrierId: "carrier-1",
    });
    expect(createManyCall[0].data[0].price).toBeGreaterThan(0);

    expect(prisma.freightQuote.update).toHaveBeenCalledWith({
      where: { id: "quote-1" },
      data: { status: FreightQuoteStatus.DONE },
    });
  });

  it("marca a cotação como DONE sem opções quando não há transportadoras ativas", async () => {
    prisma.carrier.findMany.mockResolvedValue([]);

    await service.generateOptions(baseQuote as never);

    expect(prisma.freightQuoteOption.createMany).not.toHaveBeenCalled();
    expect(prisma.freightQuote.update).toHaveBeenCalledWith({
      where: { id: "quote-1" },
      data: { status: FreightQuoteStatus.DONE },
    });
  });
});
