import {
  computeChargeableWeightKg,
  computeFreightOption,
  computeVolumetricWeightKg,
  estimateDistanceKm,
} from "./freight-pricing.util";

describe("freight-pricing.util", () => {
  describe("estimateDistanceKm", () => {
    it("retorna uma distância pequena para CEPs idênticos", () => {
      expect(estimateDistanceKm("01310-100", "01310-100")).toBeLessThan(70);
    });

    it("retorna uma distância maior entre regiões distintas (SP -> RS)", () => {
      const distance = estimateDistanceKm("01310-100", "90010-000");
      expect(distance).toBeGreaterThan(1000);
    });

    it("é simétrica entre origem e destino", () => {
      const ab = estimateDistanceKm("01310-100", "20040-020");
      const ba = estimateDistanceKm("20040-020", "01310-100");
      expect(ab).toBe(ba);
    });
  });

  describe("computeVolumetricWeightKg", () => {
    it("calcula o peso cúbico a partir das dimensões em cm", () => {
      expect(computeVolumetricWeightKg(100, 60, 50)).toBeCloseTo(50, 5);
    });
  });

  describe("computeChargeableWeightKg", () => {
    it("usa o maior valor entre peso real e peso cúbico", () => {
      expect(computeChargeableWeightKg(10, 50)).toBe(50);
      expect(computeChargeableWeightKg(80, 50)).toBe(80);
    });
  });

  describe("computeFreightOption", () => {
    const carrier = {
      basePrice: 20,
      pricePerKg: 1,
      pricePerKm: 0.1,
      insuranceRate: 0.01,
      avgSpeedKmPerDay: 500,
      handlingDays: 1,
    };

    it("combina peso, distância e valor da carga no preço final", () => {
      const result = computeFreightOption(
        {
          originZipCode: "01310-100",
          destinationZipCode: "20040-020",
          weightKg: 10,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
          cargoValue: 1000,
        },
        carrier,
      );

      const expectedPrice =
        carrier.basePrice +
        carrier.pricePerKg * 10 +
        carrier.pricePerKm * result.distanceKm +
        carrier.insuranceRate * 1000;

      expect(result.price).toBeCloseTo(expectedPrice, 2);
      expect(result.estimatedDays).toBeGreaterThanOrEqual(
        carrier.handlingDays + 1,
      );
    });

    it("usa o peso cúbico quando maior que o peso real", () => {
      const result = computeFreightOption(
        {
          originZipCode: "01310-100",
          destinationZipCode: "20040-020",
          weightKg: 1,
          lengthCm: 100,
          widthCm: 100,
          heightCm: 100,
          cargoValue: 0,
        },
        carrier,
      );

      expect(result.chargeableWeightKg).toBeCloseTo(1000000 / 6000, 5);
    });
  });
});
