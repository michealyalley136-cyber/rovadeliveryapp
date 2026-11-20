export const applicationTypes = [
  "MOTORCYCLE_RIDER",
  "TAXI_DRIVER",
  "DELIVERY_PARTNER",
  "VEHICLE_ACCESS",
  "MERCHANT",
  "FLEET_OWNER",
  "VEHICLE_DEALER",
  "STRATEGIC_PARTNER",
] as const;

export type ApplicationType = (typeof applicationTypes)[number];
export type ApplicationStatus =
  | "RECEIVED"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_REQUIRED"
  | "PRE_QUALIFIED"
  | "APPROVED_FOR_NEXT_STAGE"
  | "WAITLISTED"
  | "DECLINED";

export type ApplicationField = {
  name: string;
  label: string;
  kind: "text" | "email" | "tel" | "number" | "select" | "textarea";
  required?: boolean;
  options?: string[];
  hint?: string;
};

export const applicationTypeOptions: { type: ApplicationType; label: string; description: string; prefix: string }[] = [
  { type: "MOTORCYCLE_RIDER", label: "Motorcycle Rider", description: "Provide passenger rides through the future ROVA network.", prefix: "RID" },
  { type: "TAXI_DRIVER", label: "Taxi Driver", description: "Explore driving opportunities with the future ROVA network.", prefix: "DRV" },
  { type: "DELIVERY_PARTNER", label: "Delivery Partner", description: "Help people and businesses move food and packages.", prefix: "DEL" },
  { type: "VEHICLE_ACCESS", label: "Vehicle Access Applicant", description: "Explore access to a vehicle for future work.", prefix: "VEH" },
  { type: "MERCHANT", label: "Merchant / Restaurant", description: "Connect your food or retail business with ROVA.", prefix: "MER" },
  { type: "FLEET_OWNER", label: "Fleet Owner", description: "Explore placing vehicles with the future network.", prefix: "FLT" },
  { type: "VEHICLE_DEALER", label: "Vehicle Dealer", description: "Discuss a dealer or vehicle supply partnership.", prefix: "DLR" },
  { type: "STRATEGIC_PARTNER", label: "Strategic / Business Partner", description: "Partner with ROVA in finance, insurance, technology or more.", prefix: "PAR" },
];

export const ghanaCities = [
  "Accra", "Tema", "Kumasi", "Takoradi", "Cape Coast", "Koforidua", "Tamale", "Ho", "Sunyani", "Other",
];

export const sharedApplicationFields: ApplicationField[] = [
  { name: "firstName", label: "First name", kind: "text", required: true },
  { name: "lastName", label: "Last name", kind: "text", required: true },
  { name: "phone", label: "Primary phone", kind: "tel", required: true, hint: "Ghana number, for example +233 24 123 4567." },
  { name: "whatsapp", label: "WhatsApp number (optional)", kind: "tel", hint: "Leave blank if this is the same as your primary phone." },
  { name: "email", label: "Email (optional)", kind: "email" },
  { name: "city", label: "City or town", kind: "select", required: true, options: [...ghanaCities] },
  { name: "area", label: "Area / community (optional)", kind: "text" },
];

