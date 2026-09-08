import type { UserRole } from "./auth";

export type OfflineMutationType =
  | "doctor_claim_submit"
  | "doctor_visit_punch_in"
  | "doctor_visit_punch_out"
  | "doctor_workday_end"
  | "doctor_workday_start"
  | "therapist_claim_submit"
  | "therapist_treatment_punch_in"
  | "therapist_treatment_punch_out"
  | "therapist_workday_end"
  | "therapist_workday_start";

export type OfflineMutationStatus =
  | "needs_attention"
  | "queued"
  | "syncing";

export interface OfflineMutationItem {
  id: string;
  ownerId: number;
  ownerRole: UserRole;
  operationType: OfflineMutationType;
  targetId: number | null;
  businessDate: string;
  createdAt: string;
  expiresAt: string;
  status: OfflineMutationStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
}

export interface OfflineMutationPayload {
  body: Record<string, unknown> | null;
  version: 1;
}

export interface OfflineQueueSummary {
  items: OfflineMutationItem[];
  needsAttentionCount: number;
  queuedCount: number;
  syncingCount: number;
}
