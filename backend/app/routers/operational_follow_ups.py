from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.operational_follow_up import OperationalFollowUp
from app.models.user import User
from app.schemas.operational_follow_up import (
    ALLOWED_DOMAINS,
    ALLOWED_PRIORITIES,
    ALLOWED_STATUSES,
    OperationalFollowUpCreate,
    OperationalFollowUpAssignee,
    OperationalFollowUpPage,
    OperationalFollowUpResponse,
    OperationalFollowUpUpdate,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.auth import require_permission
from app.utils.domain_errors import DomainHTTPException
from app.utils.timezone import india_now


router = APIRouter(prefix="/operational-follow-ups", tags=["Operational Follow-ups"])
ACTIVE_STATUSES = {"open", "in_progress"}
TRANSITIONS = {
    "open": {"open", "in_progress", "resolved", "cancelled"},
    "in_progress": {"in_progress", "open", "resolved", "cancelled"},
    "resolved": set(),
    "cancelled": set(),
}


def _user_names(db: Session, ids: set[int | None]) -> dict[int, str]:
    valid_ids = {item for item in ids if item is not None}
    if not valid_ids:
        return {}
    return dict(
        db.query(User.id, User.username).filter(User.id.in_(valid_ids)).all()
    )


def _available_actions(item: OperationalFollowUp) -> list[str]:
    if item.status == "open":
        return ["assign", "start", "resolve", "cancel"]
    if item.status == "in_progress":
        return ["reassign", "return_to_open", "resolve", "cancel"]
    return []


def _response(
    item: OperationalFollowUp,
    names: dict[int, str],
) -> OperationalFollowUpResponse:
    return OperationalFollowUpResponse.model_validate(item).model_copy(
        update={
            "assignee_name": names.get(item.assignee_id),
            "creator_name": names.get(item.created_by),
            "resolver_name": names.get(item.resolved_by),
            "available_actions": _available_actions(item),
        }
    )


def _validate_assignee(db: Session, assignee_id: int | None) -> None:
    if assignee_id is None:
        return
    assignee = db.query(User).filter(User.id == assignee_id).first()
    if assignee is None or not assignee.is_active or assignee.role != "admin":
        raise DomainHTTPException(
            status_code=422,
            code="FOLLOW_UP_ASSIGNEE_INELIGIBLE",
            message="Choose an active administrator as the follow-up owner.",
            recoverable=True,
            suggested_action="select_active_admin",
            blocking_fields=["assignee_id"],
        )


@router.get("/assignees", response_model=list[OperationalFollowUpAssignee])
def list_follow_up_assignees(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("follow_ups.manage")),
):
    return [
        OperationalFollowUpAssignee(id=user.id, name=user.username)
        for user in db.query(User)
        .filter(User.role == "admin", User.is_active.is_(True))
        .order_by(User.username.asc(), User.id.asc())
        .all()
    ]


