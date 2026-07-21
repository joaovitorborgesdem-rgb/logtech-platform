function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function tonsToKg(tons: number): number {
  return round(tons * 1000, 3);
}

export function kgToTons(kg: number): number {
  return kg / 1000;
}

export function metersToCm(meters: number): number {
  return round(meters * 100, 2);
}

export function cmToMeters(cm: number): number {
  return cm / 100;
}
