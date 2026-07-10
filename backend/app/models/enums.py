from sqlalchemy.dialects import postgresql


VISIT_STATUS = postgresql.ENUM(
    "scheduled",
    "visited",
    "treatment_plan_submitted",
    "cancelled",
    name="visit_status",
)

DOCTOR_CONSULTATION_PATIENT_DECISION = postgresql.ENUM(
    "pending",
    "confirmed",
    "rejected",
    "follow_up",
    name="doctor_consultation_patient_decision",
)

DOCTOR_CONSULTATION_STATUS = postgresql.ENUM(
    "scheduled",
    "completed",
    "cancelled",
    name="doctor_consultation_status",
)

TREATMENT_PLAN_STATUS = postgresql.ENUM(
    "pending",
    "submitted",
    "approved",
    "rejected",
    name="treatment_plan_status",
)
