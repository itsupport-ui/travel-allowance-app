from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.config import (
    WORKDAY_AUTO_LOGOUT_ENABLED,
    WORKDAY_AUTO_LOGOUT_GRACE_MINUTES,
    WORKDAY_END_TIME,
)
from app.database import get_db
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.models.therapist_workday import TherapistWorkDay
from app.schemas.therapist_workday import (
    EndDayRequest,
    EndDayResponse,
    StartDayRequest,
    StartDayResponse,
    TodayWorkdayResponse,
)
from app.utils.auth import require_role
from app.utils.timezone import india_now

router = APIRouter(
    prefix="/therapist/workday",
    tags=["Therapist Workday"]
)


def _today_schedule_condition(today):
    return or_(
        and_(
            TreatmentSchedule.schedule_type == "one_time",
            TreatmentSchedule.treatment_date == today,
        ),
        and_(
            TreatmentSchedule.schedule_type == "recurring",
            TreatmentSchedule.start_date <= today,
            TreatmentSchedule.end_date >= today,
        ),
    )


def _duration_minutes(started_at: datetime, ended_at: datetime) -> int:
    if started_at.tzinfo is None:
        ended_at = ended_at.replace(tzinfo=None)
    return max(0, int((ended_at - started_at).total_seconds() // 60))


def _policy_payload(now):
    reached_end_time = now.time().replace(tzinfo=None) >= WORKDAY_END_TIME
    return {
        "workday_end_time": WORKDAY_END_TIME.strftime("%H:%M"),
        "can_end_workday": reached_end_time,
        "should_prompt_end": reached_end_time,
        "auto_logout_enabled": WORKDAY_AUTO_LOGOUT_ENABLED,
        "auto_logout_grace_minutes": WORKDAY_AUTO_LOGOUT_GRACE_MINUTES,
    }

@router.get("/today", response_model=TodayWorkdayResponse)
def get_today_workday(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    today = india_now().date()
    workday = (
        db.query(TherapistWorkDay)
        .filter(
            TherapistWorkDay.therapist_id == current_user.id,
            TherapistWorkDay.work_date == today,
        )
        .order_by(TherapistWorkDay.id.desc())
        .first()
    )

    if workday is None:
        return TodayWorkdayResponse(
            started=False,
            work_date=today,
            is_active=False,
            **_policy_payload(india_now()),
        )

    policy = _policy_payload(india_now())
    return TodayWorkdayResponse(
        started=True,
        workday_id=workday.id,
        work_date=workday.work_date,
        started_at=workday.started_at,
        start_address=workday.start_address,
        is_active=workday.is_active,
        ended_at=workday.ended_at,
        total_work_minutes=workday.total_work_minutes,
        pending_schedules_count=workday.pending_schedules_count,
        completed_schedules_count=workday.completed_schedules_count,
        missed_schedules_count=workday.missed_schedules_count,
        **{
            **policy,
            "can_end_workday": (
                workday.is_active
                and policy["can_end_workday"]
            ),
            "should_prompt_end": (
                workday.is_active
                and policy["should_prompt_end"]
            ),
        },
    )


@router.post("/start", response_model=StartDayResponse)
def start_day(
    payload: StartDayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    started_at = india_now()
    today = started_at.date()

    existing = (
        db.query(TherapistWorkDay)
        .filter(
            TherapistWorkDay.therapist_id == current_user.id,
            TherapistWorkDay.work_date == today,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Workday already started for today"
                if existing.is_active
                else "Workday already completed for today"
            ),
        )
    workday = TherapistWorkDay(
        therapist_id=current_user.id,
        work_date=today,
        start_address=payload.start_address,
        start_latitude=payload.start_latitude,
        start_longitude=payload.start_longitude,
        started_at=started_at,
        is_active=True
    )


    db.add(workday)
    db.commit()
    db.refresh(workday)

    return StartDayResponse(
        message="Workday started successfully",
        workday_id=workday.id,
    )


@router.post("/end", response_model=EndDayResponse)
def end_day(
    payload: EndDayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    ended_at = india_now()
    today = ended_at.date()

    if ended_at.time().replace(tzinfo=None) < WORKDAY_END_TIME:
        raise HTTPException(
            status_code=400,
            detail=(
                "The workday can be ended at or after "
                f"{WORKDAY_END_TIME.strftime('%I:%M %p')}."
            ),
        )

    workday = (
        db.query(TherapistWorkDay)
        .filter(
            TherapistWorkDay.therapist_id == current_user.id,
            TherapistWorkDay.work_date == today,
            TherapistWorkDay.is_active.is_(True),
        )
        .with_for_update()
        .first()
    )
    if workday is None:
        raise HTTPException(
            status_code=400,
            detail="No active workday was found for today.",
        )

    active_session = (
        db.query(TreatmentSchedule.id)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.session_status == "IN_PROGRESS",
            TreatmentSchedule.status == "scheduled",
        )
        .first()
    )
    if active_session is not None:
        raise HTTPException(
            status_code=400,
            detail="Punch out from the active treatment before ending the workday.",
        )

    counts = {"scheduled": 0, "completed": 0, "missed": 0}
    for status, _schedule_id in (
        db.query(TreatmentSchedule.status, TreatmentSchedule.id)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            _today_schedule_condition(today),
        )
        .all()
    ):
        if status in counts:
            counts[status] += 1

    workday.ended_at = ended_at
    workday.end_latitude = payload.end_latitude
    workday.end_longitude = payload.end_longitude
    workday.total_work_minutes = _duration_minutes(
        workday.started_at,
        ended_at,
    )
    workday.pending_schedules_count = counts["scheduled"]
    workday.completed_schedules_count = counts["completed"]
    workday.missed_schedules_count = counts["missed"]
    workday.is_active = False
    db.commit()
    db.refresh(workday)

    return EndDayResponse(
        message="Workday ended successfully",
        workday_id=workday.id,
        ended_at=workday.ended_at,
        total_work_minutes=workday.total_work_minutes,
        pending_schedules_count=workday.pending_schedules_count,
        completed_schedules_count=workday.completed_schedules_count,
        missed_schedules_count=workday.missed_schedules_count,
    )
