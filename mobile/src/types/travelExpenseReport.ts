export type TravelExpensePersonType = "therapist" | "doctor";

export type TravelExpenseReportFormat = "pdf" | "xlsx" | "csv";

export interface TravelExpenseReportFilters {
  personType?: TravelExpensePersonType;
  personId?: number | "all";
  month?: string;
  startDate?: string;
  endDate?: string;
}

export interface TravelExpenseReportRow {
  date: string;
  patient_name: string;
  from_address: string;
  to_address: string;
  km: number;
  fare: number;
  daily_allowance: number;
  others: number;
  total: number;
}

export interface TravelExpenseReportGroup {
  person_id: number;
  person_name: string;
  rows: TravelExpenseReportRow[];
  total_km: number;
  total_fare: number;
  total_daily_allowance: number;
  total_others: number;
  grand_total: number;
}

export interface TravelExpenseReportResponse {
  heading: string;
  person_type: TravelExpensePersonType;
  scope: "individual" | "all";
  person_id: number | null;
  person_name: string | null;
  period_label: string;
  start_date: string;
  end_date: string;
  groups: TravelExpenseReportGroup[];
  total_km: number;
  total_fare: number;
  total_daily_allowance: number;
  total_others: number;
  grand_total: number;
  row_count: number;
  generated_at: string;
  warnings: string[];
}
