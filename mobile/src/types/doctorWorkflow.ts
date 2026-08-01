export type DoctorConsultationStatus =
  | "cancelled"
  | "completed"
  | "scheduled";

export type PatientDecision =
  | "confirmed"
  | "follow_up"
  | "pending"
  | "rejected";

export interface DoctorConsultation {
  id: number;
  patient_name: string;
  patient_phone: string;
  patient_address: string;
  doctor_id: number;
  doctor_visit_id?: number | null;
  visit_id?: number | null;
  has_visit?: boolean;
  scheduled_date: string;
  scheduled_time: string;
  purpose: string;
  notes: string | null;
  call_outcome: string | null;
  preliminary_diagnosis: string | null;
  proposed_treatment: string | null;
  estimated_amount: number | null;
  rejection_reason: string | null;
  patient_decision: PatientDecision;
  status: DoctorConsultationStatus;
  created_by: number;
  created_at: string;
  completed_at: string | null;
}

export interface DoctorConsultationDashboard {
  today_calls: number;
  scheduled: number;
  completed: number;
  pending_confirmation: number;
  confirmed: number;
  rejected: number;
  follow_up: number;
}

export interface CompleteDoctorConsultationRequest {
  call_outcome: string;
  preliminary_diagnosis: string | null;
  proposed_treatment: string | null;
  estimated_amount: number | null;
  patient_decision: PatientDecision;
}

export interface DoctorVisit {
  id: number;
  patient_name: string;
  patient_phone: string;
  patient_address: string;
  patient_latitude: number | null;
  patient_longitude: number | null;
  doctor_id: number;
  doctor_name: string | null;
  visit_date: string;
  visit_time: string;
  chief_complaint: string | null;
  remarks: string | null;
  status: string;
  created_by: number | null;
  created_at: string;
  completed_at: string | null;
  punch_in_time: string | null;
  punch_out_time: string | null;
  punch_in_latitude: number | null;
  punch_in_longitude: number | null;
  punch_out_latitude: number | null;
  punch_out_longitude: number | null;
  treatment_duration: number | null;
  session_status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
}

export interface DoctorVisitDashboard {
  today_visits: number;
  scheduled: number;
  visited: number;
  treatment_plan_submitted: number;
  cancelled: number;
}

export interface CreateDoctorVisitRequest {
  patient_name: string;
  patient_phone: string;
  patient_address: string;
  doctor_id: number;
  visit_date: string;
  visit_time: string;
  chief_complaint: string | null;
  remarks: string | null;
}

export interface UpdateDoctorVisitStatusRequest {
  status: string;
  remarks: string | null;
}

export interface TreatmentPlan {
  id: number;
  doctor_visit_id: number;
  doctor_id: number;
  doctor_name: string | null;
  patient_name: string;
  diagnosis: string | null;
  chief_complaint: string | null;
  treatment_plan: string | null;
  medicines: string | null;
  sessions_required: number | null;
  frequency: string | null;
  duration: string | null;
  special_instructions: string | null;
  remarks: string | null;
  status: string;
  has_schedule?: boolean;
  schedule_count?: number;
  created_at: string;
  updated_at: string | null;
}

export interface CreateTreatmentPlanRequest {
  doctor_visit_id: number;
  doctor_id: number;
  patient_name: string;
  diagnosis: string | null;
  chief_complaint: string | null;
  treatment_plan: string | null;
  medicines: string | null;
  sessions_required: number | null;
  frequency: string | null;
  duration: string | null;
  special_instructions: string | null;
  remarks: string | null;
}

export interface CreateDoctorConsultationRequest {
  patient_name: string;
  patient_phone: string;
  patient_address: string;
  doctor_id: number;
  scheduled_date: string;
  scheduled_time: string;
  purpose: string;
  notes: string | null;
}

export interface DoctorConsultationFilters {
  doctor_id?: string;
  from_date?: string;
  patient_decision?: string;
  status?: string;
  to_date?: string;
}

export interface CreateVisitFromConsultationRequest {
  visit_date: string;
  visit_time: string;
  remarks: string | null;
}

export interface TreatmentPlanScheduleRequest {
  therapist_id: number;
  treatment_date: string | null;
  start_date: string | null;
  number_of_sessions: number;
  in_time: string;
  out_time: string;
  priority: string;
  instructions: string;
}

export interface DoctorExpense {
  id: number;
  doctor_id: number;
  expense_date: string;
  workday_id: number | null;
  visit_id: number | null;
  from_waypoint_id: number | null;
  to_waypoint_id: number | null;
  from_location: string;
  to_location: string;
  from_latitude: number | null;
  from_longitude: number | null;
  to_latitude: number | null;
  to_longitude: number | null;
  distance_km: number | null;
  transport_mode: string;
  fare: number;
  proof_file: string | null;
  remarks: string | null;
  status: string;
  claim_id: number | null;
  created_at: string;
}

export interface DoctorProofAsset {
  mimeType: string;
  name: string;
  size: number | null;
  uri: string;
}

export interface SaveDoctorExpenseRequest {
  expense_date: string;
  visit_id: number | null;
  from_location?: string;
  to_location?: string;
  transport_mode: string;
  fare: number;
  remarks: string;
  proof_file: DoctorProofAsset | null;
}

export interface DoctorVisitSession {
  visit_id: number;
  consultation_id: number | null;
  doctor_id: number;
  visit_status: string;
  session_status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
  punch_in_time: string | null;
  punch_out_time: string | null;
  treatment_duration: number | null;
  elapsed_seconds: number;
  workday_started: boolean;
  location_verified: boolean | null;
  can_punch_in: boolean;
  can_punch_out: boolean;
  eligibility_message: string | null;
}

export interface DoctorVisitExpenseOption {
  visit_id: number;
  patient_name: string;
  patient_address: string;
  visit_time: string;
  status: string;
  punch_in_time: string | null;
  punch_out_time: string | null;
  from_location: string;
  to_location: string;
  from_latitude: number;
  from_longitude: number;
  to_latitude: number;
  to_longitude: number;
  distance_km: number | null;
  expense_id: number | null;
}

export interface DoctorTodayWorkday {
  started: boolean;
  workday_id: number | null;
  work_date: string;
  started_at: string | null;
  start_address: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  is_active: boolean;
  ended_at: string | null;
  total_work_minutes: number | null;
  total_visits_count: number | null;
  completed_visits_count: number | null;
  pending_visits_count: number | null;
  total_distance_km: number | null;
  workday_end_time: string;
  can_end_workday: boolean;
  should_prompt_end: boolean;
  auto_logout_enabled: boolean;
  auto_logout_grace_minutes: number;
}

export interface DoctorClaim {
  id: number;
  doctor_id: number;
  claim_date: string;
  total_amount: number;
  expense_count: number;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DoctorClaimDashboard {
  total_claims: number;
  pending_claims: number;
  approved_claims: number;
  rejected_claims: number;
}

export interface DoctorDashboardSummary {
  today_consultations: number;
  today_visits: number;
  pending_treatment_plans: number;
  today_expenses: number;
  pending_claims: number;
}

export interface AdminDoctorClaim extends DoctorClaim {
  doctor_name: string;
}

export interface DoctorClaimFilters {
  doctor_id?: string;
  from_date?: string;
  status?: string;
  to_date?: string;
}

export interface DoctorClaimDetails extends DoctorClaim {
  expenses: DoctorExpense[];
}
