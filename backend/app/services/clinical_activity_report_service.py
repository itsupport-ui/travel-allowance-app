from datetime import date, datetime

from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.doctor import Doctor
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_visit import DoctorVisit
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.services.report_export_service import (
    ReportFormat,
    TabularReportSpec,
    build_tabular_report_response,
    period_label,
    serialize_rows,
)


CLINICAL_ACTIVITY_STATUSES = (
    "scheduled",
    "in_progress",
    "completed",
    "missed",
    "cancelled",
    "pending",
    "submitted",
    "approved",
    "rejected",
)
CLINICAL_ACTIVITY_HEADERS = (
    "Staff role",
    "Staff name",
    "Activity type",
    "Activity ID",
    "Business date (Asia/Kolkata)",
    "Status",
    "Scheduled time",
    "Duration (minutes)",
    "Outcome",
    "Linked record ID",
    "Evidence state",
    "Created at (UTC)",
)
CLINICAL_ACTIVITY_SPEC = TabularReportSpec(
    title="Clinical activity register",
    filename_prefix="clinical-activity-register",
    sheet_name="Clinical activity",
    headers=CLINICAL_ACTIVITY_HEADERS,
    pdf_columns=(0, 1, 2, 4, 5, 6, 7, 8),
    pdf_widths_mm=(24, 39, 35, 34, 27, 29, 28, 42),
)


def _schedule_status(schedule: TreatmentSchedule) -> str:
    if str(schedule.session_status).upper() == "IN_PROGRESS":
        return "in_progress"
    return str(schedule.status).lower()


def _visit_status(visit: DoctorVisit) -> str:
    if str(visit.session_status).upper() == "IN_PROGRESS":
        return "in_progress"
    if str(visit.status).lower() in {"visited", "treatment_plan_submitted"}:
        return "completed"
    return str(visit.status).lower()


def _apply_schedule_status(query, status: str):
    if status == "in_progress":
        return query.filter(TreatmentSchedule.session_status == "IN_PROGRESS")
    if status in {"scheduled", "completed", "missed", "cancelled"}:
        return query.filter(
            func.lower(TreatmentSchedule.status) == status,
            TreatmentSchedule.session_status != "IN_PROGRESS",
        )
    return query.filter(False)


def _apply_visit_status(query, status: str):
    if status == "in_progress":
        return query.filter(DoctorVisit.session_status == "IN_PROGRESS")
    if status == "completed":
        return query.filter(
            DoctorVisit.status.in_(["visited", "treatment_plan_submitted"]),
            DoctorVisit.session_status != "IN_PROGRESS",
        )
    if status in {"scheduled", "cancelled"}:
        return query.filter(
            DoctorVisit.status == status,
            DoctorVisit.session_status != "IN_PROGRESS",
        )
    return query.filter(False)


