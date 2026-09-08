from datetime import date, datetime
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.models.doctor import Doctor
from app.models.doctor_workday import DoctorWorkDay
from app.models.therapist_workday import TherapistWorkDay
from app.models.user import User
from app.services.report_export_service import (
    ReportFormat,
    TabularReportSpec,
    build_tabular_report_response,
    period_label,
    serialize_rows,
)


ATTENDANCE_STATUSES = ("active", "completed", "ended_early")
ATTENDANCE_HEADERS = (
    "Staff role",
    "Staff name",
    "Workday ID",
    "Business date (Asia/Kolkata)",
    "Status",
    "Started at (UTC)",
    "Ended at (UTC)",
    "Worked minutes",
    "Ended early",
    "End reason",
    "Completed activities",
    "Pending activities",
    "Missed activities",
    "Distance (km)",
)
ATTENDANCE_REPORT_SPEC = TabularReportSpec(
    title="Attendance and workday register",
    filename_prefix="attendance-register",
    sheet_name="Attendance",
    headers=ATTENDANCE_HEADERS,
    pdf_columns=(0, 1, 3, 4, 5, 6, 7, 10, 11),
    pdf_widths_mm=(25, 43, 36, 25, 43, 43, 25, 30, 30),
)


def _status(workday: TherapistWorkDay | DoctorWorkDay) -> str:
    if workday.is_active:
        return "active"
    if workday.ended_early:
        return "ended_early"
    return "completed"


def get_attendance_export_rows(
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
    """Return privacy-safe workdays for the authorized staff scope."""
    rows: list[list[object]] = []
    if role in ("all", "therapist"):
        query = (
            db.query(TherapistWorkDay, User.username)
            .join(User, User.id == TherapistWorkDay.therapist_id)
        )
        if from_date is not None:
            query = query.filter(TherapistWorkDay.work_date >= from_date)
        if to_date is not None:
            query = query.filter(TherapistWorkDay.work_date <= to_date)
        if therapist_id is not None:
            query = query.filter(
                TherapistWorkDay.therapist_id == therapist_id
            )
        if status == "active":
            query = query.filter(TherapistWorkDay.is_active.is_(True))
        elif status == "completed":
            query = query.filter(
                TherapistWorkDay.is_active.is_(False),
                TherapistWorkDay.ended_early.is_(False),
            )
        elif status == "ended_early":
            query = query.filter(TherapistWorkDay.ended_early.is_(True))
        therapist_days = (
            query.order_by(
                TherapistWorkDay.work_date.desc(),
                TherapistWorkDay.id.desc(),
            )
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Therapist",
                staff_name,
                day.id,
                day.work_date,
                _status(day),
                day.started_at,
                day.ended_at,
                day.total_work_minutes,
                bool(day.ended_early),
                day.end_reason,
                day.completed_schedules_count,
                day.pending_schedules_count,
                day.missed_schedules_count,
                "",
            ]
            for day, staff_name in therapist_days
        )

    if role in ("all", "doctor"):
        query = (
            db.query(DoctorWorkDay, Doctor.name)
            .join(Doctor, Doctor.id == DoctorWorkDay.doctor_id)
        )
        if from_date is not None:
            query = query.filter(DoctorWorkDay.work_date >= from_date)
        if to_date is not None:
            query = query.filter(DoctorWorkDay.work_date <= to_date)
        if doctor_id is not None:
            query = query.filter(DoctorWorkDay.doctor_id == doctor_id)
        if status == "active":
            query = query.filter(DoctorWorkDay.is_active.is_(True))
        elif status == "completed":
            query = query.filter(
                DoctorWorkDay.is_active.is_(False),
                DoctorWorkDay.ended_early.is_(False),
            )
        elif status == "ended_early":
            query = query.filter(DoctorWorkDay.ended_early.is_(True))
        doctor_days = (
            query.order_by(
                DoctorWorkDay.work_date.desc(),
                DoctorWorkDay.id.desc(),
            )
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Doctor",
                staff_name,
                day.id,
                day.work_date,
                _status(day),
                day.started_at,
                day.ended_at,
                day.total_work_minutes,
                bool(day.ended_early),
                day.end_reason,
                day.completed_visits_count,
                day.pending_visits_count,
                "",
                round(float(day.total_distance_km or 0), 2),
            ]
            for day, staff_name in doctor_days
        )

    rows.sort(
        key=lambda row: (str(row[3]), str(row[0]), int(row[2])),
        reverse=True,
    )
    return rows


def summarize_attendance(rows: list[list[object]]) -> dict[str, int | float]:
    statuses = [str(row[4]) for row in rows]
    return {
        "active_days": statuses.count("active"),
        "completed_days": statuses.count("completed"),
        "early_end_days": statuses.count("ended_early"),
        "total_work_minutes": sum(int(row[7] or 0) for row in rows),
        "completed_activities": sum(int(row[10] or 0) for row in rows),
        "pending_activities": sum(int(row[11] or 0) for row in rows),
        "missed_activities": sum(int(row[12] or 0) for row in rows),
        "total_distance_km": round(
            sum(float(row[13] or 0) for row in rows),
            2,
        ),
    }


def serialize_attendance_rows(
    rows: list[list[object]],
) -> list[list[object]]:
    return serialize_rows(rows)


def build_attendance_export_response(
    rows: list[list[object]],
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    export_format: ReportFormat,
    snapshot: datetime,
    filename_prefix: str = "attendance-register",
    row_limit: int,
    pdf_row_limit: int,
) -> Response:
    summary = summarize_attendance(rows)
    metadata = [
        ("Snapshot (Asia/Kolkata)", snapshot.isoformat()),
        ("Period", period_label(from_date, to_date)),
        ("Staff role", role.title()),
        ("Workday status", status.replace("_", " ").title()),
        ("Row count", str(len(rows))),
        ("Worked minutes", str(summary["total_work_minutes"])),
        ("Completed activities", str(summary["completed_activities"])),
        ("Privacy", "Locations and patient-identifying data excluded"),
    ]
    spec = TabularReportSpec(
        title=ATTENDANCE_REPORT_SPEC.title,
        filename_prefix=filename_prefix,
        sheet_name=ATTENDANCE_REPORT_SPEC.sheet_name,
        headers=ATTENDANCE_REPORT_SPEC.headers,
        pdf_columns=ATTENDANCE_REPORT_SPEC.pdf_columns,
        pdf_widths_mm=ATTENDANCE_REPORT_SPEC.pdf_widths_mm,
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
