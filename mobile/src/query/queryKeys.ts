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
    readiness: ["claims", "readiness"] as const,
    detail: (claimId: number) =>
      ["claims", "detail", claimId] as const,
  },
  treatmentSessions: {
    all: ["treatment-sessions"] as const,
    detail: (
      scheduleId: number,
      latitude?: number,
      longitude?: number
    ) =>
      [
        "treatment-sessions",
        scheduleId,
        latitude ?? null,
        longitude ?? null,
      ] as const,
  },
  adminClaims: {
    all: ["admin", "claims"] as const,
    detail: (claimId: number) =>
      ["admin", "claims", "detail", claimId] as const,
  },
  doctor: {
    dashboard: {
      summary: ["doctor", "dashboard", "summary"] as const,
    },
    consultations: {
      all: ["doctor", "consultations"] as const,
      detail: (consultationId: number) =>
        ["doctor", "consultations", "detail", consultationId] as const,
    },
    visits: {
      all: ["doctor", "visits"] as const,
      dashboard: ["doctor", "visits", "dashboard"] as const,
      detail: (visitId: number) =>
        ["doctor", "visits", "detail", visitId] as const,
      completedToday: [
        "doctor",
        "visits",
        "completed-today",
      ] as const,
      session: (
        visitId: number,
        latitude?: number,
        longitude?: number
      ) =>
        [
          "doctor",
          "visits",
          "session",
          visitId,
          latitude ?? null,
          longitude ?? null,
        ] as const,
    },
    workday: {
      today: ["doctor", "workday", "today"] as const,
      route: ["doctor", "workday", "route"] as const,
    },
    treatmentPlans: {
      all: ["doctor", "treatment-plans"] as const,
      detail: (planId: number) =>
        ["doctor", "treatment-plans", "detail", planId] as const,
      visits: ["doctor", "treatment-plans", "visits"] as const,
    },
    expenses: {
      all: ["doctor", "expenses"] as const,
      mine: ["doctor", "expenses", "mine"] as const,
      today: ["doctor", "expenses", "today"] as const,
    },
    claims: {
      all: ["doctor", "claims"] as const,
      mine: ["doctor", "claims", "mine"] as const,
      readiness: ["doctor", "claims", "readiness"] as const,
      detail: (claimId: number) =>
        ["doctor", "claims", "detail", claimId] as const,
    },
  },
  adminDoctorWorkflow: {
    consultations: ["admin", "doctor-workflow", "consultations"] as const,
    doctors: ["admin", "doctor-workflow", "doctors"] as const,
    claims: ["admin", "doctor-workflow", "claims"] as const,
    claimDetail: (claimId: number) =>
      ["admin", "doctor-workflow", "claims", "detail", claimId] as const,
    pendingClaims: ["admin", "doctor-workflow", "claims", "pending"] as const,
    treatmentPlans: ["admin", "doctor-workflow", "treatment-plans"] as const,
    therapists: ["admin", "doctor-workflow", "therapists"] as const,
  },
} as const;
