CREATE TYPE "BookingRequestStatus" AS ENUM ('REQUESTED', 'CANCELLED');

CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickupName" TEXT NOT NULL,
    "pickupLatitude" DECIMAL(10,7) NOT NULL,
    "pickupLongitude" DECIMAL(10,7) NOT NULL,
    "pickupInstructions" TEXT,
    "destinationName" TEXT NOT NULL,
    "destinationLatitude" DECIMAL(10,7) NOT NULL,
    "destinationLongitude" DECIMAL(10,7) NOT NULL,
    "routeDistanceMeters" INTEGER NOT NULL,
    "routeDurationSeconds" INTEGER NOT NULL,
    "routingProvider" TEXT NOT NULL,
    "routingProfile" TEXT NOT NULL,
    "routeCalculatedAt" TIMESTAMP(3) NOT NULL,
    "routeMetadata" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BookingRequest_coordinates_check" CHECK (
      "pickupLatitude" BETWEEN -90 AND 90 AND "pickupLongitude" BETWEEN -180 AND 180
      AND "destinationLatitude" BETWEEN -90 AND 90 AND "destinationLongitude" BETWEEN -180 AND 180
    ),
    CONSTRAINT "BookingRequest_service_check" CHECK ("service" IN ('RIDE', 'TAXI')),
    CONSTRAINT "BookingRequest_route_check" CHECK (
      "routeDistanceMeters" > 0 AND "routeDurationSeconds" >= 0
      AND "routingProfile" IN ('MOTORCYCLE', 'DRIVING')
    ),
    CONSTRAINT "BookingRequest_cancellation_check" CHECK (
      ("status" = 'REQUESTED' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
      OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
    )
);

CREATE TABLE "BookingRequestStatusHistory" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "previousStatus" "BookingRequestStatus",
    "newStatus" "BookingRequestStatus" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRequestStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingRequest_reference_key" ON "BookingRequest"("reference");
CREATE UNIQUE INDEX "BookingRequest_customerId_idempotencyKey_key" ON "BookingRequest"("customerId", "idempotencyKey");
CREATE INDEX "BookingRequest_customerId_createdAt_id_idx" ON "BookingRequest"("customerId", "createdAt", "id");
CREATE INDEX "BookingRequest_status_createdAt_idx" ON "BookingRequest"("status", "createdAt");
CREATE INDEX "BookingRequestStatusHistory_bookingRequestId_createdAt_idx" ON "BookingRequestStatusHistory"("bookingRequestId", "createdAt");

ALTER TABLE "BookingRequest"
  ADD CONSTRAINT "BookingRequest_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingRequestStatusHistory"
  ADD CONSTRAINT "BookingRequestStatusHistory_bookingRequestId_fkey"
  FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingRequestStatusHistory"
  ADD CONSTRAINT "BookingRequestStatusHistory_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
