export const appRoles = ["CUSTOMER", "OPERATOR", "OPERATIONS"] as const;
export type AppRole = (typeof appRoles)[number];
export const adminRoles = ["SUPER_ADMIN", "OPERATIONS_ADMIN", "RECRUITMENT_AGENT", "VIEW_ONLY"] as const;
export type AdminRole = (typeof adminRoles)[number];

export const tripStatuses = [
  "REQUESTED",
  "SEARCHING",
  "RIDER_ASSIGNED",
  "RIDER_EN_ROUTE",
  "RIDER_ARRIVED",
  "TRIP_STARTED",
  "TRIP_COMPLETED",
  "CANCELLED",
  "EMERGENCY",
] as const;
export type TripStatus = (typeof tripStatuses)[number];

export type ServiceType = "RIDE" | "TAXI";

export type Trip = {
  id: string;
  customerId: string;
  operatorId?: string;
  service: ServiceType;
  pickup: string;
  destination: string;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  estimatedFarePesewas: number;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
};

export type LedgerEntry = {
  id: string;
  operatorId: string;
  tripId: string;
  type: "CREDIT" | "DEBIT";
  category: "TRIP_EARNING" | "PLATFORM_FEE";
  amountPesewas: number;
  description: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
};

export type DemoUser = {
  id: string;
  role: AppRole;
  name: string;
};

export const demoUsers: Record<AppRole, DemoUser> = {
  CUSTOMER: { id: "cus_demo_001", role: "CUSTOMER", name: "Ama Mensah" },
  OPERATOR: { id: "op_demo_001", role: "OPERATOR", name: "Kojo Asare" },
  OPERATIONS: { id: "staff_demo_001", role: "OPERATIONS", name: "Operations Team" },
};

export const permissions: Record<AppRole, readonly string[]> = {
  CUSTOMER: ["trip:create:own", "trip:read:own"],
  OPERATOR: ["availability:update:own", "trip:accept:assigned", "trip:advance:assigned", "ledger:read:own"],
  OPERATIONS: ["trip:read:any", "operations:read", "audit:read"],
};

export const allowedTransitions: Partial<Record<TripStatus, readonly TripStatus[]>> = {
  REQUESTED: ["SEARCHING", "CANCELLED"],
  SEARCHING: ["RIDER_ASSIGNED", "CANCELLED"],
  RIDER_ASSIGNED: ["RIDER_EN_ROUTE", "CANCELLED", "EMERGENCY"],
  RIDER_EN_ROUTE: ["RIDER_ARRIVED", "CANCELLED", "EMERGENCY"],
  RIDER_ARRIVED: ["TRIP_STARTED", "CANCELLED", "EMERGENCY"],
  TRIP_STARTED: ["TRIP_COMPLETED", "EMERGENCY"],
  EMERGENCY: ["CANCELLED"],
};

export function assertTripTransition(current: TripStatus, next: TripStatus) {
  if (!allowedTransitions[current]?.includes(next)) {
    throw new Error(`Trip cannot move from ${current} to ${next}.`);
  }
}
