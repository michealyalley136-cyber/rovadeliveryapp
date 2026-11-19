import type { ServiceType } from "../lib/domain";

export const demoPricing = {
  currency: "GHS",
  baseFarePesewas: { RIDE: 1200, TAXI: 2500 },
  perKmPesewas: { RIDE: 350, TAXI: 600 },
  perMinutePesewas: { RIDE: 50, TAXI: 80 },
  minimumFarePesewas: { RIDE: 1800, TAXI: 3500 },
  distanceKm: 5.2,
  durationMin: 18,
  demoPlatformFeeBasisPoints: 1500,
} as const;

export function estimateFare(service: ServiceType) {
  const pricing = demoPricing;
  const calculated =
    pricing.baseFarePesewas[service] +
    Math.round(pricing.perKmPesewas[service] * pricing.distanceKm) +
    pricing.perMinutePesewas[service] * pricing.durationMin;
  return Math.max(pricing.minimumFarePesewas[service], calculated);
}

export function ledgerBreakdown(farePesewas: number) {
  if (!Number.isSafeInteger(farePesewas) || farePesewas < 0) throw new Error("Fare must be a non-negative integer amount in pesewas.");
  const platformFeePesewas = Math.round((farePesewas * demoPricing.demoPlatformFeeBasisPoints) / 10_000);
  return { platformFeePesewas, operatorEarningPesewas: farePesewas - platformFeePesewas };
}
