from __future__ import annotations

from datetime import date, datetime, time, timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.models.doctor import Doctor
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.schemas.admin_schedule import (
    AdminScheduleFormOptions,
    AdminScheduleReviewResponse,
    TherapistAvailabilityResponse,
)
from app.schemas.treatment_schedule import TreatmentScheduleResponse
from app.services.schedule_conflict_service import find_schedule_conflicts
from app.utils.auth import require_role
from app.utils.workflow_transitions import (
    TREATMENT_SCHEDULE_STATUS_TRANSITIONS,
    validate_status_transition,
)

router = APIRouter(prefix="/admin-schedules", tags=["Admin Schedules"])

VIEWS = {"today", "upcoming", "in_progress", "completed", "cancelled"}
SORTS = {"time", "newest", "priority", "patient", "therapist"}


def _date_range_columns(schedule):
    start = case(
        (
            schedule.schedule_type == "one_time",
            schedule.treatment_date,
        ),
        else_=schedule.start_date,
    )
    end = case(
        (
            schedule.schedule_type == "one_time",
            schedule.treatment_date,
        ),
        else_=schedule.end_date,
    )
    return start, end


def _occurs_on(schedule, target: date):
    start, end = _date_range_columns(schedule)
    return (start <= target) & (end >= target)


def _occurs_between(schedule, start_date: date, end_date: date):
    start, end = _date_range_columns(schedule)
    return (start <= end_date) & (end >= start_date)


def _conflict_ids(db: Session) -> set[int]:
    left = aliased(TreatmentSchedule)
    right = aliased(TreatmentSchedule)
    left_start, left_end = _date_range_columns(left)
    right_start, right_end = _date_range_columns(right)

    pairs = (
        db.query(left.id, right.id)
        .join(
            right,
            (left.id < right.id)
            & (left.therapist_id == right.therapist_id)
            & (right.status == "scheduled")
            & (left_start <= right_end)
            & (left_end >= right_start)
            & (left.in_time < right.out_time)
            & (left.out_time > right.in_time),
        )
        .filter(left.status == "scheduled")
        .all()
    )
    return {schedule_id for pair in pairs for schedule_id in pair}


def _duration_minutes(start: time, end: time) -> int:
    return max(
        0,
        (end.hour * 60 + end.minute)
        - (start.hour * 60 + start.minute),
    )


def _occurrence_date(
    schedule: TreatmentSchedule,
    *,
    view: str,
    today: date,
) -> date | None:
    if schedule.schedule_type == "one_time":
        return schedule.treatment_date
    if view in {"today", "in_progress"}:
        return today
    if view == "upcoming":
        return max(schedule.start_date, today + timedelta(days=1))
    return schedule.start_date


