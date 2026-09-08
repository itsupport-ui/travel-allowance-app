export interface ClaimResponse {
  id: number;
  claim_date: string;
  total_km: number;
  travel_total: number;
  daily_allowance: number;
  grand_total: number;
  patient_visited_today?: boolean | null;
  status: string;
  therapist_name?: string | null;
  patient_count?: number | null;
  per_km_rate?: number | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
  revision?: number;
}

export interface ClaimTravelEntry {
  id: number;
  travel_date: string;
  travel_timestamp?: string | null;
  patient_name: string | null;
  transport_mode: string;
  bill_amount: number | null;
  invoice_file: string | null;
  from_address: string;
  to_address: string;
  total_km: number;
  per_km_rate: number;
  travel_fare: number;
  patient_visited: boolean;
  status: string;
}

export interface ClaimDetailsResponse {
  claim: ClaimResponse & {
    therapist_id: number;
    therapist_role?: string | null;
    submitted_at?: string | null;
    notes?: string | null;
  };
  travels: ClaimTravelEntry[];
}

export interface ClaimReadinessBlocker {
  code: string;
  message: string;
  recoverable: boolean;
  suggested_action: string | null;
  affected_count: number;
  blocking_fields: string[];
}

export interface ClaimReadinessBase {
  business_date: string;
  state: "ready" | "blocked" | "already_submitted";
  can_submit: boolean;
  submission_mode: "submit" | "resubmit" | null;
  eligible_record_count: number;
  eligible_record_ids: number[];
  pending_review_count: number;
  existing_claim_id: number | null;
  existing_claim_status: string | null;
  existing_claim_revision: number | null;
  rejection_reason: string | null;
  total_amount: number;
  total_source: "eligible_records" | "existing_claim" | "none";
  calculation_version: string;
  rounding_mode: string;
  available_actions: string[];
  blocking_reasons: ClaimReadinessBlocker[];
  next_action: string | null;
}

export interface TherapistClaimReadiness extends ClaimReadinessBase {
  total_km: number;
  per_km_rate: number | null;
  travel_total: number;
  daily_allowance: number;
  patient_visited_today: boolean;
  policy_id: number | null;
  policy_version: number | null;
  policy_effective_from: string | null;
}

export interface DoctorClaimReadiness extends ClaimReadinessBase {
  expense_total: number;
}
