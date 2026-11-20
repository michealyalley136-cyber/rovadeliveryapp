export type Coordinates = { latitude: number; longitude: number };

export function validCoordinates(point: Coordinates): boolean {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  if (!validCoordinates(from) || !validCoordinates(to)) throw new RangeError("Invalid geographic coordinates.");
  const radians = Math.PI / 180;
  const latitudeDifference = (to.latitude - from.latitude) * radians;
  const longitudeDifference = (to.longitude - from.longitude) * radians;
  const a = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) *
    Math.sin(longitudeDifference / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
