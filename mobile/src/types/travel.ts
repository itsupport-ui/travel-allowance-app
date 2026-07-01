export interface TravelResponse {
  id: number;
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
}
