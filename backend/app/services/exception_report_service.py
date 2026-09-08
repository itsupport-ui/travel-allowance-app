from datetime import date, datetime

from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.therapist_workday import TherapistWorkDay
from app.models.travel import TravelEntry
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
from app.utils.timezone import india_now


EXCEPTION_STATUSES = (
    "open",
    "needs_review",
    "needs_correction",
    "missed",
    "manual",
)
EXCEPTION_HEADERS = (
    "Staff role",
    "Staff name",
    "Exception type",
    "Record ID",
    "Business date (Asia/Kolkata)",
    "Exception status",
    "Age (days)",
    "Evidence state",
    "Suggested action",
    "Linked record type",
    "Linked record ID",
    "Created at (UTC)",
)
EXCEPTION_REPORT_SPEC = TabularReportSpec(
    title="Operational exception register",
    filename_prefix="operational-exception-register",
    sheet_name="Exceptions",
    headers=EXCEPTION_HEADERS,
    pdf_columns=(0, 1, 2, 4, 5, 6, 7, 8),
    pdf_widths_mm=(24, 38, 38, 34, 30, 22, 36, 53),
)


def _within_period(
    query,
    column,
    from_date: date | None,
    to_date: date | None,
):
    if from_date is not None:
        query = query.filter(column >= from_date)
    if to_date is not None:
        query = query.filter(column <= to_date)
    return query


def _age_days(business_date: date | datetime | str | None) -> int:
    if business_date is None:
        return 0
    if isinstance(business_date, str):
        value = date.fromisoformat(business_date[:10])
    else:
        value = (
            business_date.date()
            if isinstance(business_date, datetime)
            else business_date
        )
    return max((india_now().date() - value).days, 0)


def _include(requested_status: str, row_status: str) -> bool:
    return requested_status == "all" or requested_status == row_status


