/**
 * Estimativa de distância rodoviária a partir do CEP de origem/destino.
 *
 * Sem uma integração de geolocalização real (ADR-005), aproximamos a distância
 * a partir da região postal (primeiro dígito do CEP, 0-9, que corresponde a uma
 * macrorregião do Brasil) somada a um ajuste fino derivado dos dígitos
 * restantes do CEP, para que CEPs diferentes dentro da mesma região não
 * produzam sempre a mesma distância.
 */

const REGION_DISTANCE_KM: readonly (readonly number[])[] = [
  [60, 150, 430, 590, 1960, 2660, 2800, 1015, 410, 1110],
  [150, 120, 480, 620, 1970, 2670, 2810, 1050, 460, 1160],
  [430, 480, 100, 340, 1650, 2350, 2600, 1160, 850, 1500],
  [590, 620, 340, 120, 1370, 2050, 2400, 740, 1050, 1650],
  [1960, 1970, 1650, 1370, 150, 850, 1450, 1450, 2350, 2950],
  [2660, 2670, 2350, 2050, 850, 150, 1000, 2100, 3000, 3600],
  [2800, 2810, 2600, 2400, 1450, 1000, 300, 1900, 3200, 3800],
  [1015, 1050, 1160, 740, 1450, 2100, 1900, 150, 1300, 1650],
  [410, 460, 850, 1050, 2350, 3000, 3200, 1300, 90, 550],
  [1110, 1160, 1500, 1650, 2950, 3600, 3800, 1650, 550, 110],
];

const MAX_FINE_ADJUSTMENT_KM = 150;
const CEP_PREFIX_RANGE = 99999;
const VOLUMETRIC_DIVISOR_CM3_PER_KG = 6000;

function extractCepPrefix(cep: string): number {
  const digits = cep.replace(/\D/g, "").slice(0, 5);
  return Number(digits);
}

export function estimateDistanceKm(
  originZipCode: string,
  destinationZipCode: string,
): number {
  const originPrefix = extractCepPrefix(originZipCode);
  const destinationPrefix = extractCepPrefix(destinationZipCode);
  const originRegion = Math.floor(originPrefix / 10000);
  const destinationRegion = Math.floor(destinationPrefix / 10000);

  const baseDistanceKm = REGION_DISTANCE_KM[originRegion][destinationRegion];
  const fineAdjustmentKm =
    (Math.abs(originPrefix - destinationPrefix) / CEP_PREFIX_RANGE) *
    MAX_FINE_ADJUSTMENT_KM;

  return Math.round(baseDistanceKm + fineAdjustmentKm);
}

export function computeVolumetricWeightKg(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): number {
  return (lengthCm * widthCm * heightCm) / VOLUMETRIC_DIVISOR_CM3_PER_KG;
}

export function computeChargeableWeightKg(
  weightKg: number,
  volumetricWeightKg: number,
): number {
  return Math.max(weightKg, volumetricWeightKg);
}

export interface FreightPricingInput {
  originZipCode: string;
  destinationZipCode: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  cargoValue: number;
}

export interface CarrierPricingProfile {
  basePrice: number;
  pricePerKg: number;
  pricePerKm: number;
  insuranceRate: number;
  avgSpeedKmPerDay: number;
  handlingDays: number;
}

export interface FreightPricingResult {
  price: number;
  estimatedDays: number;
  distanceKm: number;
  chargeableWeightKg: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeFreightOption(
  input: FreightPricingInput,
  carrier: CarrierPricingProfile,
): FreightPricingResult {
  const distanceKm = estimateDistanceKm(
    input.originZipCode,
    input.destinationZipCode,
  );
  const volumetricWeightKg = computeVolumetricWeightKg(
    input.lengthCm,
    input.widthCm,
    input.heightCm,
  );
  const chargeableWeightKg = computeChargeableWeightKg(
    input.weightKg,
    volumetricWeightKg,
  );

  const price =
    carrier.basePrice +
    carrier.pricePerKg * chargeableWeightKg +
    carrier.pricePerKm * distanceKm +
    carrier.insuranceRate * input.cargoValue;

  const estimatedDays =
    carrier.handlingDays +
    Math.max(1, Math.ceil(distanceKm / carrier.avgSpeedKmPerDay));

  return {
    price: roundCurrency(price),
    estimatedDays,
    distanceKm,
    chargeableWeightKg,
  };
}
