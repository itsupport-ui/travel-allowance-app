import type { Schedule } from "./schedule";
import type { TherapistResponse } from "./therapist";

export type AdminScheduleView =
  | "today"
  | "upcoming"
  | "completed"
  | "missed";

export interface AdminScheduleData {
  today: Schedule[];
  upcoming: Schedule[];
  completed: Schedule[];
  missed: Schedule[];
  therapists: TherapistResponse[];
}
