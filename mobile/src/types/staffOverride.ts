export type StaffRole = "doctor" | "therapist";

export interface StaffDeactivationCondition {
  code: string;
  count: number;
  message: string;
}

export interface StaffDeactivationReadiness {
  staff_role: StaffRole;
  staff_id: number;
  current_state: "active" | "inactive";
  readiness_state:
    | "already_inactive"
    | "ready"
    | "hard_blocked"
    | "override_required";
  business_date: string;
  captured_at: string;
  condition_fingerprint: string;
  hard_blockers: StaffDeactivationCondition[];
  operational_impacts: StaffDeactivationCondition[];
  available_actions: string[];
  next_action: string | null;
}

export interface StaffDeactivationOverride {
  id: number;
  rule_code: string;
  subject_role: StaffRole;
  subject_id: number;
  request_reason: string;
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "consumed"
    | "expired"
    | "stale";
  version: number;
  decision_reason: string | null;
  expires_at: string;
  available_actions: string[];
}

export interface StaffDeactivationControlState {
  canDeactivate: boolean;
  overrideRequestId: number | null;
  reason: string;
}
