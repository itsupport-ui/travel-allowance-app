import { api } from "../api/apiClient";

export type LocationExceptionAction = "punch_in" | "punch_out";
export type LocationExceptionTarget = "doctor_visit" | "therapist_schedule";
export type LocationExceptionStatus =
  | "approved"
  | "expired"
  | "pending"
  | "rejected"
  | "used";

export interface LocationExceptionRequest {
  action: LocationExceptionAction;
  business_date: string;
  decision_reason: string | null;
  distance_km: number | null;
  evidence_quality: string;
  gps_accuracy_m: number;
  gps_accuracy_threshold_m: number;
  evidence_max_age_minutes: number;
  approval_valid_hours: number;
  max_evidence_movement_m: number;
  location_policy_id: number | null;
  location_policy_version: number;
  id: number;
  reason: string;
  requested_at: string;
  requester_name: string | null;
  staff_role: string;
  status: LocationExceptionStatus;
  target_id: number;
  target_type: LocationExceptionTarget;
  version: number;
  geofence_radius_m: number;
}

export const createLocationException = async (payload: {
  action: LocationExceptionAction;
  device_timestamp: string;
  gps_accuracy_m: number;
  latitude: number;
  longitude: number;
  reason: string;
  target_id: number;
  target_type: LocationExceptionTarget;
}): Promise<LocationExceptionRequest> => {
  const response = await api.post<LocationExceptionRequest>(
    "/location-exceptions",
    payload
  );
  return response.data;
};

export const listLocationExceptions = async (
  status: LocationExceptionStatus | "all" = "pending"
): Promise<LocationExceptionRequest[]> => {
  const response = await api.get<LocationExceptionRequest[]>(
    "/location-exceptions",
    { params: { status } }
  );
  return response.data;
};

export const decideLocationException = async (
  requestId: number,
  payload: {
    decision: "approved" | "rejected";
    reason: string;
    version: number;
  }
): Promise<LocationExceptionRequest> => {
  const response = await api.put<LocationExceptionRequest>(
    `/location-exceptions/${requestId}/decision`,
    payload
  );
  return response.data;
};
