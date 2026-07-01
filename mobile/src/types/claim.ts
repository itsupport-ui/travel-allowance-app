export interface ClaimResponse {
  id: number;
  claim_date: string;
  total_km: number;
  travel_total: number;
  daily_allowance: number;
  grand_total: number;
  patient_visited_today?: string | null;
  status: string;
  therapist_name?: string | null;
  patient_count?: number | null;
  per_km_rate?: number | null;
}

export interface ClaimTravelEntry {
  id: number;
  travel_date: string;
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
  claim: ClaimResponse;
  travels: ClaimTravelEntry[];
}
