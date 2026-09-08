import type {
  SchedulePriority,
  ScheduleStatus,
  ScheduleType,
  ScheduleVisitType,
} from "./schedule";

export type AdminScheduleView =
  | "today"
  | "upcoming"
  | "in_progress"
  | "completed"
  | "cancelled";

export type AdminScheduleSort =
  | "time"
  | "newest"
  | "priority"
  | "patient"
  | "therapist";

export type AdminOperationalScheduleStatus =
  | ScheduleStatus
  | "in_progress";

export interface AdminScheduleFilters {
  doctorId: number | null;
  fromDate: string;
  priority: SchedulePriority | null;
  search: string;
  sort: AdminScheduleSort;
  therapistId: number | null;
  toDate: string;
  view: AdminScheduleView;
}

export interface AdminScheduleSummary {
  cancelled: number;
  cancelledToday: number;
  completed: number;
  completedToday: number;
  conflicts: number;
  highPriorityToday: number;
  inProgress: number;
  today: number;
  upcoming: number;
}

export interface AdminScheduleReviewItem {
  availableActions: string[];
  area: string;
  blockingReasons: string[];
  clinicalNotes: string | null;
  doctorId: number;
  doctorName: string;
  durationMinutes: number;
  expectedEndTime: string;
  hasConflict: boolean;
  id: number;
  instructions: string;
  medicines: string | null;
  occurrenceDate: string | null;
  operationalStatus: AdminOperationalScheduleStatus;
  patientAddress: string;
  patientName: string;
  patientPhone: string | null;
  patientReferenceId: string | null;
  precautions: string | null;
  priority: SchedulePriority;
  scheduleType: ScheduleType;
  startDate: string | null;
  startTime: string;
  status: ScheduleStatus;
  nextAction: string | null;
  therapistId: number;
  therapistName: string;
  treatmentName: string;
  visitType: ScheduleVisitType;
}

export interface AdminScheduleReviewPage {
  items: AdminScheduleReviewItem[];
  page: number;
  pageSize: number;
  summary: AdminScheduleSummary;
  total: number;
  totalPages: number;
}

export interface SchedulePatientOption {
  address: string;
  name: string;
  phone: string | null;
  referenceId: string | null;
}

export interface ScheduleDoctorOption {
  id: number;
  name: string;
  specialization: string | null;
}

export interface ScheduleTherapistOption {
  email: string;
  id: number;
  name: string;
  todayAppointments: number;
}

export interface AdminScheduleFormOptions {
  doctors: ScheduleDoctorOption[];
  patients: SchedulePatientOption[];
  therapists: ScheduleTherapistOption[];
}

export interface ScheduleConflictItem {
  expectedEndTime: string;
  id: number;
  patientName: string;
  scheduleDate: string | null;
  startTime: string;
}

export interface TherapistAvailability {
  available: boolean;
  conflicts: ScheduleConflictItem[];
  todayAppointments: number;
}
