from datetime import date, datetime

from fastapi.responses import Response
from sqlalchemy import case, func, literal
from sqlalchemy.orm import Session

from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.therapist_workday import TherapistWorkDay
from app.models.travel import TravelEntry
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.services.reimbursement_policy_service import decimal_value, money
from app.services.report_export_service import (
    ReportFormat,
    TabularReportSpec,
    build_tabular_report_response,
    period_label,
    serialize_rows,
)


PERFORMANCE_HEADERS = (
    "Staff role",
    "Staff name",
    "Staff ID",
    "Workdays",
    "Worked minutes",
    "Early-ended workdays",
    "Treatment sessions",
    "Consultations",
    "Doctor visits",
    "Approved treatment plans",
    "Completed clinical activities",
    "Missed activities",
    "Distance (km)",
    "Reimbursable amount (INR)",
    "Claims submitted",
    "Claim amount (INR)",
)
PERFORMANCE_REPORT_SPEC = TabularReportSpec(
    title="Staff operational performance summary",
    filename_prefix="staff-performance-summary",
    sheet_name="Performance",
    headers=PERFORMANCE_HEADERS,
    pdf_columns=(0, 1, 3, 4, 10, 11, 12, 13, 14, 15),
    pdf_widths_mm=(22, 38, 22, 28, 31, 25, 25, 34, 25, 34),
    currency_columns=(14, 16),
)


def _date_bounds(query, expression, from_date: date | None, to_date: date | None):
    if from_date is not None:
        query = query.filter(expression >= from_date)
    if to_date is not None:
        query = query.filter(expression <= to_date)
    return query


def _map(rows) -> dict[int, tuple]:
    return {int(row[0]): tuple(row[1:]) for row in rows}


