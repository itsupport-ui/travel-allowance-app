export interface AppSettings {
  id: number;
  version: number;
  per_km_rate: number;
  daily_allowance: number;
  doctor_receipt_threshold: number;
  effective_from: string;
  effective_to?: string | null;
  rounding_mode: string;
}

export interface UpdateSettingsRequest {
  per_km_rate: number;
  daily_allowance: number;
  doctor_receipt_threshold: number;
  effective_from?: string;
}

export interface LocationPolicy {
  id: number;
  version: number;
  effective_from: string;
  effective_to?: string | null;
  geofence_radius_m: number;
  gps_accuracy_threshold_m: number;
  evidence_max_age_minutes: number;
  approval_valid_hours: number;
  max_evidence_movement_m: number;
  created_by?: number | null;
  created_at: string;
}

export interface UpdateLocationPolicyRequest {
  effective_from?: string;
  geofence_radius_m: number;
  gps_accuracy_threshold_m: number;
  evidence_max_age_minutes: number;
  approval_valid_hours: number;
  max_evidence_movement_m: number;
}