@router.get("/review", response_model=AdminScheduleReviewResponse)
def review_schedules(
    view: str = Query(default="today"),
    search: str | None = Query(default=None, max_length=100),
    therapist_id: int | None = Query(default=None, ge=1),
    doctor_id: int | None = Query(default=None, ge=1),
    priority: str | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    sort: str = Query(default="time"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(["admin"])),
):
    if view not in VIEWS:
        raise HTTPException(status_code=400, detail="Invalid schedule view.")
    if sort not in SORTS:
        raise HTTPException(status_code=400, detail="Invalid schedule sort.")
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=400,
            detail="From date cannot be after to date.",
        )

    today = date.today()
    now_time = datetime.now().time()
    tomorrow = today + timedelta(days=1)
    today_condition = _occurs_on(TreatmentSchedule, today)
    upcoming_condition = (
        (TreatmentSchedule.status == "scheduled")
        & (
            (
                (TreatmentSchedule.schedule_type == "one_time")
                & (TreatmentSchedule.treatment_date >= tomorrow)
            )
            | (
                (TreatmentSchedule.schedule_type == "recurring")
                & (TreatmentSchedule.end_date >= tomorrow)
            )
        )
    )
    in_progress_condition = (
        (TreatmentSchedule.status == "scheduled")
        & today_condition
        & (TreatmentSchedule.in_time <= now_time)
        & (TreatmentSchedule.out_time >= now_time)
    )

    view_conditions = {
        "today": today_condition,
        "upcoming": upcoming_condition,
        "in_progress": in_progress_condition,
        "completed": TreatmentSchedule.status == "completed",
        "cancelled": func.lower(TreatmentSchedule.status).in_(
            ["cancelled", "canceled"]
        ),
    }
    conditions = [view_conditions[view]]

    normalized_search = (search or "").strip()
    if normalized_search:
        pattern = f"%{normalized_search}%"
        conditions.append(
            or_(
                TreatmentSchedule.patient_name.ilike(pattern),
                TreatmentSchedule.patient_reference_id.ilike(pattern),
                TreatmentSchedule.treatment_name.ilike(pattern),
                TreatmentSchedule.patient_address.ilike(pattern),
                User.username.ilike(pattern),
                Doctor.name.ilike(pattern),
            )
        )
    if therapist_id is not None:
        conditions.append(TreatmentSchedule.therapist_id == therapist_id)
    if doctor_id is not None:
        conditions.append(TreatmentSchedule.doctor_id == doctor_id)
    if priority in {"normal", "high"}:
        conditions.append(TreatmentSchedule.priority == priority)
    if from_date and to_date:
        conditions.append(
            _occurs_between(TreatmentSchedule, from_date, to_date)
        )
    elif from_date:
        _, schedule_end = _date_range_columns(TreatmentSchedule)
        conditions.append(schedule_end >= from_date)
    elif to_date:
        schedule_start, _ = _date_range_columns(TreatmentSchedule)
        conditions.append(schedule_start <= to_date)

    query = (
        db.query(TreatmentSchedule, Doctor.name, User.username)
        .join(Doctor, Doctor.id == TreatmentSchedule.doctor_id)
        .join(User, User.id == TreatmentSchedule.therapist_id)
        .filter(*conditions)
    )
    total = query.count()

    if sort == "newest":
        query = query.order_by(TreatmentSchedule.created_at.desc())
    elif sort == "priority":
        query = query.order_by(
            case((TreatmentSchedule.priority == "high", 0), else_=1),
            TreatmentSchedule.in_time,
        )
    elif sort == "patient":
        query = query.order_by(TreatmentSchedule.patient_name)
    elif sort == "therapist":
        query = query.order_by(User.username, TreatmentSchedule.in_time)
    else:
        schedule_start, _ = _date_range_columns(TreatmentSchedule)
        query = query.order_by(schedule_start, TreatmentSchedule.in_time)

    rows = (
        query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    conflict_ids = _conflict_ids(db)

    summary_row = db.query(
        func.count(
            case((today_condition, TreatmentSchedule.id))
        ).label("today"),
        func.count(
            case((upcoming_condition, TreatmentSchedule.id))
        ).label("upcoming"),
        func.count(
            case((in_progress_condition, TreatmentSchedule.id))
        ).label("in_progress"),
        func.count(
            case(
                (
                    TreatmentSchedule.status == "completed",
                    TreatmentSchedule.id,
                )
            )
        ).label("completed"),
        func.count(
            case(
                (
                    (TreatmentSchedule.status == "completed")
                    & (
                        func.date(TreatmentSchedule.completed_at)
                        == today
                    ),
                    TreatmentSchedule.id,
                )
            )
        ).label("completed_today"),
        func.count(
            case(
                (
                    func.lower(TreatmentSchedule.status).in_(
                        ["cancelled", "canceled"]
                    ),
                    TreatmentSchedule.id,
                )
            )
        ).label("cancelled"),
        func.count(
            case(
                (
                    func.lower(TreatmentSchedule.status).in_(
                        ["cancelled", "canceled"]
                    )
                    & today_condition,
                    TreatmentSchedule.id,
                )
            )
        ).label("cancelled_today"),
        func.count(
            case(
                (
                    today_condition
                    & (TreatmentSchedule.priority == "high"),
                    TreatmentSchedule.id,
                )
            )
        ).label("high_priority_today"),
    ).one()

    items = []
    for schedule, doctor_name, therapist_name in rows:
        occurrence = _occurrence_date(
            schedule,
            view=view,
            today=today,
        )
        operational_status = schedule.status
        if (
            schedule.status == "scheduled"
            and occurrence == today
            and schedule.in_time <= now_time <= schedule.out_time
        ):
            operational_status = "in_progress"

        area_parts = [
            part.strip()
            for part in schedule.patient_address.split(",")
            if part.strip()
        ]
        items.append(
            {
                "id": schedule.id,
                "patient_name": schedule.patient_name,
                "patient_reference_id": schedule.patient_reference_id,
                "patient_phone": schedule.patient_phone,
                "patient_address": schedule.patient_address,
                "area": area_parts[0]
                if area_parts
                else schedule.patient_address,
                "doctor_id": schedule.doctor_id,
                "doctor_name": doctor_name,
                "therapist_id": schedule.therapist_id,
                "therapist_name": therapist_name,
                "treatment_name": schedule.treatment_name,
                "visit_type": schedule.visit_type,
                "medicines": schedule.medicines,
                "schedule_type": schedule.schedule_type,
                "occurrence_date": occurrence,
                "start_date": schedule.start_date,
                "end_date": schedule.end_date,
                "start_time": schedule.in_time,
                "expected_end_time": schedule.out_time,
                "duration_minutes": _duration_minutes(
                    schedule.in_time,
                    schedule.out_time,
                ),
                "priority": schedule.priority,
                "status": schedule.status,
                "operational_status": operational_status,
                "instructions": schedule.instructions,
                "clinical_notes": schedule.clinical_notes,
                "precautions": schedule.precautions,
                "has_conflict": schedule.id in conflict_ids,
            }
        )

    return {
        "items": items,
        "summary": {
            "today": summary_row.today,
            "upcoming": summary_row.upcoming,
            "in_progress": summary_row.in_progress,
            "completed": summary_row.completed,
            "completed_today": summary_row.completed_today,
            "cancelled": summary_row.cancelled,
            "cancelled_today": summary_row.cancelled_today,
            "high_priority_today": summary_row.high_priority_today,
            "conflicts": len(conflict_ids),
        },
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": ceil(total / page_size) if total else 0,
    }


@router.get("/form-options", response_model=AdminScheduleFormOptions)
def get_form_options(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(["admin"])),
):
    today = date.today()
    today_counts = (
        db.query(
            TreatmentSchedule.therapist_id.label("therapist_id"),
            func.count(TreatmentSchedule.id).label("appointment_count"),
        )
        .filter(_occurs_on(TreatmentSchedule, today))
        .group_by(TreatmentSchedule.therapist_id)
        .subquery()
    )
    therapists = (
        db.query(
            User.id,
            User.username,
            User.email,
            func.coalesce(today_counts.c.appointment_count, 0),
        )
        .outerjoin(
            today_counts,
            today_counts.c.therapist_id == User.id,
        )
        .filter(User.role == "therapist", User.is_active.is_(True))
        .order_by(User.username)
        .all()
    )
    doctors = (
        db.query(Doctor)
        .filter(Doctor.active.is_(True))
        .order_by(Doctor.name)
        .all()
    )

    ranked_patients = (
        db.query(
            TreatmentSchedule.patient_name.label("name"),
            TreatmentSchedule.patient_reference_id.label("reference_id"),
            TreatmentSchedule.patient_phone.label("phone"),
            TreatmentSchedule.patient_address.label("address"),
            func.row_number()
            .over(
                partition_by=func.lower(TreatmentSchedule.patient_name),
                order_by=TreatmentSchedule.created_at.desc(),
            )
            .label("row_number"),
        )
        .subquery()
    )
    patients = (
        db.query(
            ranked_patients.c.name,
            ranked_patients.c.reference_id,
            ranked_patients.c.phone,
            ranked_patients.c.address,
        )
        .filter(ranked_patients.c.row_number == 1)
        .order_by(ranked_patients.c.name)
        .limit(50)
        .all()
    )

    return {
        "patients": [
            {
                "name": patient.name,
                "reference_id": patient.reference_id,
                "phone": patient.phone,
                "address": patient.address,
            }
            for patient in patients
        ],
        "doctors": [
            {
                "id": doctor.id,
                "name": doctor.name,
                "specialization": doctor.specialization,
            }
            for doctor in doctors
        ],
        "therapists": [
            {
                "id": therapist.id,
                "name": therapist.username,
                "email": therapist.email,
                "today_appointments": therapist[3],
            }
            for therapist in therapists
        ],
    }