export const applicationFields: Record<ApplicationType, ApplicationField[]> = {
  MOTORCYCLE_RIDER: [
    { name: "currentlyRides", label: "Do you currently ride motorcycles?", kind: "select", required: true, options: ["Yes", "No"] },
    { name: "experienceYears", label: "Years of riding experience", kind: "select", required: true, options: ["Less than 1 year", "1–2 years", "3–5 years", "6+ years"] },
    { name: "licenceStatus", label: "Do you have a valid motorcycle licence?", kind: "select", required: true, options: ["Yes", "No", "In progress"] },
    { name: "ownsVehicle", label: "Do you currently own a motorcycle?", kind: "select", required: true, options: ["Yes", "No"] },
    { name: "vehicleDetails", label: "Motorcycle make / model (optional)", kind: "text" },
    { name: "workInterests", label: "Services you are interested in", kind: "select", required: true, options: ["Passenger rides", "Food delivery", "Package delivery", "Multiple services"] },
    { name: "availability", label: "Availability", kind: "select", required: true, options: ["Full-time", "Part-time", "Weekends", "Flexible"] },
    { name: "preferredArea", label: "Preferred working area", kind: "text", required: true },
    { name: "vehicleAccess", label: "Would you like to be considered for future vehicle access?", kind: "select", required: true, options: ["Yes", "No"] },
  ],
  TAXI_DRIVER: [
    { name: "experienceYears", label: "Years of driving experience", kind: "select", required: true, options: ["Less than 1 year", "1–2 years", "3–5 years", "6+ years"] },
    { name: "licenceStatus", label: "Driver’s licence status", kind: "select", required: true, options: ["Valid", "Needs renewal", "In progress"] },
    { name: "ownsVehicle", label: "Do you have a car available for work?", kind: "select", required: true, options: ["Yes, I own it", "Yes, fleet / family vehicle", "No, I need vehicle access"] },
    { name: "vehicleDetails", label: "Vehicle make / model / year (optional)", kind: "text" },
    { name: "insuranceStatus", label: "Vehicle insurance status", kind: "select", required: true, options: ["Currently insured", "Not currently insured", "Not applicable"] },
    { name: "preferredArea", label: "Preferred service area", kind: "text", required: true },
    { name: "availability", label: "Availability", kind: "select", required: true, options: ["Full-time", "Part-time", "Weekends", "Flexible"] },
  ],
  DELIVERY_PARTNER: [
    { name: "transportType", label: "How would you make deliveries?", kind: "select", required: true, options: ["Motorcycle", "Car", "Bicycle (future option)", "Other"] },
    { name: "vehicleAccess", label: "Do you need vehicle access?", kind: "select", required: true, options: ["No, I have a vehicle", "Yes, I would like to explore options"] },
    { name: "experienceYears", label: "Delivery experience", kind: "select", required: true, options: ["No experience yet", "Less than 1 year", "1–3 years", "4+ years"] },
    { name: "availability", label: "Availability", kind: "select", required: true, options: ["Full-time", "Part-time", "Weekends", "Flexible"] },
    { name: "preferredArea", label: "Preferred delivery areas", kind: "text", required: true },
  ],
  VEHICLE_ACCESS: [
    { name: "vehicleType", label: "Vehicle you are interested in", kind: "select", required: true, options: ["Motorcycle", "Car"] },
    { name: "licenceStatus", label: "Current licence status", kind: "select", required: true, options: ["Valid", "In progress", "Not yet"] },
    { name: "experienceYears", label: "Commercial riding / driving experience", kind: "select", required: true, options: ["No experience yet", "Less than 1 year", "1–2 years", "3+ years"] },
    { name: "serviceInterest", label: "Preferred ROVA opportunity", kind: "select", required: true, options: ["Passenger rides", "Taxi", "Food delivery", "Package delivery"] },
    { name: "depositReadiness", label: "Deposit readiness", kind: "select", required: true, options: ["Yes", "Maybe", "I need more information"] },
    { name: "accessInterest", label: "What would you like to explore?", kind: "select", required: true, options: ["Rental", "Financing through an authorized partner", "Either option", "I need more information"] },
  ],
  MERCHANT: [
    { name: "businessName", label: "Business name", kind: "text", required: true },
    { name: "businessCategory", label: "Business category", kind: "select", required: true, options: ["Restaurant", "Food vendor", "Bakery", "Cafe", "Grocery", "Retail", "Other"] },
    { name: "businessAddress", label: "Business address / neighbourhood", kind: "text", required: true },
    { name: "numberOfLocations", label: "Number of locations", kind: "select", required: true, options: ["1", "2–3", "4–10", "11+"] },
    { name: "deliveryService", label: "Do you currently offer delivery?", kind: "select", required: true, options: ["Yes", "No"] },
    { name: "website", label: "Website or social page (optional)", kind: "text" },
    { name: "comments", label: "Anything else we should know? (optional)", kind: "textarea" },
  ],
  FLEET_OWNER: [
    { name: "entityType", label: "Applying as", kind: "select", required: true, options: ["Individual", "Company"] },
    { name: "vehicleTypes", label: "Vehicle types available", kind: "select", required: true, options: ["Motorcycles", "Cars", "Motorcycles and cars"] },
    { name: "vehicleCount", label: "Number of vehicles", kind: "select", required: true, options: ["1", "2–5", "6–20", "21+"] },
    { name: "vehiclesFinanced", label: "Are any vehicles currently financed?", kind: "select", required: true, options: ["Yes", "No", "Some of them"] },
    { name: "partnershipInterest", label: "Partnership interest", kind: "select", required: true, options: ["Fleet leasing", "Rental", "Driver placement", "Finance vehicles", "Manage drivers", "Corporate delivery", "Other"] },
  ],
  VEHICLE_DEALER: [
    { name: "organization", label: "Dealership / supplier name", kind: "text", required: true },
    { name: "vehicleTypes", label: "Vehicle types supplied", kind: "select", required: true, options: ["Motorcycles", "Cars", "Both"] },
    { name: "vehicleCount", label: "Potential supply capacity", kind: "select", required: true, options: ["1–5", "6–20", "21–50", "50+"] },
    { name: "partnershipInterest", label: "Partnership interests", kind: "select", required: true, options: ["Vehicle sales", "Rental / fleet", "Maintenance", "Financing referrals", "Other"] },
    { name: "website", label: "Website (optional)", kind: "text" },
  ],
  STRATEGIC_PARTNER: [
    { name: "organization", label: "Organization", kind: "text", required: true },
    { name: "partnerCategory", label: "Partner category", kind: "select", required: true, options: ["Bank", "Finance institution", "Motorcycle supplier", "Car dealer", "Insurance provider", "Maintenance provider", "Restaurant group", "Phone / telecom", "Fleet company", "Corporate organization", "Corporate merchant", "Technology provider", "Government / institutional", "Other"] },
    { name: "position", label: "Your position", kind: "text", required: true },
    { name: "website", label: "Organization website (optional)", kind: "text" },
    { name: "partnershipInterest", label: "How would you like to partner?", kind: "textarea", required: true },
  ],
};

