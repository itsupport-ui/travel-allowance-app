export type ScheduleType = "one_time" | "recurring";

export type SchedulePriority = "normal" | "high";
export type ScheduleVisitType =
  | "home_visit"
  | "clinic_visit"
  | "follow_up"
  | "assessment";

export type ScheduleStatus =
  | "scheduled"
  | "completed"
  | "missed"
  | "cancelled";

export type ScheduleTransportMode =
  | "vehicle"
  | "auto"
  | "bus"
  | "metro"
  | "cab"
  | "other";

export interface CreateScheduleRequest {
  patient_name: string;
  patient_reference_id?: string | null;
  patient_phone?: string | null;
  doctor_id: number;
  therapist_id: number;
  treatment_name: string;
  visit_type: ScheduleVisitType;
  medicines?: string | null;
  patient_address: string;
  schedule_type: ScheduleType;
  treatment_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_time: string;
  out_time: string;
  instructions?: string;
  clinical_notes?: string | null;
  precautions?: string | null;
  priority?: SchedulePriority;
}

export interface UpdateScheduleRequest {
  patient_name: string;
  patient_reference_id?: string | null;
  patient_phone?: string | null;
  doctor_id: number;
  therapist_id: number;
  treatment_name: string;
  visit_type: ScheduleVisitType;
  medicines?: string | null;
  patient_address: string;
  schedule_type: ScheduleType;
  treatment_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_time: string;
  out_time: string;
  instructions: string;
  clinical_notes?: string | null;
  precautions?: string | null;
  priority: SchedulePriority;
}

export interface ScheduleResponse {
  id: number;
  patient_name: string;
  patient_reference_id: string | null;
  patient_phone: string | null;
  doctor_name: string | null;
  therapist_name: string | null;
  doctor_id: number;
  therapist_id: number;
  treatment_name: string;
  visit_type: ScheduleVisitType;
  medicines: string | null;
  patient_address: string;
  patient_latitude: number | null;
  patient_longitude: number | null;
  schedule_type: ScheduleType;
  treatment_date: string | null;
  start_date: string | null;
  end_date: string | null;
  in_time: string;
  out_time: string;
  instructions: string;
  clinical_notes: string | null;
  precautions: string | null;
  priority: SchedulePriority;
  status: ScheduleStatus;
  created_at: string;
  completion_notes: string | null;
  completed_at: string | null;
  missed_reason: string | null;
  punch_in_time: string | null;
  punch_out_time: string | null;
  punch_in_latitude: number | null;
  punch_in_longitude: number | null;
  punch_out_latitude: number | null;
  punch_out_longitude: number | null;
  treatment_duration: number | null;
  session_status: TreatmentSessionStatus;
  arrival_warning: string | null;
}

export type Schedule = ScheduleResponse;

export type TreatmentSessionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED";

export interface TreatmentSession {
  schedule_id: number;
  therapist_id: number;
  schedule_status: string;
  session_status: TreatmentSessionStatus;
  punch_in_time: string | null;
  punch_out_time: string | null;
  punch_in_latitude: number | null;
  punch_in_longitude: number | null;
  punch_out_latitude: number | null;
  punch_out_longitude: number | null;
  treatment_duration: number | null;
  elapsed_seconds: number;
  workday_started: boolean;
  location_verified: boolean | null;
  can_punch_in: boolean;
  can_punch_out: boolean;
  eligibility_message: string | null;
}

export interface CompleteTreatmentRequest {
  completion_notes: string;
  arrival_latitude: number;
  arrival_longitude: number;
  transport_mode: ScheduleTransportMode;
  bill_amount?: number | null;
  invoice_file?: {
    mimeType: string;
    name: string;
    uri: string;
  } | null;
}
