CREATE TYPE "SimulatedRideStatus" AS ENUM ('REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKUP_VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_DRIVERS_AVAILABLE', 'EXPIRED');
CREATE TYPE "SimulatedOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

CREATE TABLE "SimulatedRide" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,
    "status" "SimulatedRideStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickupLabel" TEXT NOT NULL,
    "pickupLatitude" DECIMAL(10,7) NOT NULL,
    "pickupLongitude" DECIMAL(10,7) NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "destinationLatitude" DECIMAL(10,7) NOT NULL,
    "destinationLongitude" DECIMAL(10,7) NOT NULL,
    "searchStartedAt" TIMESTAMP(3),
    "searchExpiresAt" TIMESTAMP(3),
    "searchStages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SimulatedRide_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SimulatedRide_coordinates_check" CHECK (
      "pickupLatitude" BETWEEN -90 AND 90 AND "pickupLongitude" BETWEEN -180 AND 180
      AND "destinationLatitude" BETWEEN -90 AND 90 AND "destinationLongitude" BETWEEN -180 AND 180
    ),
    CONSTRAINT "SimulatedRide_service_check" CHECK ("service" IN ('RIDE', 'TAXI')),
    CONSTRAINT "SimulatedRide_search_time_check" CHECK (
      ("searchStartedAt" IS NULL AND "searchExpiresAt" IS NULL)
      OR ("searchStartedAt" IS NOT NULL AND "searchExpiresAt" IS NOT NULL AND "searchExpiresAt" > "searchStartedAt")
    )
);

CREATE TABLE "SimulatedDriver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SimulatedDriver_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SimulatedDriver_service_check" CHECK ("service" IN ('RIDE', 'TAXI'))
);

CREATE TABLE "SimulatedAssignment" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "SimulatedAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimulatedOffer" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "SimulatedOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SimulatedOffer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SimulatedOffer_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX "SimulatedRide_status_searchExpiresAt_idx" ON "SimulatedRide"("status", "searchExpiresAt");
CREATE UNIQUE INDEX "SimulatedRide_customerId_idempotencyKey_key" ON "SimulatedRide"("customerId", "idempotencyKey");
CREATE UNIQUE INDEX "SimulatedRide_one_active_customer" ON "SimulatedRide"("customerId")
  WHERE "status" IN ('REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKUP_VERIFIED', 'IN_PROGRESS');
CREATE UNIQUE INDEX "SimulatedAssignment_rideId_key" ON "SimulatedAssignment"("rideId");
CREATE INDEX "SimulatedAssignment_driverId_releasedAt_idx" ON "SimulatedAssignment"("driverId", "releasedAt");
CREATE UNIQUE INDEX "SimulatedAssignment_one_active_driver" ON "SimulatedAssignment"("driverId") WHERE "releasedAt" IS NULL;
CREATE INDEX "SimulatedOffer_status_expiresAt_idx" ON "SimulatedOffer"("status", "expiresAt");
CREATE UNIQUE INDEX "SimulatedOffer_rideId_driverId_key" ON "SimulatedOffer"("rideId", "driverId");

ALTER TABLE "SimulatedRide" ADD CONSTRAINT "SimulatedRide_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedAssignment" ADD CONSTRAINT "SimulatedAssignment_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "SimulatedRide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedAssignment" ADD CONSTRAINT "SimulatedAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "SimulatedDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedOffer" ADD CONSTRAINT "SimulatedOffer_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "SimulatedRide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
