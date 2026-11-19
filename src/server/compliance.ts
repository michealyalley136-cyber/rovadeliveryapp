import type { AppRole } from "@/lib/domain";

type RequirementStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "MISSING" | "UNDER_REVIEW";

const demoOperatorRequirements: Record<string, RequirementStatus> = {
  identity: "VALID",
  licence: "VALID",
  vehicle_registration: "VALID",
  insurance: "VALID",
  training: "VALID",
  operator_agreement: "VALID",
};

export function operatorActivationDecision(role: AppRole, requirements = demoOperatorRequirements) {
  if (role !== "OPERATOR") return { allowed: false, reason: "An operator profile is required." };
  const outstanding = Object.entries(requirements)
    .filter(([, status]) => status !== "VALID")
    .map(([requirement]) => requirement.replaceAll("_", " "));
  return outstanding.length
    ? { allowed: false, reason: `Complete required checks: ${outstanding.join(", ")}.` }
    : { allowed: true, reason: "Required demo compliance checks are valid." };
}
