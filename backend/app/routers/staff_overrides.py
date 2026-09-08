from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.staff_deactivation_override import StaffDeactivationOverride
from app.models.user import User
from app.schemas.staff_override import (
    StaffDeactivationOverrideCreate,
    StaffDeactivationOverrideDecision,
    StaffDeactivationOverrideResponse,
    StaffDeactivationReadiness,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.services.staff_deactivation_service import (
    build_staff_deactivation_readiness,
    create_staff_deactivation_override,
    expire_staff_deactivation_overrides,
)
from app.utils.auth import require_permission
from app.utils.domain_errors import DomainHTTPException


router = APIRouter(prefix="/staff", tags=["Staff Overrides"])
VALID_STATUSES = {
    "pending",
    "approved",
    "rejected",
    "consumed",
    "expired",
    "stale",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _response(
    request: StaffDeactivationOverride,
) -> StaffDeactivationOverrideResponse:
    if request.status == "pending":
        actions = ["approve", "reject"]
    elif request.status == "approved":
        actions = ["use_for_deactivation"]
    elif request.status in {"rejected", "expired", "stale"}:
        actions = ["request_again"]
    else:
        actions = []
    response = StaffDeactivationOverrideResponse.model_validate(request)
    return response.model_copy(update={"available_actions": actions})


@router.get(
    "/deactivation-readiness/{staff_role}/{staff_id}",
    response_model=StaffDeactivationReadiness,
)
def get_staff_deactivation_readiness(
    staff_role: str,
    staff_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(
        require_permission("staff_overrides.request")
    ),
):
    return build_staff_deactivation_readiness(
        db,
        staff_role=staff_role.strip().lower(),
        staff_id=staff_id,
    )


@router.post(
    "/deactivation-overrides",
    response_model=StaffDeactivationOverrideResponse,
)
def request_staff_deactivation_override(
    payload: StaffDeactivationOverrideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("staff_overrides.request")
    ),
):
    try:
        request = create_staff_deactivation_override(
            db,
            staff_role=payload.staff_role,
            staff_id=payload.staff_id,
            reason=payload.reason,
            evidence_refs=payload.evidence_refs,
            actor=current_user,
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        request = db.query(StaffDeactivationOverride).filter(
            StaffDeactivationOverride.active_key
            == f"staff_deactivation:{payload.staff_role}:{payload.staff_id}"
        ).first()
        if request is None:
            raise HTTPException(
                status_code=409,
                detail="A deactivation override was created concurrently. Refresh and try again.",
            ) from error
    db.refresh(request)
    return _response(request)


@router.get(
    "/deactivation-overrides",
    response_model=list[StaffDeactivationOverrideResponse],
)
def list_staff_deactivation_overrides(
    status: str = Query(default="pending"),
    staff_role: str | None = Query(default=None),
    staff_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user: User = Depends(
        require_permission("staff_overrides.decide")
    ),
):
    normalized_status = status.strip().lower()
    if normalized_status != "all" and normalized_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid override status.")
    normalized_role = staff_role.strip().lower() if staff_role else None
    if normalized_role not in {None, "doctor", "therapist"}:
        raise HTTPException(status_code=422, detail="Invalid staff role.")

    expire_staff_deactivation_overrides(db)
    db.commit()
    query = db.query(StaffDeactivationOverride)
    if normalized_status != "all":
        query = query.filter(
            StaffDeactivationOverride.status == normalized_status
        )
    if normalized_role:
        query = query.filter(
            StaffDeactivationOverride.subject_role == normalized_role
        )
    if staff_id is not None:
        query = query.filter(StaffDeactivationOverride.subject_id == staff_id)
    requests = query.order_by(
        StaffDeactivationOverride.created_at.desc(),
        StaffDeactivationOverride.id.desc(),
    ).limit(limit).all()
    return [_response(request) for request in requests]


@router.put(
    "/deactivation-overrides/{request_id}/decision",
    response_model=StaffDeactivationOverrideResponse,
)
def decide_staff_deactivation_override(
    request_id: int,
    payload: StaffDeactivationOverrideDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("staff_overrides.decide")
    ),
):
    request = db.query(StaffDeactivationOverride).filter(
        StaffDeactivationOverride.id == request_id
    ).with_for_update().first()
    if request is None:
        raise HTTPException(status_code=404, detail="Override request not found.")
    if request.version != payload.version:
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_OVERRIDE_VERSION_CONFLICT",
            message="This override changed after it was opened. Refresh and review again.",
            recoverable=True,
            suggested_action="refresh_override_request",
            blocking_fields=["version"],
        )
    if request.status != "pending":
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_OVERRIDE_ALREADY_REVIEWED",
            message=f"This override is already {request.status}.",
            recoverable=True,
            suggested_action="refresh_override_request",
        )
    if _as_utc(request.expires_at) <= _utc_now():
        request.status = "expired"
        request.active_key = None
        request.version += 1
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_deactivation_override",
            entity_id=request.id,
            action="expired_during_review",
            from_state="pending",
            to_state="expired",
            reason_code="approval_window_expired",
            related_entity_type=f"{request.subject_role}_profile",
            related_entity_id=request.subject_id,
        )
        db.commit()
        raise DomainHTTPException(
            status_code=410,
            code="STAFF_OVERRIDE_EXPIRED",
            message="This override request has expired.",
            recoverable=True,
            suggested_action="request_override",
        )

    readiness = build_staff_deactivation_readiness(
        db,
        staff_role=request.subject_role,
        staff_id=request.subject_id,
        lock_subject=True,
    )
    if (
        readiness.condition_fingerprint != request.condition_fingerprint
        or readiness.hard_blockers
    ):
        request.status = "stale"
        request.active_key = None
        request.version += 1
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_deactivation_override",
            entity_id=request.id,
            action="stale_during_review",
            from_state="pending",
            to_state="stale",
            reason_code="operational_conditions_changed",
            related_entity_type=f"{request.subject_role}_profile",
            related_entity_id=request.subject_id,
        )
        db.commit()
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_CONDITIONS_CHANGED",
            message="Operational impacts changed. Refresh readiness and request a new review.",
            recoverable=True,
            suggested_action="request_override",
            blocking_fields=["condition_fingerprint"],
        )

    prior_status = request.status
    request.status = payload.decision
    request.decided_by = current_user.id
    request.decision_reason = payload.reason.strip()
    request.decided_at = _utc_now()
    request.version += 1
    if payload.decision == "rejected":
        request.active_key = None
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="administration",
        entity_type="staff_deactivation_override",
        entity_id=request.id,
        action=payload.decision,
        from_state=prior_status,
        to_state=payload.decision,
        reason_code=f"review_{payload.decision}",
        reason=payload.reason,
        related_entity_type=f"{request.subject_role}_profile",
        related_entity_id=request.subject_id,
        details={"review_version": request.version},
    )
    db.commit()
    db.refresh(request)
    return _response(request)