def get_performance_rows(
    db: Session,
    *,
    from_date: date | None,
    to_date: date | None,
    role: str,
    therapist_id: int | None = None,
    doctor_id: int | None = None,
    row_limit: int,
) -> list[list[object]]:
    rows: list[list[object]] = []
    if role in {"all", "therapist"}:
        staff_query = db.query(User.id, User.username).filter(User.role == "therapist")
        if therapist_id is not None:
            staff_query = staff_query.filter(User.id == therapist_id)
        staff = staff_query.order_by(User.username, User.id).all()

        attendance = _date_bounds(
            db.query(
                TherapistWorkDay.therapist_id,
                func.count(TherapistWorkDay.id),
                func.coalesce(func.sum(TherapistWorkDay.total_work_minutes), 0),
                func.coalesce(func.sum(case((TherapistWorkDay.ended_early.is_(True), 1), else_=0)), 0),
            ).group_by(TherapistWorkDay.therapist_id),
            TherapistWorkDay.work_date,
            from_date,
            to_date,
        )
        clinical_date = func.coalesce(
            TreatmentSchedule.occurrence_date,
            TreatmentSchedule.treatment_date,
            TreatmentSchedule.start_date,
        )
        clinical = _date_bounds(
            db.query(
                TreatmentSchedule.therapist_id,
                func.count(TreatmentSchedule.id),
                func.coalesce(func.sum(case((func.lower(TreatmentSchedule.status) == "completed", 1), else_=0)), 0),
                func.coalesce(func.sum(case((func.lower(TreatmentSchedule.status) == "missed", 1), else_=0)), 0),
            ).group_by(TreatmentSchedule.therapist_id),
            clinical_date,
            from_date,
            to_date,
        )
        travel = _date_bounds(
            db.query(
                TravelEntry.therapist_id,
                func.coalesce(func.sum(TravelEntry.total_km), 0),
                func.coalesce(func.sum(TravelEntry.travel_fare), 0),
            ).group_by(TravelEntry.therapist_id),
            func.date(TravelEntry.travel_date),
            from_date,
            to_date,
        )
        claims = _date_bounds(
            db.query(
                Claim.therapist_id,
                func.count(Claim.id),
                func.coalesce(func.sum(Claim.grand_total), 0),
            ).group_by(Claim.therapist_id),
            Claim.claim_date,
            from_date,
            to_date,
        )
        attendance_map = _map(attendance.all())
        clinical_map = _map(clinical.all())
        travel_map = _map(travel.all())
        claim_map = _map(claims.all())
        for staff_id, staff_name in staff:
            workdays, minutes, early = attendance_map.get(staff_id, (0, 0, 0))
            sessions, completed, missed = clinical_map.get(staff_id, (0, 0, 0))
            distance, reimbursement = travel_map.get(staff_id, (0, 0))
            claim_count, claim_amount = claim_map.get(staff_id, (0, 0))
            metrics = (workdays, sessions, distance, reimbursement, claim_count)
            if any(decimal_value(value) for value in metrics):
                rows.append([
                    "Therapist", staff_name, staff_id, workdays, minutes, early,
                    sessions, 0, 0, 0, completed, missed,
                    round(float(distance or 0), 2), float(money(reimbursement)),
                    claim_count, float(money(claim_amount)),
                ])

    if role in {"all", "doctor"}:
        staff_query = db.query(Doctor.id, Doctor.name)
        if doctor_id is not None:
            staff_query = staff_query.filter(Doctor.id == doctor_id)
        staff = staff_query.order_by(Doctor.name, Doctor.id).all()
        attendance = _date_bounds(
            db.query(
                DoctorWorkDay.doctor_id,
                func.count(DoctorWorkDay.id),
                func.coalesce(func.sum(DoctorWorkDay.total_work_minutes), 0),
                func.coalesce(func.sum(case((DoctorWorkDay.ended_early.is_(True), 1), else_=0)), 0),
            ).group_by(DoctorWorkDay.doctor_id),
            DoctorWorkDay.work_date,
            from_date,
            to_date,
        )
        consultations = _date_bounds(
            db.query(
                DoctorConsultation.doctor_id,
                func.count(DoctorConsultation.id),
                func.coalesce(func.sum(case((DoctorConsultation.status == "completed", 1), else_=0)), 0),
            ).group_by(DoctorConsultation.doctor_id),
            DoctorConsultation.scheduled_date,
            from_date,
            to_date,
        )
        visits = _date_bounds(
            db.query(
                DoctorVisit.doctor_id,
                func.count(DoctorVisit.id),
                func.coalesce(func.sum(case((DoctorVisit.status.in_(("visited", "treatment_plan_submitted")), 1), else_=0)), 0),
                literal(0),
            ).group_by(DoctorVisit.doctor_id),
            DoctorVisit.visit_date,
            from_date,
            to_date,
        )
        plan_query = (
            db.query(
                TreatmentPlan.doctor_id,
                func.coalesce(func.sum(case((TreatmentPlan.status == "approved", 1), else_=0)), 0),
            )
            .join(DoctorVisit, DoctorVisit.id == TreatmentPlan.doctor_visit_id)
            .group_by(TreatmentPlan.doctor_id)
        )
        plan_query = _date_bounds(plan_query, DoctorVisit.visit_date, from_date, to_date)
        expenses = _date_bounds(
            db.query(
                DoctorExpense.doctor_id,
                func.coalesce(func.sum(DoctorExpense.distance_km), 0),
                func.coalesce(func.sum(func.coalesce(DoctorExpense.approved_amount, DoctorExpense.fare)), 0),
            ).group_by(DoctorExpense.doctor_id),
            DoctorExpense.expense_date,
            from_date,
            to_date,
        )
        claims = _date_bounds(
            db.query(
                DoctorClaim.doctor_id,
                func.count(DoctorClaim.id),
                func.coalesce(func.sum(DoctorClaim.total_amount), 0),
            ).group_by(DoctorClaim.doctor_id),
            DoctorClaim.claim_date,
            from_date,
            to_date,
        )
        attendance_map = _map(attendance.all())
        consultation_map = _map(consultations.all())
        visit_map = _map(visits.all())
        plan_map = _map(plan_query.all())
        expense_map = _map(expenses.all())
        claim_map = _map(claims.all())
        for staff_id, staff_name in staff:
            workdays, minutes, early = attendance_map.get(staff_id, (0, 0, 0))
            consultation_count, completed_consultations = consultation_map.get(staff_id, (0, 0))
            visit_count, completed_visits, missed = visit_map.get(staff_id, (0, 0, 0))
            approved_plans = plan_map.get(staff_id, (0,))[0]
            distance, reimbursement = expense_map.get(staff_id, (0, 0))
            claim_count, claim_amount = claim_map.get(staff_id, (0, 0))
            metrics = (workdays, consultation_count, visit_count, approved_plans, reimbursement, claim_count)
            if any(decimal_value(value) for value in metrics):
                rows.append([
                    "Doctor", staff_name, staff_id, workdays, minutes, early, 0,
                    consultation_count, visit_count, approved_plans,
                    int(completed_consultations or 0) + int(completed_visits or 0),
                    missed, round(float(distance or 0), 2),
                    float(money(reimbursement)), claim_count, float(money(claim_amount)),
                ])

    rows.sort(key=lambda row: (str(row[0]), str(row[1]), int(row[2])))
    return rows[: row_limit + 1]


