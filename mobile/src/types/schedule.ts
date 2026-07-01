export type ScheduleType = "one_time" | "recurring";

export type SchedulePriority = "normal" | "high";

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
  doctor_id: number;
  therapist_id: number;
  treatment_name: string;
  medicines?: string | null;
  patient_address: string;
  schedule_type: ScheduleType;
  treatment_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_time: string;
  out_time: string;
  instructions?: string;
  priority?: SchedulePriority;
  transport_mode?: ScheduleTransportMode;
}

export interface UpdateScheduleRequest {
  patient_name: string;
  doctor_id: number;
  therapist_id: number;
  treatment_name: string;
  medicines?: string | null;
  patient_address: string;
  schedule_type: ScheduleType;
  treatment_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  in_time: string;
  out_time: string;
  instructions: string;
  priority: SchedulePriority;
  transport_mode?: ScheduleTransportMode | null;
}

export interface ScheduleResponse {
  id: number;
  patient_name: string;
  doctor_name: string | null;
  therapist_name: string | null;
  doctor_id: number;
  therapist_id: number;
  treatment_name: string;
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
  priority: SchedulePriority;
  status: ScheduleStatus;
  created_at: string;
  completion_notes: string | null;
  completed_at: string | null;
  missed_reason: string | null;
  transport_mode: ScheduleTransportMode | null;
  arrival_warning: string | null;
}

export type Schedule = ScheduleResponse;

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
