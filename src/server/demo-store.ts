import "server-only";
import { randomUUID } from "node:crypto";
import {
  assertTripTransition,
  demoUsers,
  type AppRole,
  type AuditEvent,
  type LedgerEntry,
  type Trip,
  type TripStatus,
} from "@/lib/domain";
import { ledgerBreakdown } from "@/server/pricing";

type DemoStore = {
  trips: Trip[];
  ledger: LedgerEntry[];
  audits: AuditEvent[];
  operatorOnline: boolean;
  operatorApplication?: { status: "SUBMITTED"; submittedAt: string };
};

const initialTrip: Trip = {
  id: "trip_demo_001",
  customerId: demoUsers.CUSTOMER.id,
  operatorId: demoUsers.OPERATOR.id,
  service: "RIDE",
  pickup: "Osu Oxford Street, Accra",
  destination: "Kwame Nkrumah Circle, Accra",
  estimatedDistanceKm: 5.2,
  estimatedDurationMin: 18,
  estimatedFarePesewas: 4200,
  status: "RIDER_EN_ROUTE",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const globalStore = globalThis as typeof globalThis & { rovaDemoStore?: DemoStore };

function store(): DemoStore {
  globalStore.rovaDemoStore ??= {
    trips: [initialTrip],
    ledger: [],
    audits: [],
    operatorOnline: false,
    operatorApplication: undefined,
  };
  return globalStore.rovaDemoStore;
}

export function isDemoMode(): boolean {
  return process.env.ROVA_DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
}

export function getDashboardData() {
  const data = store();
  return {
    trips: data.trips,
    ledger: data.ledger,
    audits: data.audits,
    operatorOnline: data.operatorOnline,
    operatorApplication: data.operatorApplication,
  };
}

export function submitOperatorApplication() {
  const data = store();
  data.operatorApplication = { status: "SUBMITTED", submittedAt: new Date().toISOString() };
  addAudit(demoUsers.OPERATOR.id, "OPERATOR_APPLICATION_SUBMITTED", "OperatorApplication", demoUsers.OPERATOR.id);
  return data.operatorApplication;
}

export function setOperatorAvailability(online: boolean) {
  store().operatorOnline = online;
  addAudit(demoUsers.OPERATOR.id, online ? "OPERATOR_ONLINE" : "OPERATOR_OFFLINE", "Operator", demoUsers.OPERATOR.id);
}

export function createTrip(input: Pick<Trip, "pickup" | "destination" | "service"> & { farePesewas: number }) {
  const now = new Date().toISOString();
  const trip: Trip = {
    id: `trip_${randomUUID()}`,
    customerId: demoUsers.CUSTOMER.id,
    service: input.service,
    pickup: input.pickup,
    destination: input.destination,
    estimatedDistanceKm: 5.2,
    estimatedDurationMin: 18,
    estimatedFarePesewas: input.farePesewas,
    status: "SEARCHING",
    createdAt: now,
    updatedAt: now,
  };
  store().trips.unshift(trip);
  addAudit(demoUsers.CUSTOMER.id, "TRIP_REQUESTED", "Trip", trip.id);
  return trip;
}

export function transitionTrip(tripId: string, nextStatus: TripStatus, actor: AppRole) {
  const data = store();
  const trip = data.trips.find((item) => item.id === tripId);
  if (!trip) throw new Error("Trip not found.");
  assertTripTransition(trip.status, nextStatus);

  if (nextStatus === "RIDER_ASSIGNED") {
    if (!data.operatorOnline) throw new Error("Go online before accepting a request.");
    trip.operatorId = demoUsers.OPERATOR.id;
  }
  trip.status = nextStatus;
  trip.updatedAt = new Date().toISOString();
  addAudit(actor === "OPERATOR" ? demoUsers.OPERATOR.id : demoUsers.CUSTOMER.id, `TRIP_${nextStatus}`, "Trip", trip.id);

  if (nextStatus === "TRIP_COMPLETED" && trip.operatorId) {
    const { platformFeePesewas: feePesewas, operatorEarningPesewas } = ledgerBreakdown(trip.estimatedFarePesewas);
    data.ledger.unshift({
      id: randomUUID(),
      operatorId: trip.operatorId,
      tripId: trip.id,
      type: "CREDIT",
      category: "TRIP_EARNING",
      amountPesewas: operatorEarningPesewas,
      description: "Demo net trip earning",
      createdAt: new Date().toISOString(),
    });
    data.ledger.unshift({
      id: randomUUID(),
      operatorId: trip.operatorId,
      tripId: trip.id,
      type: "DEBIT",
      category: "PLATFORM_FEE",
      amountPesewas: feePesewas,
      description: "Demo ROVA platform fee (configurable example)",
      createdAt: new Date().toISOString(),
    });
  }
  return trip;
}

function addAudit(actorId: string, action: string, entity: string, entityId: string) {
  store().audits.unshift({
    id: randomUUID(),
    actorId,
    action,
    entity,
    entityId,
    createdAt: new Date().toISOString(),
  });
}