def summarize_performance(rows: list[list[object]]) -> dict[str, int | float]:
    return {
        "staff_count": len(rows),
        "therapist_count": sum(row[0] == "Therapist" for row in rows),
        "doctor_count": sum(row[0] == "Doctor" for row in rows),
        "total_workdays": sum(int(row[3] or 0) for row in rows),
        "total_work_minutes": sum(int(row[4] or 0) for row in rows),
        "completed_clinical_activities": sum(int(row[10] or 0) for row in rows),
        "missed_activities": sum(int(row[11] or 0) for row in rows),
        "total_distance_km": round(sum(float(row[12] or 0) for row in rows), 2),
        "total_reimbursable_amount": float(money(sum(decimal_value(row[13]) for row in rows))),
        "claims_submitted": sum(int(row[14] or 0) for row in rows),
        "total_claim_amount": float(money(sum(decimal_value(row[15]) for row in rows))),
    }


def serialize_performance_rows(rows: list[list[object]]) -> list[list[object]]:
    return serialize_rows(rows)


def build_performance_export_response(
    rows: list[list[object]],
    *,
    from_date: date | None,
    to_date: date | None,
    role: str,
    export_format: ReportFormat,
    snapshot: datetime,
    filename_prefix: str = "staff-performance-summary",
    row_limit: int,
    pdf_row_limit: int,
) -> Response:
    summary = summarize_performance(rows)
    metadata = [
        ("Snapshot (Asia/Kolkata)", snapshot.isoformat()),
        ("Period", period_label(from_date, to_date)),
        ("Staff role", role.title()),
        ("Staff with activity", str(summary["staff_count"])),
        ("Workdays", str(summary["total_workdays"])),
        ("Completed clinical activities", str(summary["completed_clinical_activities"])),
        ("Privacy", "Patients, locations, notes, and proof files excluded"),
        ("Interpretation", "Objective activity totals only; no ranking or productivity score"),
    ]
    spec = TabularReportSpec(
        title=PERFORMANCE_REPORT_SPEC.title,
        filename_prefix=filename_prefix,
        sheet_name=PERFORMANCE_REPORT_SPEC.sheet_name,
        headers=PERFORMANCE_REPORT_SPEC.headers,
        pdf_columns=PERFORMANCE_REPORT_SPEC.pdf_columns,
        pdf_widths_mm=PERFORMANCE_REPORT_SPEC.pdf_widths_mm,
        currency_columns=PERFORMANCE_REPORT_SPEC.currency_columns,
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
