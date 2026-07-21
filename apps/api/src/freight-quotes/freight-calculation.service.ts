import { Inject, Injectable } from "@nestjs/common";
import { FreightQuote, FreightQuoteStatus } from "@prisma/client";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { computeFreightOption } from "./freight-pricing.util";

@Injectable()
export class FreightCalculationService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
  ) {}

  /**
   * Gera uma FreightQuoteOption por transportadora ativa do tenant e marca a
   * cotação como DONE. Assume que já existe contexto de tenant ativo
   * (AsyncLocalStorage) no momento da chamada — quem chama a partir de um job
   * de fila deve entrar nesse contexto via `runWithTenantContext` antes.
   */
  async generateOptions(quote: FreightQuote): Promise<void> {
    const carriers = await this.prisma.carrier.findMany({
      where: { active: true, deletedAt: null },
    });

    if (carriers.length > 0) {
      const options = carriers.map((carrier) => {
        const result = computeFreightOption(
          {
            originZipCode: quote.originZipCode,
            destinationZipCode: quote.destinationZipCode,
            weightKg: Number(quote.weightKg),
            lengthCm: Number(quote.lengthCm),
            widthCm: Number(quote.widthCm),
            heightCm: Number(quote.heightCm),
            cargoValue: Number(quote.cargoValue),
          },
          {
            basePrice: Number(carrier.basePrice),
            pricePerKg: Number(carrier.pricePerKg),
            pricePerKm: Number(carrier.pricePerKm),
            insuranceRate: Number(carrier.insuranceRate),
            avgSpeedKmPerDay: carrier.avgSpeedKmPerDay,
            handlingDays: carrier.handlingDays,
          },
        );

        return {
          quoteId: quote.id,
          carrierId: carrier.id,
          price: result.price,
          estimatedDays: result.estimatedDays,
          metadata: {
            distanceKm: result.distanceKm,
            chargeableWeightKg: result.chargeableWeightKg,
          },
        };
      });

      await this.prisma.freightQuoteOption.createMany({ data: options });
    }

    await this.prisma.freightQuote.update({
      where: { id: quote.id },
      data: { status: FreightQuoteStatus.DONE },
    });
  }
}
