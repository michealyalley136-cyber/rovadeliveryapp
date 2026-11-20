export type VehicleType = "RIDE" | "TAXI";
export type DriverAvailability = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export type DriverLocationUpdate = {
  driverId: string;
  vehicleType: VehicleType;
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
  accuracyMeters: number | null;
  positionTimestamp: number;
  receivedTimestamp: number | null;
  availability: DriverAvailability;
  activeRideId: string | null;
  source: "SIMULATION" | "GPS";
};

export interface DriverLocationProvider {
  locations(now: number): readonly DriverLocationUpdate[];
}

/**
 * An intentionally disabled integration boundary, not an authenticated GPS API.
 * A future server-authorized transport must replace this before live tracking.
 */
export class LiveGPSDriverLocationProvider implements DriverLocationProvider {
  locations(): readonly DriverLocationUpdate[] {
    return [];
  }

  acceptLocation(update: DriverLocationUpdate): never {
    void update;
    throw new Error("Live GPS tracking is disabled; no location updates are accepted.");
  }
}
