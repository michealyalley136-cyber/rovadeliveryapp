import type { ServiceType } from "@/lib/domain";
import { distanceMeters, validCoordinates, type Coordinates } from "./geography";

const mileMeters = 1609.344;
export type SearchStage = { radiusMeters: number; durationSeconds: number };
export const defaultSearchStages: Record<ServiceType, readonly SearchStage[]> = {
  RIDE: [1, 2, 3, 5, 10].map((miles, index) => ({ radiusMeters: miles * mileMeters, durationSeconds: index < 2 ? 15 : 20 })),
  TAXI: [1, 3, 5, 10, 15].map((miles, index) => ({ radiusMeters: miles * mileMeters, durationSeconds: index < 2 ? 15 : 20 })),
};

export function searchStageAt(stages: readonly SearchStage[], startedAt: number, now: number): { index: number; stage: SearchStage; endsAt: number } | null {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || now < startedAt || !stages.length ||
    stages.some((stage, index) => !Number.isFinite(stage.radiusMeters) || stage.radiusMeters <= 0 ||
      !Number.isInteger(stage.durationSeconds) || stage.durationSeconds <= 0 ||
      (index > 0 && stage.radiusMeters <= stages[index - 1].radiusMeters))) {
    throw new RangeError("Invalid dispatch search schedule.");
  }
  let end = startedAt;
  for (const [index, stage] of stages.entries()) {
    end += stage.durationSeconds * 1000;
    if (now < end) return { index, stage, endsAt: end };
  }
  return null;
}

export type DriverCandidate = {
  id: string;
  service: ServiceType;
  coordinates: Coordinates;
  locationUpdatedAt: number;
  locationAccuracyMeters: number;
  registered: boolean;
  approved: boolean;
  online: boolean;
  vehicleApproved: boolean;
  compliant: boolean;
  suspended: boolean;
  assigned: boolean;
  declined: boolean;
  pickupEtaSeconds: number | null;
  roadDistanceMeters: number | null;
  lastOfferedAt: number | null;
};

export function rankEligibleDrivers(input: {
  pickup: Coordinates;
  service: ServiceType;
  radiusMeters: number;
  now: number;
  maxLocationAgeSeconds: number;
  maxAccuracyMeters: number;
  maxPickupEtaSeconds: number;
  drivers: readonly DriverCandidate[];
}) {
  const { pickup, radiusMeters, now, maxLocationAgeSeconds, maxAccuracyMeters, maxPickupEtaSeconds } = input;
  if (!validCoordinates(pickup) || !Number.isFinite(now) ||
    ![radiusMeters, maxLocationAgeSeconds, maxAccuracyMeters, maxPickupEtaSeconds].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Invalid dispatch eligibility criteria.");
  }
  return input.drivers.flatMap((driver) => {
    const eta = driver.pickupEtaSeconds;
    const roadDistance = driver.roadDistanceMeters;
    if (!driver.id || driver.service !== input.service || !driver.registered || !driver.approved || !driver.online ||
      !driver.vehicleApproved || !driver.compliant || driver.suspended || driver.assigned || driver.declined ||
      !validCoordinates(driver.coordinates) || !Number.isFinite(driver.locationUpdatedAt) ||
      driver.locationUpdatedAt > now || now - driver.locationUpdatedAt > maxLocationAgeSeconds * 1000 ||
      !Number.isFinite(driver.locationAccuracyMeters) || driver.locationAccuracyMeters < 0 ||
      driver.locationAccuracyMeters > maxAccuracyMeters ||
      eta === null || !Number.isFinite(eta) || eta < 0 || eta > maxPickupEtaSeconds ||
      roadDistance === null || !Number.isFinite(roadDistance) || roadDistance < 0 ||
      (driver.lastOfferedAt !== null && !Number.isFinite(driver.lastOfferedAt))) return [];
    const straightLineMeters = distanceMeters(pickup, driver.coordinates);
    if (straightLineMeters > radiusMeters) return [];
    return [{ driver, eta, roadDistance, straightLineMeters }];
  }).sort((a, b) => a.eta - b.eta || a.roadDistance - b.roadDistance ||
    a.straightLineMeters - b.straightLineMeters ||
    (a.driver.lastOfferedAt ?? -Infinity) - (b.driver.lastOfferedAt ?? -Infinity) ||
    a.driver.id.localeCompare(b.driver.id));
}
