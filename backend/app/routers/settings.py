from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.settings import Settings
from app.models.location_policy import LocationPolicy
from app.models.user import User
from app.schemas.settings import SettingsBase, SettingsResponse
from app.schemas.location_policy import (
    LocationPolicyResponse,
    LocationPolicyUpdate,
)
from app.services.location_policy_service import (
    get_location_policy,
    list_location_policies,
)
from app.services.reimbursement_policy_service import money
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.auth import get_current_user, require_role
from app.utils.timezone import india_now


router = APIRouter(prefix="/settings", tags=["Settings"])


def _ensure_initial_policy(db: Session) -> ReimbursementPolicy:
    policy = (
        db.query(ReimbursementPolicy)
        .order_by(ReimbursementPolicy.version.desc())
        .first()
    )
    if policy is not None:
        return policy
    legacy = db.query(Settings).first()
    policy = ReimbursementPolicy(
        version=1,
        effective_from=date(1970, 1, 1),
        per_km_rate=money(legacy.per_km_rate if legacy else 8),
        daily_allowance=money(legacy.daily_allowance if legacy else 150),
        doctor_receipt_threshold=money(500),
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def _policy_for_date(db: Session, business_date: date) -> ReimbursementPolicy:
    _ensure_initial_policy(db)
    return (
        db.query(ReimbursementPolicy)
        .filter(
            ReimbursementPolicy.effective_from <= business_date,
            (
                ReimbursementPolicy.effective_to.is_(None)
                | (ReimbursementPolicy.effective_to > business_date)
            ),
        )
        .order_by(
            ReimbursementPolicy.effective_from.desc(),
            ReimbursementPolicy.version.desc(),
        )
        .first()
    )


@router.get("/", response_model=SettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return _policy_for_date(db, india_now().date())


@router.get(
    "/reimbursement-policy/history",
    response_model=list[SettingsResponse],
)
def get_reimbursement_policy_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(["admin"])),
):
    _ensure_initial_policy(db)
    return (
        db.query(ReimbursementPolicy)
        .order_by(
            ReimbursementPolicy.effective_from.desc(),
            ReimbursementPolicy.version.desc(),
        )
        .limit(limit)
        .all()
    )


@router.put("/", response_model=SettingsResponse)
def update_settings(
    request: SettingsBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    _ensure_initial_policy(db)
    effective_from = request.effective_from or india_now().date()
    previous = (
        db.query(ReimbursementPolicy)
        .filter(
            ReimbursementPolicy.effective_from < effective_from,
            (
                ReimbursementPolicy.effective_to.is_(None)
                | (ReimbursementPolicy.effective_to > effective_from)
            ),
        )
        .order_by(
            ReimbursementPolicy.effective_from.desc(),
            ReimbursementPolicy.version.desc(),
        )
        .first()
    )
    if previous is not None and (
        previous.effective_to is None
        or previous.effective_to > effective_from
    ):
        previous.effective_to = effective_from

    same_day_policies = (
        db.query(ReimbursementPolicy)
        .filter(
            ReimbursementPolicy.effective_from == effective_from,
            (
                ReimbursementPolicy.effective_to.is_(None)
                | (ReimbursementPolicy.effective_to > effective_from)
            ),
        )
        .with_for_update()
        .all()
    )
    for same_day_policy in same_day_policies:
        same_day_policy.effective_to = effective_from

    next_policy = (
        db.query(ReimbursementPolicy)
        .filter(ReimbursementPolicy.effective_from > effective_from)
        .order_by(ReimbursementPolicy.effective_from.asc())
        .first()
    )

    latest_policy = (
        db.query(ReimbursementPolicy)
        .order_by(ReimbursementPolicy.version.desc())
        .with_for_update()
        .first()
    )
    inherited_receipt_threshold = money(
        request.doctor_receipt_threshold
        if request.doctor_receipt_threshold is not None
        else (
            previous.doctor_receipt_threshold
            if previous is not None
            else latest_policy.doctor_receipt_threshold
            if latest_policy is not None
            else 500
        )
    )
    next_version = int(latest_policy.version if latest_policy else 0) + 1
    policy = ReimbursementPolicy(
        version=next_version,
        effective_from=effective_from,
        per_km_rate=money(request.per_km_rate),
        daily_allowance=money(request.daily_allowance),
        doctor_receipt_threshold=inherited_receipt_threshold,
        effective_to=(
            next_policy.effective_from
            if next_policy is not None
            else None
        ),
        rounding_mode="ROUND_HALF_UP",
        created_by=current_user.id,
    )
    db.add(policy)
    db.flush()
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="configuration",
        entity_type="reimbursement_policy",
        entity_id=policy.id,
        action="version_created",
        from_state=(
            f"version_{latest_policy.version}"
            if latest_policy is not None
            else None
        ),
        to_state=f"version_{policy.version}",
        details={
            "version": policy.version,
            "effective_from": policy.effective_from.isoformat(),
            "effective_to": (
                policy.effective_to.isoformat()
                if policy.effective_to is not None
                else None
            ),
            "per_km_rate": str(policy.per_km_rate),
            "daily_allowance": str(policy.daily_allowance),
            "doctor_receipt_threshold": str(policy.doctor_receipt_threshold),
            "rounding_mode": policy.rounding_mode,
        },
    )
    db.commit()
    db.refresh(policy)
    return policy