const additionalFields: Record<ApplicationType, ApplicationField[]> = {
  MOTORCYCLE_RIDER: [],
  TAXI_DRIVER: [
    { name: "vehicleAccessInterest", label: "Interested in future vehicle-access opportunities?", kind: "select", options: ["Yes", "No", "I need more information"] },
  ],
  DELIVERY_PARTNER: [
    { name: "otherTransport", label: "Other transport available (optional)", kind: "text" },
  ],
  VEHICLE_ACCESS: [
    { name: "employmentSituation", label: "Current employment or income situation (optional)", kind: "text" },
    { name: "availability", label: "Expected working schedule", kind: "select", options: ["Full-time", "Part-time", "Weekends", "Flexible"] },
  ],
  MERCHANT: [
    { name: "products", label: "What do you sell? (optional)", kind: "text" },
    { name: "dailyOrders", label: "Estimated daily order volume (optional)", kind: "text" },
    { name: "rovaDeliveryInterest", label: "Interested in ROVA delivery?", kind: "select", options: ["Yes", "No", "I need more information"] },
  ],
  FLEET_OWNER: [
    { name: "companyName", label: "Company name (optional)", kind: "text" },
    { name: "otherVehicles", label: "Other vehicle types (optional)", kind: "text" },
  ],
  VEHICLE_DEALER: [
    { name: "commercialVehicles", label: "Commercial vehicles available?", kind: "select", options: ["Yes", "No"] },
    { name: "vehicleCondition", label: "Vehicle condition", kind: "select", options: ["New", "Used", "Both"] },
    { name: "financingPrograms", label: "Financing or rental programs (optional)", kind: "text" },
    { name: "operatingRegions", label: "Operating regions (optional)", kind: "text" },
  ],
  STRATEGIC_PARTNER: [],
};

const regionField: ApplicationField = {
  name: "region",
  label: "Region",
  kind: "select",
  options: ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"],
};

for (const type of applicationTypes) {
  applicationFields[type].push(regionField, ...additionalFields[type]);
}

export function isApplicationType(value: string | null | undefined): value is ApplicationType {
  return applicationTypes.includes(value as ApplicationType);
}