def get_exception_rows(
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
    """Return operational exceptions without patient data or free-text reasons."""
    rows: list[list[object]] = []

    if role in ("all", "therapist"):
        if _include(status, "open"):
            query = (
                db.query(TherapistWorkDay, User.username)
                .join(User, User.id == TherapistWorkDay.therapist_id)
                .filter(TherapistWorkDay.is_active.is_(True))
            )
            query = _within_period(
                query,
                TherapistWorkDay.work_date,
                from_date,
                to_date,
            )
            if therapist_id is not None:
                query = query.filter(
                    TherapistWorkDay.therapist_id == therapist_id
                )
            for workday, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Therapist",
                    staff_name,
                    "Open workday",
                    workday.id,
                    workday.work_date,
                    "open",
                    _age_days(workday.work_date),
                    "Start recorded",
                    "Complete active work, then close the workday",
                    "Therapist workday",
                    workday.id,
                    workday.started_at,
                ])

        if _include(status, "needs_review"):
            query = (
                db.query(TherapistWorkDay, User.username)
                .join(User, User.id == TherapistWorkDay.therapist_id)
                .filter(TherapistWorkDay.ended_early.is_(True))
            )
            query = _within_period(
                query,
                TherapistWorkDay.work_date,
                from_date,
                to_date,
            )
            if therapist_id is not None:
                query = query.filter(
                    TherapistWorkDay.therapist_id == therapist_id
                )
            for workday, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Therapist",
                    staff_name,
                    "Early workday closure",
                    workday.id,
                    workday.work_date,
                    "needs_review",
                    _age_days(workday.work_date),
                    "Reason recorded" if workday.end_reason else "Reason missing",
                    "Review the early closure",
                    "Therapist workday",
                    workday.id,
                    workday.started_at,
                ])

        schedule_date = func.coalesce(
            TreatmentSchedule.occurrence_date,
            TreatmentSchedule.treatment_date,
            TreatmentSchedule.start_date,
        )
        if _include(status, "open"):
            query = (
                db.query(TreatmentSchedule, User.username, schedule_date)
                .join(User, User.id == TreatmentSchedule.therapist_id)
                .filter(TreatmentSchedule.session_status == "IN_PROGRESS")
            )
            query = _within_period(query, schedule_date, from_date, to_date)
            if therapist_id is not None:
                query = query.filter(
                    TreatmentSchedule.therapist_id == therapist_id
                )
            for schedule, staff_name, business_date in query.limit(
                row_limit + 1
            ).all():
                rows.append([
                    "Therapist",
                    staff_name,
                    "Active treatment session",
                    schedule.id,
                    business_date,
                    "open",
                    _age_days(business_date),
                    "Punch-in recorded",
                    "Complete or resolve the active session",
                    "Treatment schedule",
                    schedule.id,
                    schedule.created_at,
                ])

        if _include(status, "missed"):
            query = (
                db.query(TreatmentSchedule, User.username, schedule_date)
                .join(User, User.id == TreatmentSchedule.therapist_id)
                .filter(func.lower(TreatmentSchedule.status) == "missed")
            )
            query = _within_period(query, schedule_date, from_date, to_date)
            if therapist_id is not None:
                query = query.filter(
                    TreatmentSchedule.therapist_id == therapist_id
                )
            for schedule, staff_name, business_date in query.limit(
                row_limit + 1
            ).all():
                rows.append([
                    "Therapist",
                    staff_name,
                    "Missed treatment",
                    schedule.id,
                    business_date,
                    "missed",
                    _age_days(business_date),
                    "Reason recorded" if schedule.missed_reason else "Reason missing",
                    "Review and reschedule when appropriate",
                    "Treatment schedule",
                    schedule.id,
                    schedule.created_at,
                ])

        if _include(status, "needs_correction"):
            query = (
                db.query(Claim, User.username)
                .join(User, User.id == Claim.therapist_id)
                .filter(func.lower(Claim.status) == "rejected")
            )
            query = _within_period(query, Claim.claim_date, from_date, to_date)
            if therapist_id is not None:
                query = query.filter(Claim.therapist_id == therapist_id)
            for claim, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Therapist",
                    staff_name,
                    "Claim changes required",
                    claim.id,
                    claim.claim_date,
                    "needs_correction",
                    _age_days(claim.claim_date),
                    "Reason recorded" if claim.rejection_reason else "Reason missing",
                    "Correct and resubmit the claim",
                    "Therapist claim",
                    claim.id,
                    claim.submitted_at,
                ])

        if _include(status, "manual"):
            travel_date = func.date(TravelEntry.travel_date)
            query = (
                db.query(TravelEntry, User.username, travel_date)
                .join(User, User.id == TravelEntry.therapist_id)
                .filter(
                    TravelEntry.schedule_id.is_(None),
                    or_(
                        TravelEntry.manual_review_status.is_(None),
                        TravelEntry.manual_review_status.in_(
                            ["pending", "changes_requested"]
                        ),
                    ),
                )
            )
            query = _within_period(query, travel_date, from_date, to_date)
            if therapist_id is not None:
                query = query.filter(TravelEntry.therapist_id == therapist_id)
            for travel, staff_name, business_date in query.limit(
                row_limit + 1
            ).all():
                rows.append([
                    "Therapist",
                    staff_name,
                    "Manual travel entry",
                    travel.id,
                    business_date,
                    "manual",
                    _age_days(business_date),
                    "Proof attached" if travel.invoice_file else "No proof attached",
                    "Review manual travel evidence",
                    "Therapist claim" if travel.claim_id else "",
                    travel.claim_id or "",
                    travel.created_at,
                ])

    if role in ("all", "doctor"):
        if _include(status, "open"):
            query = (
                db.query(DoctorWorkDay, Doctor.name)
                .join(Doctor, Doctor.id == DoctorWorkDay.doctor_id)
                .filter(DoctorWorkDay.is_active.is_(True))
            )
            query = _within_period(
                query,
                DoctorWorkDay.work_date,
                from_date,
                to_date,
            )
            if doctor_id is not None:
                query = query.filter(DoctorWorkDay.doctor_id == doctor_id)
            for workday, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Doctor",
                    staff_name,
                    "Open workday",
                    workday.id,
                    workday.work_date,
                    "open",
                    _age_days(workday.work_date),
                    "Start recorded",
                    "Complete active work, then close the workday",
                    "Doctor workday",
                    workday.id,
                    workday.started_at,
                ])

        if _include(status, "needs_review"):
            query = (
                db.query(DoctorWorkDay, Doctor.name)
                .join(Doctor, Doctor.id == DoctorWorkDay.doctor_id)
                .filter(DoctorWorkDay.ended_early.is_(True))
            )
            query = _within_period(
                query,
                DoctorWorkDay.work_date,
                from_date,
                to_date,
            )
            if doctor_id is not None:
                query = query.filter(DoctorWorkDay.doctor_id == doctor_id)
            for workday, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Doctor",
                    staff_name,
                    "Early workday closure",
                    workday.id,
                    workday.work_date,
                    "needs_review",
                    _age_days(workday.work_date),
                    "Reason recorded" if workday.end_reason else "Reason missing",
                    "Review the early closure",
                    "Doctor workday",
                    workday.id,
                    workday.started_at,
                ])

        if _include(status, "open"):
            query = (
                db.query(DoctorVisit, Doctor.name)
                .join(Doctor, Doctor.id == DoctorVisit.doctor_id)
                .filter(DoctorVisit.session_status == "IN_PROGRESS")
            )
            query = _within_period(
                query,
                DoctorVisit.visit_date,
                from_date,
                to_date,
            )
            if doctor_id is not None:
                query = query.filter(DoctorVisit.doctor_id == doctor_id)
            for visit, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Doctor",
                    staff_name,
                    "Active doctor visit",
                    visit.id,
                    visit.visit_date,
                    "open",
                    _age_days(visit.visit_date),
                    "Punch-in recorded",
                    "Complete or resolve the active visit",
                    "Doctor visit",
                    visit.id,
                    visit.created_at,
                ])

        if _include(status, "needs_correction"):
            plan_query = (
                db.query(TreatmentPlan, Doctor.name, DoctorVisit.visit_date)
                .join(Doctor, Doctor.id == TreatmentPlan.doctor_id)
                .join(DoctorVisit, DoctorVisit.id == TreatmentPlan.doctor_visit_id)
                .filter(TreatmentPlan.status == "rejected")
            )
            plan_query = _within_period(
                plan_query,
                DoctorVisit.visit_date,
                from_date,
                to_date,
            )
            if doctor_id is not None:
                plan_query = plan_query.filter(
                    TreatmentPlan.doctor_id == doctor_id
                )
            for plan, staff_name, business_date in plan_query.limit(
                row_limit + 1
            ).all():
                rows.append([
                    "Doctor",
                    staff_name,
                    "Treatment plan changes required",
                    plan.id,
                    business_date,
                    "needs_correction",
                    _age_days(business_date),
                    "Reason recorded" if plan.rejection_reason else "Reason missing",
                    "Correct and resubmit the treatment plan",
                    "Doctor visit",
                    plan.doctor_visit_id,
                    plan.created_at,
                ])

            claim_query = (
                db.query(DoctorClaim, Doctor.name)
                .join(Doctor, Doctor.id == DoctorClaim.doctor_id)
                .filter(func.lower(DoctorClaim.status) == "rejected")
            )
            claim_query = _within_period(
                claim_query,
                DoctorClaim.claim_date,
                from_date,
                to_date,
            )
            if doctor_id is not None:
                claim_query = claim_query.filter(
                    DoctorClaim.doctor_id == doctor_id
                )
            for claim, staff_name in claim_query.limit(row_limit + 1).all():
                rows.append([
                    "Doctor",
                    staff_name,
                    "Claim changes required",
                    claim.id,
                    claim.claim_date,
                    "needs_correction",
                    _age_days(claim.claim_date),
                    "Reason recorded" if claim.rejection_reason else "Reason missing",
                    "Correct and resubmit the claim",
                    "Doctor claim",
                    claim.id,
                    claim.created_at,
                ])

        if _include(status, "manual"):
            query = (
                db.query(DoctorExpense, Doctor.name)
                .join(Doctor, Doctor.id == DoctorExpense.doctor_id)
                .filter(
                    DoctorExpense.visit_id.is_(None),
                    or_(
                        DoctorExpense.manual_review_status.in_(
                            ["pending", "changes_requested"]
                        ),
                        DoctorExpense.manual_review_status.is_(None),
                    ),
                )
            )
            query = _within_period(
                query,
                DoctorExpense.expense_date,
                from_date,
                to_date,
            )
            if doctor_id is not None:
                query = query.filter(DoctorExpense.doctor_id == doctor_id)
            for expense, staff_name in query.limit(row_limit + 1).all():
                rows.append([
                    "Doctor",
                    staff_name,
                    "Manual expense entry",
                    expense.id,
                    expense.expense_date,
                    expense.manual_review_status or "manual",
                    _age_days(expense.expense_date),
                    "Proof attached" if expense.proof_file else "No proof attached",
                    (
                        "Doctor must correct and resubmit"
                        if expense.manual_review_status == "changes_requested"
                        else "Review manual expense evidence"
                    ),
                    "Doctor claim" if expense.claim_id else "",
                    expense.claim_id or "",
                    expense.created_at,
                ])

    rows.sort(
        key=lambda row: (str(row[4]), int(row[6]), str(row[0]), int(row[3])),
        reverse=True,
    )
    return rows


