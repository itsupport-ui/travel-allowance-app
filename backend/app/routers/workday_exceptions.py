from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_workday import DoctorWorkDay
from app.models.therapist_workday import TherapistWorkDay
from app.models.operational_follow_up import OperationalFollowUp
from app.models.user import User
from app.schemas.workday_exception import (
    EarlyClosureDecision,
    EarlyClosureReviewResponse,
)
from app.utils.auth import require_permission
from app.utils.domain_errors import DomainHTTPException
from app.utils.timezone import india_now
from app.services.domain_audit_service import record_domain_audit_event


router = APIRouter(
    prefix="/workday-exceptions/early-closures",
    tags=["Workday Exceptions"],
)
VALID_STATUSES = {"pending", "acknowledged", "follow_up_required"}
VALID_ROLES = {"all", "doctor", "therapist"}


def _reviewer_name(db: Session, reviewer_id: int | None) -> str | None:
    if reviewer_id is None:
        return None
    reviewer = db.query(User).filter(User.id == reviewer_id).first()
    return reviewer.username if reviewer else None


def _therapist_response(
    db: Session,
    workday: TherapistWorkDay,
) -> EarlyClosureReviewResponse:
    therapist = db.query(User).filter(User.id == workday.therapist_id).first()
    return EarlyClosureReviewResponse(
        staff_role="therapist",
        workday_id=workday.id,
        staff_id=workday.therapist_id,
        staff_name=(
            therapist.username
            if therapist is not None
            else f"Therapist #{workday.therapist_id}"
        ),
        business_date=workday.work_date,
        started_at=workday.started_at,
        ended_at=workday.ended_at,
        total_work_minutes=workday.total_work_minutes or 0,
        completed_activities=workday.completed_schedules_count or 0,
        pending_activities=workday.pending_schedules_count or 0,
        missed_activities=workday.missed_schedules_count or 0,
        staff_reason=workday.end_reason or "Reason not recorded",
        review_status=workday.early_end_review_status or "pending",
        reviewed_by=workday.early_end_reviewed_by,
        reviewer_name=_reviewer_name(db, workday.early_end_reviewed_by),
        review_reason=workday.early_end_review_reason,
        reviewed_at=workday.early_end_reviewed_at,
        version=workday.early_end_review_version,
        available_actions=(
            ["acknowledge", "require_follow_up"]
            if (workday.early_end_review_status or "pending") == "pending"
            else []
        ),
    )


def _doctor_response(
    db: Session,
    workday: DoctorWorkDay,
) -> EarlyClosureReviewResponse:
    doctor = db.query(Doctor).filter(Doctor.id == workday.doctor_id).first()
    return EarlyClosureReviewResponse(
        staff_role="doctor",
        workday_id=workday.id,
        staff_id=workday.doctor_id,
        staff_name=(
            doctor.name if doctor is not None else f"Doctor #{workday.doctor_id}"
        ),
        business_date=workday.work_date,
        started_at=workday.started_at,
        ended_at=workday.ended_at,
        total_work_minutes=workday.total_work_minutes or 0,
        completed_activities=workday.completed_visits_count or 0,
        pending_activities=workday.pending_visits_count or 0,
        missed_activities=None,
        staff_reason=workday.end_reason or "Reason not recorded",
        review_status=workday.early_end_review_status or "pending",
        reviewed_by=workday.early_end_reviewed_by,
        reviewer_name=_reviewer_name(db, workday.early_end_reviewed_by),
        review_reason=workday.early_end_review_reason,
        reviewed_at=workday.early_end_reviewed_at,
        version=workday.early_end_review_version,
        available_actions=(
            ["acknowledge", "require_follow_up"]
            if (workday.early_end_review_status or "pending") == "pending"
            else []
        ),
    )