@router.get(
    "/location-policy",
    response_model=LocationPolicyResponse,
)
def get_current_location_policy(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    policy = get_location_policy(db, india_now().date())
    db.commit()
    db.refresh(policy)
    return policy


@router.get(
    "/location-policy/history",
    response_model=list[LocationPolicyResponse],
)
def get_location_policy_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(["admin"])),
):
    policies = list_location_policies(db)[:limit]
    db.commit()
    return policies


@router.put(
    "/location-policy",
    response_model=LocationPolicyResponse,
)
def update_location_policy(
    request: LocationPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    today = india_now().date()
    effective_from = request.effective_from or today
    if effective_from < today:
        raise HTTPException(
            status_code=422,
            detail="Location policy changes must start today or on a future date.",
        )

    # Ensure tests and pre-migration development databases have a baseline.
    get_location_policy(db, today)
    previous = (
        db.query(LocationPolicy)
        .filter(
            LocationPolicy.effective_from < effective_from,
            (
                LocationPolicy.effective_to.is_(None)
                | (LocationPolicy.effective_to > effective_from)
            ),
        )
        .order_by(
            LocationPolicy.effective_from.desc(),
            LocationPolicy.version.desc(),
        )
        .first()
    )
    if previous is not None and (
        previous.effective_to is None
        or previous.effective_to > effective_from
    ):
        previous.effective_to = effective_from

    same_day_policies = (
        db.query(LocationPolicy)
        .filter(
            LocationPolicy.effective_from == effective_from,
            (
                LocationPolicy.effective_to.is_(None)
                | (LocationPolicy.effective_to > effective_from)
            ),
        )
        .with_for_update()
        .all()
    )
    for same_day_policy in same_day_policies:
        same_day_policy.effective_to = effective_from

    next_policy = (
        db.query(LocationPolicy)
        .filter(LocationPolicy.effective_from > effective_from)
        .order_by(LocationPolicy.effective_from.asc())
        .first()
    )
    latest_policy = (
        db.query(LocationPolicy)
        .order_by(LocationPolicy.version.desc())
        .with_for_update()
        .first()
    )
    policy = LocationPolicy(
        version=int(latest_policy.version if latest_policy else 0) + 1,
        effective_from=effective_from,
        effective_to=(
            next_policy.effective_from if next_policy is not None else None
        ),
        geofence_radius_m=request.geofence_radius_m,
        gps_accuracy_threshold_m=request.gps_accuracy_threshold_m,
        evidence_max_age_minutes=request.evidence_max_age_minutes,
        approval_valid_hours=request.approval_valid_hours,
        max_evidence_movement_m=request.max_evidence_movement_m,
        created_by=current_user.id,
    )
    db.add(policy)
    db.flush()
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="configuration",
        entity_type="location_policy",
        entity_id=policy.id,
        action="version_created",
        from_state=(
            f"version_{latest_policy.version}"
            if latest_policy is not None
            else None
        ),
        to_state=f"version_{policy.version}",
        details={
            "version": policy.version,
            "effective_from": policy.effective_from.isoformat(),
            "effective_to": (
                policy.effective_to.isoformat()
                if policy.effective_to is not None
                else None
            ),
            "geofence_radius_m": policy.geofence_radius_m,
            "gps_accuracy_threshold_m": policy.gps_accuracy_threshold_m,
            "evidence_max_age_minutes": policy.evidence_max_age_minutes,
            "approval_valid_hours": policy.approval_valid_hours,
            "max_evidence_movement_m": policy.max_evidence_movement_m,
        },
    )
    db.commit()
    db.refresh(policy)
    return policy
