export interface TravelResponse {
  id: number;
  therapist_id: number;
  therapist_name: string | null;
  travel_date: string;
  from_address: string;
  to_address: string;
  total_km: number;
  per_km_rate: number;
  travel_fare: number;
  patient_visited: boolean;
  status: string;
  claim_id: number | null;
  patient_name: string | null;
  transport_mode: string;
  bill_amount: number | null;
  invoice_file: string | null;
  schedule_id: number | null;
  arrival_latitude: number | null;
  arrival_longitude: number | null;
  manual_reason: string | null;
  manual_review_status: string | null;
  manual_review_reason: string | null;
  manual_revision: number;
  manual_review_version: number;
  available_actions: string[];
}

export interface ManualTravelReviewEvent {
  actor_id: number;
  actor_name: string | null;
  created_at: string;
  event_type: string;
  from_status: string | null;
  id: number;
  reason: string;
  revision: number;
  to_status: string;
}
