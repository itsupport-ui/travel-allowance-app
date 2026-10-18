export type DoctorTaskType = "clinic_training" | "patient_visit" | "other";

export type DoctorTaskStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Place {
  active: boolean;
  address: string;
  created_at: string;
  id: number;
  latitude: number;
  longitude: number;
  name: string;
  place_type: string;
  radius_m: number | null;
}

export interface CreatePlaceRequest {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  name: string;
  place_type: "clinic" | "other";
  radius_m?: number | null;
}

export interface DoctorTask {
  assigned_by: number;
  can_punch_in: boolean;
  can_punch_out: boolean;
  cancel_reason: string | null;
  completion_notes: string | null;
  doctor_id: number;
  doctor_name: string | null;
  doctor_visit_id: number | null;
  duration_seconds: number | null;
  geofence_radius_m: number | null;
  has_proof: boolean;
  id: number;
  notes: string | null;
  patient_address: string | null;
  patient_name: string | null;
  place: Place | null;
  punch_in_time: string | null;
  punch_out_time: string | null;
  punch_via_visit: boolean;
  scheduled_date: string;
  session_status: string;
  status: DoctorTaskStatus;
  task_type: DoctorTaskType;
  title: string;
  visit_time: string | null;
}

export interface CreateDoctorTaskRequest {
  chief_complaint?: string | null;
  doctor_id: number;
  notes?: string | null;
  patient_address?: string | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  place_id?: number | null;
  scheduled_date: string;
  task_type: DoctorTaskType;
  title: string;
  visit_time?: string | null;
}

export type DoctorTaskScope = "today" | "upcoming" | "history";

export interface TaskPunchLocation {
  accuracy: number | null;
  latitude: number;
  longitude: number;
}

export interface DoctorTaskExpenseOption {
  id: number;
  place_name: string | null;
  punch_in_time: string | null;
  punch_out_time: string | null;
  task_type: DoctorTaskType;
  title: string;
}

export interface DoctorTaskDayItem {
  has_expense: boolean;
  has_proof: boolean;
  id: number;
  proof_required: boolean;
  status: string;
  task_type: DoctorTaskType;
  title: string;
}

export interface DoctorTaskDaySummary {
  business_date: string;
  completed: number;
  completed_without_expense: number;
  tasks: DoctorTaskDayItem[];
  total: number;
  unfinished: number;
}

export interface TaskProofPhoto {
  fileName: string;
  mimeType: string;
  uri: string;
}
