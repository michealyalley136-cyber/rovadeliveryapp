import "server-only";

export const featureFlags = {
  applicationsEnabled: process.env.APPLICATIONS_ENABLED !== "false",
  customerApplicationsEnabled: process.env.CUSTOMER_APPLICATIONS_ENABLED !== "false",
  riderApplicationsEnabled: process.env.RIDER_APPLICATIONS_ENABLED !== "false",
  driverApplicationsEnabled: process.env.DRIVER_APPLICATIONS_ENABLED !== "false",
  deliveryApplicationsEnabled: process.env.DELIVERY_APPLICATIONS_ENABLED !== "false",
  vehicleAccessEnabled: process.env.VEHICLE_ACCESS_ENABLED !== "false",
  merchantApplicationsEnabled: process.env.MERCHANT_APPLICATIONS_ENABLED !== "false",
  fleetApplicationsEnabled: process.env.FLEET_APPLICATIONS_ENABLED !== "false",
  partnerApplicationsEnabled: process.env.PARTNER_APPLICATIONS_ENABLED !== "false",
  customerRidesEnabled: process.env.CUSTOMER_RIDES_ENABLED === "true",
  foodOrderingEnabled: process.env.FOOD_ORDERING_ENABLED === "true",
  liveDispatchEnabled: process.env.LIVE_DISPATCH_ENABLED === "true",
};

export function isCustomerRidesEnabled() {
  return process.env.CUSTOMER_RIDES_ENABLED === "true";
}

export function isApplicationEnabled(type: string) {
  if (!featureFlags.applicationsEnabled) return false;
  if (type === "CUSTOMER") return featureFlags.customerApplicationsEnabled;
  if (type === "MOTORCYCLE_RIDER") return featureFlags.riderApplicationsEnabled;
  if (type === "TAXI_DRIVER") return featureFlags.driverApplicationsEnabled;
  if (type === "DELIVERY_PARTNER") return featureFlags.deliveryApplicationsEnabled;
  if (type === "VEHICLE_ACCESS") return featureFlags.vehicleAccessEnabled;
  if (type === "MERCHANT") return featureFlags.merchantApplicationsEnabled;
  if (type === "FLEET_OWNER" || type === "VEHICLE_DEALER") return featureFlags.fleetApplicationsEnabled;
  if (type === "STRATEGIC_PARTNER") return featureFlags.partnerApplicationsEnabled;
  return false;
}
