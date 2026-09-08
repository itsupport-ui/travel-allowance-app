import type {
  OfflineMutationItem,
  OfflineMutationType,
  OfflineQueueSummary,
} from "../types/offlineMutation";

export const OFFLINE_MUTATION_TYPES: readonly OfflineMutationType[] = [
  "doctor_claim_submit",
  "doctor_visit_punch_in",
  "doctor_visit_punch_out",
  "doctor_workday_end",
  "doctor_workday_start",
  "therapist_claim_submit",
  "therapist_treatment_punch_in",
  "therapist_treatment_punch_out",
  "therapist_workday_end",
  "therapist_workday_start",
] as const;

export const isOfflineMutationType = (
  value: unknown
): value is OfflineMutationType =>
  typeof value === "string" &&
  OFFLINE_MUTATION_TYPES.includes(value as OfflineMutationType);

export const indiaBusinessDate = (value = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
};

export const summarizeOfflineItems = (
  items: OfflineMutationItem[]
): OfflineQueueSummary => ({
  items,
  needsAttentionCount: items.filter(
    (item) => item.status === "needs_attention"
  ).length,
  queuedCount: items.filter((item) => item.status === "queued").length,
  syncingCount: items.filter((item) => item.status === "syncing").length,
});

export const hasOfflineMutationExpired = (
  item: OfflineMutationItem,
  currentBusinessDate: string,
  nowMs: number
): boolean =>
  item.businessDate !== currentBusinessDate ||
  !Number.isFinite(Date.parse(item.expiresAt)) ||
  Date.parse(item.expiresAt) <= nowMs;

export const isSameOfflineMutationIntent = (
  left: OfflineMutationItem,
  right: OfflineMutationItem
): boolean =>
  left.ownerId === right.ownerId &&
  left.ownerRole === right.ownerRole &&
  left.operationType === right.operationType &&
  left.targetId === right.targetId &&
  left.businessDate === right.businessDate;

export const offlineMutationRoute = (
  type: OfflineMutationType,
  targetId: number | null
): string => {
  if (
    [
      "doctor_visit_punch_in",
      "doctor_visit_punch_out",
      "therapist_treatment_punch_in",
      "therapist_treatment_punch_out",
    ].includes(type) &&
    (!Number.isInteger(targetId) || Number(targetId) < 1)
  ) {
    throw new Error("A valid target is required for this offline action.");
  }
  const routes: Record<OfflineMutationType, string> = {
    doctor_claim_submit: "/doctor-claims/submit",
    doctor_visit_punch_in: `/doctor-visits/${targetId}/punch-in`,
    doctor_visit_punch_out: `/doctor-visits/${targetId}/punch-out`,
    doctor_workday_end: "/doctor/workday/end",
    doctor_workday_start: "/doctor/workday/start",
    therapist_claim_submit: "/claims/submit",
    therapist_treatment_punch_in: `/treatment-sessions/${targetId}/punch-in`,
    therapist_treatment_punch_out: `/treatment-sessions/${targetId}/punch-out`,
    therapist_workday_end: "/therapist/workday/end",
    therapist_workday_start: "/therapist/workday/start",
  };
  return routes[type];
};

export const offlineMutationLabel = (
  type: OfflineMutationType
): string =>
  ({
    doctor_claim_submit: "Submit doctor claim",
    doctor_visit_punch_in: "Start doctor visit",
    doctor_visit_punch_out: "Complete doctor visit",
    doctor_workday_end: "End doctor workday",
    doctor_workday_start: "Start doctor workday",
    therapist_claim_submit: "Submit therapist claim",
    therapist_treatment_punch_in: "Start treatment",
    therapist_treatment_punch_out: "Complete treatment",
    therapist_workday_end: "End therapist workday",
    therapist_workday_start: "Start therapist workday",
  })[type];