@router.get("", response_model=OperationalFollowUpPage)
def list_follow_ups(
    status: str = Query("open"),
    domain: str | None = Query(None),
    priority: str | None = Query(None),
    assignee_id: int | None = Query(None),
    overdue_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("follow_ups.manage")),
):
    normalized_status = status.strip().lower()
    if normalized_status != "all" and normalized_status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid follow-up status.")
    query = db.query(OperationalFollowUp)
    if normalized_status != "all":
        query = query.filter(OperationalFollowUp.status == normalized_status)
    if domain:
        normalized_domain = domain.strip().lower()
        if normalized_domain not in ALLOWED_DOMAINS:
            raise HTTPException(status_code=422, detail="Invalid follow-up domain.")
        query = query.filter(OperationalFollowUp.source_domain == normalized_domain)
    if priority:
        normalized_priority = priority.strip().lower()
        if normalized_priority not in ALLOWED_PRIORITIES:
            raise HTTPException(status_code=422, detail="Invalid follow-up priority.")
        query = query.filter(OperationalFollowUp.priority == normalized_priority)
    if assignee_id is not None:
        query = query.filter(OperationalFollowUp.assignee_id == assignee_id)
    if overdue_only:
        query = query.filter(
            OperationalFollowUp.status.in_(ACTIVE_STATUSES),
            OperationalFollowUp.due_date < india_now().date(),
        )
    total = query.count()
    items = (
        query.order_by(
            OperationalFollowUp.due_date.is_(None),
            OperationalFollowUp.due_date.asc(),
            OperationalFollowUp.created_at.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    names = _user_names(
        db,
        {
            user_id
            for item in items
            for user_id in (item.assignee_id, item.created_by, item.resolved_by)
        },
    )
    return OperationalFollowUpPage(
        items=[_response(item, names) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=OperationalFollowUpResponse, status_code=201)
def create_follow_up(
    payload: OperationalFollowUpCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("follow_ups.manage")),
):
    _validate_assignee(db, payload.assignee_id)
    if payload.due_date is not None and payload.due_date < india_now().date():
        raise DomainHTTPException(
            status_code=422,
            code="FOLLOW_UP_DUE_DATE_PAST",
            message="The follow-up due date cannot be in the past.",
            recoverable=True,
            suggested_action="choose_current_or_future_date",
            blocking_fields=["due_date"],
        )
    duplicate = db.query(OperationalFollowUp).filter(
        OperationalFollowUp.source_domain == payload.source_domain,
        OperationalFollowUp.source_entity_type == payload.source_entity_type.lower(),
        OperationalFollowUp.source_entity_id == payload.source_entity_id,
        OperationalFollowUp.status.in_(ACTIVE_STATUSES),
    ).first()
    if duplicate is not None:
        raise DomainHTTPException(
            status_code=409,
            code="FOLLOW_UP_ALREADY_OPEN",
            message="An active follow-up already exists for this record.",
            recoverable=True,
            suggested_action="open_existing_follow_up",
        )
    item = OperationalFollowUp(
        source_domain=payload.source_domain,
        source_entity_type=payload.source_entity_type.lower(),
        source_entity_id=payload.source_entity_id,
        title=payload.title,
        priority=payload.priority,
        status="in_progress" if payload.assignee_id is not None else "open",
        assignee_id=payload.assignee_id,
        due_date=payload.due_date,
        created_by=current_user.id,
        created_reason=payload.reason,
    )
    db.add(item)
    try:
        db.flush()
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain=payload.source_domain,
            entity_type="operational_follow_up",
            entity_id=item.id,
            action="follow_up_created",
            to_state=item.status,
            reason=payload.reason,
            related_entity_type=item.source_entity_type,
            related_entity_id=item.source_entity_id,
            details={"priority": item.priority, "assignee_id": item.assignee_id},
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise DomainHTTPException(
            status_code=409,
            code="FOLLOW_UP_ALREADY_OPEN",
            message="An active follow-up already exists for this record.",
            recoverable=True,
            suggested_action="open_existing_follow_up",
        ) from error
    db.refresh(item)
    names = _user_names(db, {item.assignee_id, item.created_by})
    return _response(item, names)


@router.put("/{follow_up_id}", response_model=OperationalFollowUpResponse)
def update_follow_up(
    follow_up_id: int,
    payload: OperationalFollowUpUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("follow_ups.manage")),
):
    item = db.query(OperationalFollowUp).filter(
        OperationalFollowUp.id == follow_up_id
    ).with_for_update().first()
    if item is None:
        raise HTTPException(status_code=404, detail="Follow-up not found.")
    if item.version != payload.version:
        raise DomainHTTPException(
            status_code=409,
            code="FOLLOW_UP_VERSION_CONFLICT",
            message="This follow-up changed after it was opened. Refresh and try again.",
            recoverable=True,
            suggested_action="refresh_follow_ups",
            blocking_fields=["version"],
        )
    if payload.status not in TRANSITIONS[item.status]:
        raise DomainHTTPException(
            status_code=409,
            code="FOLLOW_UP_TRANSITION_NOT_ALLOWED",
            message=f"A {item.status.replace('_', ' ')} follow-up cannot move to {payload.status.replace('_', ' ')}.",
            recoverable=False,
            suggested_action="refresh_follow_ups",
        )
    assignee_id = (
        payload.assignee_id
        if "assignee_id" in payload.model_fields_set
        else item.assignee_id
    )
    due_date = (
        payload.due_date
        if "due_date" in payload.model_fields_set
        else item.due_date
    )
    _validate_assignee(db, assignee_id)
    if due_date is not None and due_date < india_now().date():
        raise DomainHTTPException(
            status_code=422,
            code="FOLLOW_UP_DUE_DATE_PAST",
            message="The follow-up due date cannot be in the past.",
            recoverable=True,
            suggested_action="choose_current_or_future_date",
            blocking_fields=["due_date"],
        )
    if payload.status == "in_progress" and assignee_id is None:
        raise DomainHTTPException(
            status_code=422,
            code="FOLLOW_UP_ASSIGNEE_REQUIRED",
            message="Assign an owner before starting this follow-up.",
            recoverable=True,
            suggested_action="select_active_admin",
            blocking_fields=["assignee_id"],
        )
    from_state = item.status
    item.status = payload.status
    item.assignee_id = assignee_id
    item.due_date = due_date
    if payload.priority is not None:
        item.priority = payload.priority
    if payload.status in {"resolved", "cancelled"}:
        item.resolution = payload.reason
        item.resolved_by = current_user.id
        item.resolved_at = datetime.now(timezone.utc)
    item.version += 1
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain=item.source_domain,
        entity_type="operational_follow_up",
        entity_id=item.id,
        action=f"follow_up_{payload.status}",
        from_state=from_state,
        to_state=item.status,
        reason=payload.reason,
        related_entity_type=item.source_entity_type,
        related_entity_id=item.source_entity_id,
        details={"priority": item.priority, "assignee_id": item.assignee_id},
    )
    db.commit()
    db.refresh(item)
    names = _user_names(
        db,
        {item.assignee_id, item.created_by, item.resolved_by},
    )
    return _response(item, names)
