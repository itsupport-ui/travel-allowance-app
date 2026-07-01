import type {
  SchedulePriority,
  ScheduleTransportMode,
  ScheduleType,
} from "./schedule";

export interface ScheduleFormState {
  doctorId: number | null;
  endDate: Date | null;
  inTime: Date | null;
  instructions: string;
  medicines: string;
  outTime: Date | null;
  patientAddress: string;
  patientName: string;
  priority: SchedulePriority;
  scheduleType: ScheduleType;
  startDate: Date | null;
  therapistId: number | null;
  treatmentDate: Date | null;
  treatmentName: string;
  transportMode: ScheduleTransportMode;
}

export type ScheduleFormField =
  | "doctorId"
  | "endDate"
  | "inTime"
  | "instructions"
  | "outTime"
  | "patientAddress"
  | "patientName"
  | "scheduleType"
  | "startDate"
  | "therapistId"
  | "treatmentDate"
  | "treatmentName";

export type ScheduleFormErrors = Partial<
  Record<ScheduleFormField, string>
>;
