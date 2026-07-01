export type TherapistScheduleView =
  | "today"
  | "upcoming"
  | "completed"
  | "missed";

export const queryKeys = {
  auth: {
    user: ["auth", "user"] as const,
  },
  dashboard: {
    summary: ["dashboard", "summary"] as const,
  },
  workday: {
    today: ["workday", "today"] as const,
  },
  schedules: {
    all: ["schedules"] as const,
    list: (view: TherapistScheduleView) =>
      ["schedules", "list", view] as const,
    detail: (scheduleId: number) =>
      ["schedules", "detail", scheduleId] as const,
  },
  travel: {
    all: ["travel"] as const,
    today: ["travel", "today"] as const,
    detail: (travelId: number) =>
      ["travel", "detail", travelId] as const,
  },
  claims: {
    all: ["claims"] as const,
    mine: ["claims", "mine"] as const,
    detail: (claimId: number) =>
      ["claims", "detail", claimId] as const,
  },
} as const;
