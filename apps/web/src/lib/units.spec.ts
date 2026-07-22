import { describe, expect, it } from "vitest";
import { cmToMeters, kgToTons, metersToCm, tonsToKg } from "./units";

describe("units", () => {
  it("converte toneladas para quilos, arredondando para 3 casas", () => {
    expect(tonsToKg(1.2345)).toBe(1234.5);
    expect(tonsToKg(0.5)).toBe(500);
  });

  it("converte quilos para toneladas", () => {
    expect(kgToTons(1500)).toBe(1.5);
  });

  it("converte metros para centímetros, arredondando para 2 casas", () => {
    expect(metersToCm(1.505)).toBeCloseTo(150.5, 2);
    expect(metersToCm(0.4)).toBe(40);
  });

  it("converte centímetros para metros", () => {
    expect(cmToMeters(150)).toBe(1.5);
  });

  it("é reversível dentro da precisão de arredondamento", () => {
    const originalTons = 2.5;
    expect(kgToTons(tonsToKg(originalTons))).toBeCloseTo(originalTons, 3);
  });
});
