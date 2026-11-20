import type { DriverLocationUpdate } from "./driver-location";

export type VehicleOrientation = {
  heading: number | null;
  rotation: number;
  facing: "left" | "right";
};

export const initialVehicleOrientation: VehicleOrientation = { heading: null, rotation: 0, facing: "left" };

export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function shortestRotation(current: number, target: number): number {
  return current + ((normalizeHeading(target - current) + 180) % 360 - 180);
}

export function sideViewScale(orientation: VehicleOrientation, defaultFacing: "left" | "right"): number {
  return orientation.facing === defaultFacing ? 1 : -1;
}

/**
 * Heading is clockwise from north. The map bearing is clockwise from north;
 * artwork heading is the direction a top-down asset points without a transform.
 */
export function orientVehicle(
  previous: VehicleOrientation,
  update: Pick<DriverLocationUpdate, "headingDegrees" | "speedMetersPerSecond">,
  mapBearing: number,
  artwork: { kind: "side" } | { kind: "top"; artworkHeading: number },
): VehicleOrientation {
  const moving = update.speedMetersPerSecond === null || update.speedMetersPerSecond > 0.3;
  const heading = moving && update.headingDegrees !== null && Number.isFinite(update.headingDegrees)
    ? normalizeHeading(update.headingDegrees)
    : previous.heading;
  if (heading === null || !Number.isFinite(mapBearing)) return previous;
  const screenHeading = normalizeHeading(heading - mapBearing);
  if (artwork.kind === "top") {
    const target = screenHeading - artwork.artworkHeading;
    return { ...previous, heading, rotation: shortestRotation(previous.rotation, target) };
  }
  const horizontal = Math.sin(screenHeading * Math.PI / 180);
  return {
    ...previous,
    heading,
    facing: horizontal > .2 ? "right" : horizontal < -.2 ? "left" : previous.facing,
  };
}
