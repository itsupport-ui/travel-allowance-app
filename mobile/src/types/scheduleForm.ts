import type {
  SchedulePriority,
  ScheduleType,
  ScheduleVisitType,
} from "./schedule";

export interface ScheduleFormState {
  doctorId: number | null;
  endDate: Date | null;
  estimatedDurationMinutes: number;
  inTime: Date | null;
  instructions: string;
  clinicalNotes: string;
  medicines: string;
  outTime: Date | null;
  patientAddress: string;
  patientName: string;
  patientPhone: string;
  patientReferenceId: string;
  precautions: string;
  priority: SchedulePriority;
  scheduleType: ScheduleType;
  startDate: Date | null;
  therapistId: number | null;
  treatmentDate: Date | null;
  treatmentName: string;
  visitType: ScheduleVisitType;
}

export type ScheduleFormField =
  | "doctorId"
  | "endDate"
  | "inTime"
  | "instructions"
  | "outTime"
  | "patientAddress"
  | "patientName"
  | "patientPhone"
  | "scheduleType"
  | "startDate"
  | "therapistId"
  | "treatmentDate"
  | "treatmentName";

export type ScheduleFormErrors = Partial<
  Record<ScheduleFormField, string>
>;