def summarize_exceptions(rows: list[list[object]]) -> dict[str, int | float]:
    statuses = [str(row[5]).lower() for row in rows]
    return {
        "open_exceptions": statuses.count("open"),
        "needs_review_exceptions": statuses.count("needs_review"),
        "needs_correction_exceptions": statuses.count("needs_correction"),
        "missed_exceptions": statuses.count("missed"),
        "manual_exceptions": sum(
            value in {"manual", "pending", "changes_requested"}
            for value in statuses
        ),
        "overdue_exceptions": sum(int(row[6] or 0) > 0 for row in rows),
    }


def serialize_exception_rows(rows: list[list[object]]) -> list[list[object]]:
    return serialize_rows(rows)


def build_exception_export_response(
    rows: list[list[object]],
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    export_format: ReportFormat,
    snapshot: datetime,
    filename_prefix: str = "operational-exception-register",
    row_limit: int,
    pdf_row_limit: int,
) -> Response:
    summary = summarize_exceptions(rows)
    metadata = [
        ("Snapshot (Asia/Kolkata)", snapshot.isoformat()),
        ("Period", period_label(from_date, to_date)),
        ("Staff role", role.title()),
        ("Exception status", status.replace("_", " ").title()),
        ("Row count", str(len(rows))),
        ("Open", str(summary["open_exceptions"])),
        ("Needs correction", str(summary["needs_correction_exceptions"])),
        (
            "Privacy",
            "Patients, locations, clinical text, and free-text reasons excluded",
        ),
    ]
    spec = TabularReportSpec(
        title=EXCEPTION_REPORT_SPEC.title,
        filename_prefix=filename_prefix,
        sheet_name=EXCEPTION_REPORT_SPEC.sheet_name,
        headers=EXCEPTION_REPORT_SPEC.headers,
        pdf_columns=EXCEPTION_REPORT_SPEC.pdf_columns,
        pdf_widths_mm=EXCEPTION_REPORT_SPEC.pdf_widths_mm,
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