def get_clinical_activity_rows(
    db: Session,
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    therapist_id: int | None = None,
    doctor_id: int | None = None,
    row_limit: int,
) -> list[list[object]]:
    """Return activity metadata without patients, locations, or clinical text."""
    rows: list[list[object]] = []

    if role in ("all", "therapist"):
        schedule_date = func.coalesce(
            TreatmentSchedule.occurrence_date,
            TreatmentSchedule.treatment_date,
            TreatmentSchedule.start_date,
        )
        query = (
            db.query(TreatmentSchedule, User.username, schedule_date)
            .join(User, User.id == TreatmentSchedule.therapist_id)
        )
        if from_date is not None:
            query = query.filter(schedule_date >= from_date)
        if to_date is not None:
            query = query.filter(schedule_date <= to_date)
        if therapist_id is not None:
            query = query.filter(TreatmentSchedule.therapist_id == therapist_id)
        if status != "all":
            query = _apply_schedule_status(query, status)
        schedules = (
            query.order_by(schedule_date.desc(), TreatmentSchedule.id.desc())
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Therapist",
                staff_name,
                "Treatment session",
                schedule.id,
                business_date,
                _schedule_status(schedule),
                schedule.in_time,
                schedule.treatment_duration or "",
                schedule.visit_type,
                schedule.treatment_plan_id or "",
                schedule.session_status,
                schedule.created_at,
            ]
            for schedule, staff_name, business_date in schedules
        )

    if role in ("all", "doctor"):
        consultation_query = (
            db.query(DoctorConsultation, Doctor.name)
            .join(Doctor, Doctor.id == DoctorConsultation.doctor_id)
        )
        if from_date is not None:
            consultation_query = consultation_query.filter(
                DoctorConsultation.scheduled_date >= from_date
            )
        if to_date is not None:
            consultation_query = consultation_query.filter(
                DoctorConsultation.scheduled_date <= to_date
            )
        if doctor_id is not None:
            consultation_query = consultation_query.filter(
                DoctorConsultation.doctor_id == doctor_id
            )
        if status != "all":
            if status in {"scheduled", "completed", "cancelled"}:
                consultation_query = consultation_query.filter(
                    DoctorConsultation.status == status
                )
            else:
                consultation_query = consultation_query.filter(False)
        consultations = (
            consultation_query.order_by(
                DoctorConsultation.scheduled_date.desc(),
                DoctorConsultation.id.desc(),
            )
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Doctor",
                staff_name,
                "Consultation",
                consultation.id,
                consultation.scheduled_date,
                str(consultation.status).lower(),
                consultation.scheduled_time,
                "",
                consultation.patient_decision,
                consultation.doctor_visit_id or "",
                "Visit created" if consultation.doctor_visit_id else "No visit",
                consultation.created_at,
            ]
            for consultation, staff_name in consultations
        )

        visit_query = (
            db.query(DoctorVisit, Doctor.name)
            .join(Doctor, Doctor.id == DoctorVisit.doctor_id)
        )
        if from_date is not None:
            visit_query = visit_query.filter(DoctorVisit.visit_date >= from_date)
        if to_date is not None:
            visit_query = visit_query.filter(DoctorVisit.visit_date <= to_date)
        if doctor_id is not None:
            visit_query = visit_query.filter(DoctorVisit.doctor_id == doctor_id)
        if status != "all":
            visit_query = _apply_visit_status(visit_query, status)
        visits = (
            visit_query.order_by(
                DoctorVisit.visit_date.desc(),
                DoctorVisit.id.desc(),
            )
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Doctor",
                staff_name,
                "Doctor visit",
                visit.id,
                visit.visit_date,
                _visit_status(visit),
                visit.visit_time,
                visit.treatment_duration or "",
                str(visit.status).lower(),
                visit.consultation_id or "",
                visit.session_status,
                visit.created_at,
            ]
            for visit, staff_name in visits
        )

        plan_query = (
            db.query(TreatmentPlan, Doctor.name, DoctorVisit.visit_date)
            .join(Doctor, Doctor.id == TreatmentPlan.doctor_id)
            .join(DoctorVisit, DoctorVisit.id == TreatmentPlan.doctor_visit_id)
        )
        if from_date is not None:
            plan_query = plan_query.filter(DoctorVisit.visit_date >= from_date)
        if to_date is not None:
            plan_query = plan_query.filter(DoctorVisit.visit_date <= to_date)
        if doctor_id is not None:
            plan_query = plan_query.filter(TreatmentPlan.doctor_id == doctor_id)
        if status != "all":
            if status in {"pending", "submitted", "approved", "rejected"}:
                plan_query = plan_query.filter(TreatmentPlan.status == status)
            else:
                plan_query = plan_query.filter(False)
        plans = (
            plan_query.order_by(
                DoctorVisit.visit_date.desc(),
                TreatmentPlan.id.desc(),
            )
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Doctor",
                staff_name,
                "Treatment plan",
                plan.id,
                visit_date,
                str(plan.status).lower(),
                "",
                "",
                f"Revision {plan.revision}",
                plan.doctor_visit_id,
                "Reviewed" if plan.reviewed_at else "Awaiting review",
                plan.created_at,
            ]
            for plan, staff_name, visit_date in plans
        )

    rows.sort(
        key=lambda row: (str(row[4]), str(row[0]), str(row[2]), int(row[3])),
        reverse=True,
    )
    return rows


def summarize_clinical_activity(
    rows: list[list[object]],
) -> dict[str, int | float]:
    activity_types = [str(row[2]) for row in rows]
    statuses = [str(row[5]).lower() for row in rows]
    return {
        "consultations": activity_types.count("Consultation"),
        "doctor_visits": activity_types.count("Doctor visit"),
        "treatment_plans": activity_types.count("Treatment plan"),
        "treatment_sessions": activity_types.count("Treatment session"),
        "completed_activities": statuses.count("completed"),
        "in_progress_activities": statuses.count("in_progress"),
        "missed_activities": statuses.count("missed"),
        "cancelled_activities": statuses.count("cancelled"),
        "total_clinical_minutes": sum(
            int(row[7] or 0) for row in rows if str(row[7] or "").isdigit()
        ),
    }


def serialize_clinical_activity_rows(
    rows: list[list[object]],
) -> list[list[object]]:
    return serialize_rows(rows)


def build_clinical_activity_response(
    rows: list[list[object]],
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    export_format: ReportFormat,
    snapshot: datetime,
    filename_prefix: str = "clinical-activity-register",
    row_limit: int,
    pdf_row_limit: int,
) -> Response:
    summary = summarize_clinical_activity(rows)
    metadata = [
        ("Snapshot (Asia/Kolkata)", snapshot.isoformat()),
        ("Period", period_label(from_date, to_date)),
        ("Staff role", role.title()),
        ("Activity status", status.replace("_", " ").title()),
        ("Row count", str(len(rows))),
        ("Completed activities", str(summary["completed_activities"])),
        ("Clinical minutes", str(summary["total_clinical_minutes"])),
        (
            "Privacy",
            "Patients, diagnoses, notes, phone numbers, and locations excluded",
        ),
    ]
    spec = TabularReportSpec(
        title=CLINICAL_ACTIVITY_SPEC.title,
        filename_prefix=filename_prefix,
        sheet_name=CLINICAL_ACTIVITY_SPEC.sheet_name,
        headers=CLINICAL_ACTIVITY_SPEC.headers,
        pdf_columns=CLINICAL_ACTIVITY_SPEC.pdf_columns,
        pdf_widths_mm=CLINICAL_ACTIVITY_SPEC.pdf_widths_mm,
    )
    return build_tabular_report_response(
        rows,
        metadata=metadata,
        export_format=export_format,
        snapshot=snapshot,
        spec=spec,
        row_limit=row_limit,
        pdf_row_limit=pdf_row_limit,
    )
