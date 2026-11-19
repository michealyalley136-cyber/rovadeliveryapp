import type { ApplicationStatus } from "@/config/application-types";

export const applicationStatuses: readonly ApplicationStatus[] = [
  "RECEIVED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "PRE_QUALIFIED",
  "APPROVED_FOR_NEXT_STAGE",
  "WAITLISTED",
  "DECLINED",
];

const transitions: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  RECEIVED: ["UNDER_REVIEW", "WAITLISTED", "DECLINED"],
  UNDER_REVIEW: ["MORE_INFORMATION_REQUIRED", "PRE_QUALIFIED", "WAITLISTED", "DECLINED"],
  MORE_INFORMATION_REQUIRED: ["UNDER_REVIEW", "PRE_QUALIFIED", "WAITLISTED", "DECLINED"],
  PRE_QUALIFIED: ["APPROVED_FOR_NEXT_STAGE", "WAITLISTED", "DECLINED"],
  APPROVED_FOR_NEXT_STAGE: ["UNDER_REVIEW", "WAITLISTED", "DECLINED"],
  WAITLISTED: ["UNDER_REVIEW", "PRE_QUALIFIED", "DECLINED"],
  DECLINED: [],
};

export function assertApplicationTransition(current: ApplicationStatus, next: ApplicationStatus) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Application cannot move from ${current} to ${next}.`);
  }
}