@router.get(
    "/therapist-availability",
    response_model=TherapistAvailabilityResponse,
)
def get_therapist_availability(
    therapist_id: int = Query(ge=1),
    schedule_type: str = Query(),
    treatment_date: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    start_time: time = Query(),
    expected_end_time: time = Query(),
    exclude_schedule_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(["admin"])),
):
    if expected_end_time <= start_time:
        raise HTTPException(
            status_code=400,
            detail="Expected end time must be after the start time.",
        )
    try:
        conflicts = find_schedule_conflicts(
            db,
            therapist_id=therapist_id,
            schedule_type=schedule_type,
            treatment_date=treatment_date,
            start_date=start_date,
            end_date=end_date,
            in_time=start_time,
            out_time=expected_end_time,
            exclude_schedule_id=exclude_schedule_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    today_count = (
        db.query(func.count(TreatmentSchedule.id))
        .filter(
            TreatmentSchedule.therapist_id == therapist_id,
            TreatmentSchedule.status == "scheduled",
            _occurs_on(TreatmentSchedule, date.today()),
        )
        .scalar()
        or 0
    )

    return {
        "available": not conflicts,
        "today_appointments": today_count,
        "conflicts": [
            {
                "id": conflict.id,
                "patient_name": conflict.patient_name,
                "schedule_date": (
                    conflict.treatment_date or conflict.start_date
                ),
                "start_time": conflict.in_time,
                "expected_end_time": conflict.out_time,
            }
            for conflict in conflicts[:5]
        ],
    }


@router.put(
    "/{schedule_id}/cancel",
    response_model=TreatmentScheduleResponse,
)
def cancel_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(["admin"])),
):
    schedule = (
        db.query(TreatmentSchedule)
        .filter(TreatmentSchedule.id == schedule_id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    validate_status_transition(
        entity="Treatment schedule status",
        current_status=schedule.status,
        next_status="cancelled",
        transitions=TREATMENT_SCHEDULE_STATUS_TRANSITIONS,
    )
    schedule.status = "cancelled"
    db.commit()
    db.refresh(schedule)
    schedule.doctor_name = (
        schedule.doctor.name if schedule.doctor else None
    )
    schedule.therapist_name = (
        schedule.therapist.username if schedule.therapist else None
    )
    return schedule
