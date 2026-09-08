from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_
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
from app.utils.domain_errors import DomainHTTPException
from app.services.domain_audit_service import record_domain_audit_event

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
            available_actions=["start_workday"],
            next_action="start_workday",
            **_policy_payload(india_now()),
        )

    policy = _policy_payload(india_now())
    active_schedule = (
        db.query(TreatmentSchedule.id)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.status == "scheduled",
            TreatmentSchedule.session_status == "IN_PROGRESS",
        )
        .first()
        if workday.is_active
        else None
    )
    available_actions: list[str] = []
    blocking_reasons: list[str] = []
    next_action = None
    if workday.is_active and active_schedule is not None:
        available_actions = ["resume_treatment"]
        blocking_reasons = ["ACTIVE_TREATMENT_BLOCKS_WORKDAY_END"]
        next_action = "punch_out_active_treatment"
    elif workday.is_active:
        available_actions = ["view_schedules"]
        next_action = "view_schedules"
        if policy["can_end_workday"]:
            available_actions.append("end_workday")
            next_action = "end_workday"
        else:
            available_actions.append("end_workday_early_with_reason")
            blocking_reasons = ["EARLY_END_REASON_REQUIRED"]
    return TodayWorkdayResponse(
        started=True,
        workday_id=workday.id,
        work_date=workday.work_date,
        started_at=workday.started_at,
        start_address=workday.start_address,
        is_active=workday.is_active,
        ended_at=workday.ended_at,
        ended_early=workday.ended_early,
        end_reason=workday.end_reason,
        early_end_review_status=workday.early_end_review_status,
        total_work_minutes=workday.total_work_minutes,
        pending_schedules_count=workday.pending_schedules_count,
        completed_schedules_count=workday.completed_schedules_count,
        missed_schedules_count=workday.missed_schedules_count,
        available_actions=available_actions,
        blocking_reasons=blocking_reasons,
        next_action=next_action,
        active_schedule_id=(
            active_schedule[0] if active_schedule is not None else None
        ),
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
        if existing.is_active:
            return StartDayResponse(
                message="Workday is already active",
                workday_id=existing.id,
            )
        raise DomainHTTPException(
            status_code=409,
            code="WORKDAY_ALREADY_COMPLETED",
            message="Workday already completed for today",
            recoverable=False,
            suggested_action="view_workday_summary",
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
    db.flush()
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="attendance",
        entity_type="therapist_workday",
        entity_id=workday.id,
        action="started",
        business_date=workday.work_date,
        from_state="not_started",
        to_state="active",
    )
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
    ended_early = ended_at.time().replace(tzinfo=None) < WORKDAY_END_TIME
    if ended_early and not payload.early_end_reason:
        raise DomainHTTPException(
            status_code=400,
            code="EARLY_END_REASON_REQUIRED",
            message=(
                "Enter a reason to end the workday before "
                f"{WORKDAY_END_TIME.strftime('%I:%M %p')}."
            ),
            recoverable=True,
            suggested_action="provide_early_end_reason",
            blocking_fields=["early_end_reason"],
        )

    workday = (
        db.query(TherapistWorkDay)
        .filter(
            TherapistWorkDay.therapist_id == current_user.id,
            TherapistWorkDay.is_active.is_(True),
        )
        .order_by(TherapistWorkDay.work_date.desc(), TherapistWorkDay.id.desc())
        .with_for_update()
        .first()
    )
    if workday is None:
        completed_workday = (
            db.query(TherapistWorkDay)
            .filter(
                TherapistWorkDay.therapist_id == current_user.id,
                func.date(TherapistWorkDay.ended_at) == ended_at.date(),
                TherapistWorkDay.is_active.is_(False),
                TherapistWorkDay.ended_at.is_not(None),
            )
            .order_by(TherapistWorkDay.id.desc())
            .first()
        )
        if completed_workday is not None:
            return EndDayResponse(
                message="Workday was already ended successfully",
                workday_id=completed_workday.id,
                ended_at=completed_workday.ended_at,
                total_work_minutes=completed_workday.total_work_minutes or 0,
                pending_schedules_count=(
                    completed_workday.pending_schedules_count or 0
                ),
                completed_schedules_count=(
                    completed_workday.completed_schedules_count or 0
                ),
                missed_schedules_count=(
                    completed_workday.missed_schedules_count or 0
                ),
                ended_early=completed_workday.ended_early,
                end_reason=completed_workday.end_reason,
                early_end_review_status=(
                    completed_workday.early_end_review_status
                ),
            )
        raise DomainHTTPException(
            status_code=400,
            code="WORKDAY_NOT_ACTIVE",
            message="No active workday was found for today.",
            recoverable=True,
            suggested_action="refresh_workday_status",
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
        raise DomainHTTPException(
            status_code=400,
            code="ACTIVE_TREATMENT_BLOCKS_WORKDAY_END",
            message=(
                "Punch out from the active treatment before ending the workday."
            ),
            recoverable=True,
            suggested_action="punch_out_active_treatment",
            blocking_fields=["active_schedule_id"],
        )

    counts = {"scheduled": 0, "completed": 0, "missed": 0}
    for status, _schedule_id in (
        db.query(TreatmentSchedule.status, TreatmentSchedule.id)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            _today_schedule_condition(workday.work_date),
        )
        .all()
    ):
        if status in counts:
            counts[status] += 1

    workday.ended_at = ended_at
    workday.ended_early = ended_early
    workday.end_reason = payload.early_end_reason
    workday.early_end_review_status = "pending" if ended_early else None
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
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="attendance",
        entity_type="therapist_workday",
        entity_id=workday.id,
        action="ended",
        business_date=workday.work_date,
        from_state="active",
        to_state="ended_early" if ended_early else "completed",
        reason_code="early_closure" if ended_early else None,
        reason=payload.early_end_reason if ended_early else None,
        details={
            "completed_count": counts["completed"],
            "pending_count": counts["scheduled"],
            "missed_count": counts["missed"],
        },
    )
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
        ended_early=workday.ended_early,
        end_reason=workday.end_reason,
        early_end_review_status=workday.early_end_review_status,
    )