@router.get("", response_model=list[EarlyClosureReviewResponse])
def list_early_closures(
    status: str = Query(default="pending"),
    role: str = Query(default="all"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    del current_user
    normalized_status = status.strip().lower()
    normalized_role = role.strip().lower()
    if normalized_status != "all" and normalized_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid review status.")
    if normalized_role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Invalid staff role.")

    items: list[EarlyClosureReviewResponse] = []
    if normalized_role in {"all", "therapist"}:
        query = db.query(TherapistWorkDay).filter(
            TherapistWorkDay.ended_early.is_(True)
        )
        if normalized_status != "all":
            if normalized_status == "pending":
                query = query.filter(
                    or_(
                        TherapistWorkDay.early_end_review_status.is_(None),
                        TherapistWorkDay.early_end_review_status == "pending",
                    )
                )
            else:
                query = query.filter(
                    TherapistWorkDay.early_end_review_status == normalized_status
                )
        items.extend(_therapist_response(db, item) for item in query.all())

    if normalized_role in {"all", "doctor"}:
        query = db.query(DoctorWorkDay).filter(DoctorWorkDay.ended_early.is_(True))
        if normalized_status != "all":
            if normalized_status == "pending":
                query = query.filter(
                    or_(
                        DoctorWorkDay.early_end_review_status.is_(None),
                        DoctorWorkDay.early_end_review_status == "pending",
                    )
                )
            else:
                query = query.filter(
                    DoctorWorkDay.early_end_review_status == normalized_status
                )
        items.extend(_doctor_response(db, item) for item in query.all())

    items.sort(key=lambda item: item.ended_at, reverse=True)
    return items[:limit]


@router.put(
    "/{staff_role}/{workday_id}/decision",
    response_model=EarlyClosureReviewResponse,
)
def decide_early_closure(
    staff_role: str,
    workday_id: int,
    payload: EarlyClosureDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    normalized_role = staff_role.strip().lower()
    if normalized_role == "therapist":
        workday = (
            db.query(TherapistWorkDay)
            .filter(TherapistWorkDay.id == workday_id)
            .with_for_update()
            .first()
        )
    elif normalized_role == "doctor":
        workday = (
            db.query(DoctorWorkDay)
            .filter(DoctorWorkDay.id == workday_id)
            .with_for_update()
            .first()
        )
    else:
        raise HTTPException(status_code=422, detail="Invalid staff role.")

    if workday is None or not workday.ended_early:
        raise HTTPException(status_code=404, detail="Early closure not found.")
    if workday.early_end_review_version != payload.version:
        raise DomainHTTPException(
            status_code=409,
            code="EARLY_CLOSURE_VERSION_CONFLICT",
            message="This early closure changed after it was opened. Refresh and review again.",
            recoverable=True,
            suggested_action="refresh_early_closures",
            blocking_fields=["version"],
        )
    current_status = workday.early_end_review_status or "pending"
    if current_status != "pending":
        raise DomainHTTPException(
            status_code=409,
            code="EARLY_CLOSURE_ALREADY_REVIEWED",
            message=f"This early closure is already {current_status.replace('_', ' ')}.",
            recoverable=True,
            suggested_action="refresh_early_closures",
        )

    workday.early_end_review_status = payload.decision
    workday.early_end_reviewed_by = current_user.id
    workday.early_end_review_reason = payload.reason.strip()
    workday.early_end_reviewed_at = datetime.now(timezone.utc)
    workday.early_end_review_version += 1
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="attendance",
        entity_type=f"{normalized_role}_workday",
        entity_id=workday.id,
        action="early_closure_reviewed",
        business_date=workday.work_date,
        from_state=current_status,
        to_state=payload.decision,
        reason_code=payload.decision,
        reason=payload.reason,
        related_entity_type=normalized_role,
        related_entity_id=(
            workday.therapist_id
            if normalized_role == "therapist"
            else workday.doctor_id
        ),
        details={"review_version": workday.early_end_review_version},
    )
    if payload.decision == "follow_up_required":
        source_entity_type = f"{normalized_role}_workday"
        source_entity_id = str(workday.id)
        follow_up = (
            db.query(OperationalFollowUp)
            .filter(
                OperationalFollowUp.source_domain == "attendance",
                OperationalFollowUp.source_entity_type == source_entity_type,
                OperationalFollowUp.source_entity_id == source_entity_id,
                OperationalFollowUp.status.in_(("open", "in_progress")),
            )
            .first()
        )
        action = "follow_up_linked"
        if follow_up is None:
            follow_up = OperationalFollowUp(
                source_domain="attendance",
                source_entity_type=source_entity_type,
                source_entity_id=source_entity_id,
                title="Review early workday closure",
                priority=(
                    "high"
                    if (
                        (workday.pending_schedules_count or 0)
                        if normalized_role == "therapist"
                        else (workday.pending_visits_count or 0)
                    ) > 0
                    else "medium"
                ),
                status="in_progress",
                assignee_id=current_user.id,
                due_date=india_now().date() + timedelta(days=2),
                created_by=current_user.id,
                created_reason=payload.reason.strip(),
            )
            db.add(follow_up)
            db.flush()
            action = "follow_up_created"
        else:
            follow_up.status = "in_progress"
            follow_up.assignee_id = follow_up.assignee_id or current_user.id
            follow_up.due_date = follow_up.due_date or (
                india_now().date() + timedelta(days=2)
            )
            follow_up.version += 1
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="attendance",
            entity_type="operational_follow_up",
            entity_id=follow_up.id,
            action=action,
            to_state="in_progress",
            reason=payload.reason,
            related_entity_type=f"{normalized_role}_workday",
            related_entity_id=workday.id,
            details={
                "priority": follow_up.priority,
                "assignee_id": current_user.id,
            },
        )
    db.commit()
    db.refresh(workday)
    if normalized_role == "therapist":
        return _therapist_response(db, workday)
    return _doctor_response(db, workday)
