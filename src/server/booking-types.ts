export type BookingService = "RIDE" | "TAXI";
export type BookingStatus = "REQUESTED" | "CANCELLED";

export type BookingInput = {
  service: BookingService;
  pickupName: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupInstructions?: string;
  destinationName: string;
  destinationLatitude: number;
  destinationLongitude: number;
  idempotencyKey: string;
};

export type BookingDto = {
  id: string;
  reference: string;
  customerId: string;
  service: BookingService;
  status: BookingStatus;
  pickupName: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupInstructions: string | null;
  destinationName: string;
  destinationLatitude: number;
  destinationLongitude: number;
  routeDistanceMeters: number;
  routeDurationSeconds: number;
  routingProvider: string;
  routingProfile: "MOTORCYCLE" | "DRIVING";
  routeCalculatedAt: string;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingHistoryItem = {
  id: string;
  previousStatus: BookingStatus | null;
  newStatus: BookingStatus;
  reason: string | null;
  createdAt: string;
};
