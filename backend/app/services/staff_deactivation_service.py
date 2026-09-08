from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.staff_deactivation_override import StaffDeactivationOverride
from app.models.therapist_workday import TherapistWorkDay
from app.models.travel import TravelEntry
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.schemas.staff_override import (
    StaffDeactivationCondition,
    StaffDeactivationReadiness,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.domain_errors import DomainHTTPException
from app.utils.timezone import india_now


RULE_CODE = "STAFF_DEACTIVATION_WITH_OPEN_IMPACTS"
OVERRIDE_LIFETIME_HOURS = 24


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _active_key(staff_role: str, staff_id: int) -> str:
    return f"staff_deactivation:{staff_role}:{staff_id}"


def _fingerprint(business_date: str, counts: dict[str, int]) -> str:
    serialized = json.dumps(
        {"business_date": business_date, "counts": counts},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _condition(code: str, count: int, message: str) -> StaffDeactivationCondition:
    return StaffDeactivationCondition(code=code, count=count, message=message)


def _resolve_subject(
    db: Session,
    *,
    staff_role: str,
    staff_id: int,
    lock: bool = False,
) -> tuple[User, Doctor | None]:
    if staff_role == "therapist":
        query = db.query(User).filter(
            User.id == staff_id,
            User.role == "therapist",
        )
        if lock:
            query = query.with_for_update()
        therapist = query.first()
        if therapist is None:
            raise DomainHTTPException(
                status_code=404,
                code="STAFF_NOT_FOUND",
                message="Therapist profile not found.",
                recoverable=False,
            )
        return therapist, None

    if staff_role != "doctor":
        raise DomainHTTPException(
            status_code=422,
            code="INVALID_STAFF_ROLE",
            message="Staff role must be doctor or therapist.",
            recoverable=False,
            blocking_fields=["staff_role"],
        )
    query = db.query(Doctor).filter(Doctor.id == staff_id)
    if lock:
        query = query.with_for_update()
    doctor = query.first()
    if doctor is None:
        raise DomainHTTPException(
            status_code=404,
            code="STAFF_NOT_FOUND",
            message="Doctor profile not found.",
            recoverable=False,
        )
    user = db.query(User).filter(User.id == doctor.user_id).first()
    if user is None:
        raise DomainHTTPException(
            status_code=409,
            code="DOCTOR_LOGIN_MISSING",
            message="The doctor profile is not linked to a valid login account.",
            recoverable=True,
            suggested_action="repair_doctor_login",
        )
    return user, doctor


def build_staff_deactivation_readiness(
    db: Session,
    *,
    staff_role: str,
    staff_id: int,
    lock_subject: bool = False,
) -> StaffDeactivationReadiness:
    user, doctor = _resolve_subject(
        db,
        staff_role=staff_role,
        staff_id=staff_id,
        lock=lock_subject,
    )
    today = india_now().date()
    captured_at = _utc_now()
    is_active = bool(user.is_active) if doctor is None else bool(doctor.active)

    if staff_role == "therapist":
        counts = {
            "active_workdays": db.query(TherapistWorkDay).filter(
                TherapistWorkDay.therapist_id == staff_id,
                TherapistWorkDay.is_active.is_(True),
            ).count(),
            "active_sessions": db.query(TreatmentSchedule).filter(
                TreatmentSchedule.therapist_id == staff_id,
                TreatmentSchedule.status == "scheduled",
                TreatmentSchedule.session_status == "IN_PROGRESS",
            ).count(),
            "future_assignments": db.query(TreatmentSchedule).filter(
                TreatmentSchedule.therapist_id == staff_id,
                TreatmentSchedule.status == "scheduled",
                func.coalesce(
                    TreatmentSchedule.occurrence_date,
                    TreatmentSchedule.treatment_date,
                    TreatmentSchedule.start_date,
                )
                >= today,
            ).count(),
            "draft_financial_records": db.query(TravelEntry).filter(
                TravelEntry.therapist_id == staff_id,
                TravelEntry.claim_id.is_(None),
                TravelEntry.status == "draft",
            ).count(),
            "pending_reviews": db.query(TravelEntry).filter(
                TravelEntry.therapist_id == staff_id,
                TravelEntry.manual_review_status.in_(
                    ["pending", "changes_requested"]
                ),
            ).count(),
            "pending_claims": db.query(Claim).filter(
                Claim.therapist_id == staff_id,
                Claim.status == "pending",
            ).count(),
        }
    else:
        assert doctor is not None
        counts = {
            "active_workdays": db.query(DoctorWorkDay).filter(
                DoctorWorkDay.doctor_id == doctor.id,
                DoctorWorkDay.is_active.is_(True),
            ).count(),
            "active_sessions": db.query(DoctorVisit).filter(
                DoctorVisit.doctor_id == doctor.id,
                DoctorVisit.status == "scheduled",
                DoctorVisit.session_status == "IN_PROGRESS",
            ).count(),
            "future_assignments": (
                db.query(DoctorVisit).filter(
                    DoctorVisit.doctor_id == doctor.id,
                    DoctorVisit.status == "scheduled",
                    DoctorVisit.visit_date >= today,
                ).count()
                + db.query(DoctorConsultation).filter(
                    DoctorConsultation.doctor_id == doctor.id,
                    DoctorConsultation.status == "scheduled",
                    DoctorConsultation.scheduled_date >= today,
                ).count()
            ),
            "draft_financial_records": db.query(DoctorExpense).filter(
                DoctorExpense.doctor_id == doctor.id,
                DoctorExpense.claim_id.is_(None),
                DoctorExpense.status == "draft",
            ).count(),
            "pending_reviews": (
                db.query(DoctorExpense).filter(
                    DoctorExpense.doctor_id == doctor.id,
                    DoctorExpense.manual_review_status.in_(
                        ["pending", "changes_requested"]
                    ),
                ).count()
                + db.query(TreatmentPlan).filter(
                    TreatmentPlan.doctor_id == doctor.id,
                    TreatmentPlan.status == "submitted",
                ).count()
            ),
            "pending_claims": db.query(DoctorClaim).filter(
                DoctorClaim.doctor_id == doctor.id,
                DoctorClaim.status == "pending",
            ).count(),
        }

    hard_blockers = []
    if counts["active_workdays"]:
        hard_blockers.append(
            _condition(
                "ACTIVE_WORKDAY",
                counts["active_workdays"],
                "End the active workday before deactivating this profile.",
            )
        )
    if counts["active_sessions"]:
        hard_blockers.append(
            _condition(
                "ACTIVE_CLINICAL_SESSION",
                counts["active_sessions"],
                "Complete or safely close the active clinical session first.",
            )
        )

    operational_impacts = []
    impact_definitions = (
        (
            "FUTURE_ASSIGNMENTS",
            "future_assignments",
            "Future appointments or schedules must be reviewed and reassigned.",
        ),
        (
            "DRAFT_FINANCIAL_RECORDS",
            "draft_financial_records",
            "Unclaimed draft travel or expense records will remain for follow-up.",
        ),
        (
            "PENDING_REVIEWS",
            "pending_reviews",
            "Manual financial or clinical reviews still require a decision.",
        ),
        (
            "PENDING_CLAIMS",
            "pending_claims",
            "Submitted claims still require a reviewer decision.",
        ),
    )
    for code, count_key, message in impact_definitions:
        if counts[count_key]:
            operational_impacts.append(
                _condition(code, counts[count_key], message)
            )

    if not is_active:
        readiness_state = "already_inactive"
        available_actions = ["activate"]
        next_action = None
    elif hard_blockers:
        readiness_state = "hard_blocked"
        available_actions = [
            "end_active_workday",
            "complete_active_session",
            "refresh_readiness",
        ]
        next_action = available_actions[0]
    elif operational_impacts:
        readiness_state = "override_required"
        available_actions = ["request_override", "resolve_impacts"]
        next_action = "request_override"
    else:
        readiness_state = "ready"
        available_actions = ["deactivate"]
        next_action = "deactivate"

    return StaffDeactivationReadiness(
        staff_role=staff_role,
        staff_id=staff_id,
        current_state="active" if is_active else "inactive",
        readiness_state=readiness_state,
        business_date=today,
        captured_at=captured_at,
        condition_fingerprint=_fingerprint(today.isoformat(), counts),
        hard_blockers=hard_blockers,
        operational_impacts=operational_impacts,
        available_actions=available_actions,
        next_action=next_action,
    )


def expire_staff_deactivation_overrides(db: Session) -> None:
    now = _utc_now()
    active = db.query(StaffDeactivationOverride).filter(
        StaffDeactivationOverride.status.in_(["pending", "approved"]),
        StaffDeactivationOverride.active_key.is_not(None),
    ).all()
    for request in active:
        if _as_utc(request.expires_at) <= now:
            prior_status = request.status
            request.status = "expired"
            request.active_key = None
            request.version += 1
            record_domain_audit_event(
                db,
                actor_id=request.requested_by,
                domain="administration",
                entity_type="staff_deactivation_override",
                entity_id=request.id,
                action="expired",
                from_state=prior_status,
                to_state="expired",
                reason_code="approval_window_expired",
                related_entity_type=f"{request.subject_role}_profile",
                related_entity_id=request.subject_id,
            )


def create_staff_deactivation_override(
    db: Session,
    *,
    staff_role: str,
    staff_id: int,
    reason: str,
    evidence_refs: list[str],
    actor: User,
) -> StaffDeactivationOverride:
    expire_staff_deactivation_overrides(db)
    readiness = build_staff_deactivation_readiness(
        db,
        staff_role=staff_role,
        staff_id=staff_id,
        lock_subject=True,
    )
    if readiness.current_state == "inactive":
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_ALREADY_INACTIVE",
            message="This staff profile is already inactive.",
            recoverable=True,
            suggested_action="refresh_staff_profile",
        )
    if readiness.hard_blockers:
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_HARD_BLOCKED",
            message="Active work must be closed before an override can be requested.",
            recoverable=True,
            suggested_action=readiness.next_action,
            blocking_fields=[item.code for item in readiness.hard_blockers],
        )
    if not readiness.operational_impacts:
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_OVERRIDE_NOT_REQUIRED",
            message="No override is required. Record a reason and deactivate directly.",
            recoverable=True,
            suggested_action="deactivate",
        )

    active_key = _active_key(staff_role, staff_id)
    existing = db.query(StaffDeactivationOverride).filter(
        StaffDeactivationOverride.active_key == active_key,
    ).with_for_update().first()
    if existing is not None:
        if existing.condition_fingerprint == readiness.condition_fingerprint:
            return existing
        prior_status = existing.status
        existing.status = "stale"
        existing.active_key = None
        existing.version += 1
        record_domain_audit_event(
            db,
            actor_id=actor.id,
            actor_role=actor.role,
            domain="administration",
            entity_type="staff_deactivation_override",
            entity_id=existing.id,
            action="superseded",
            from_state=prior_status,
            to_state="stale",
            reason_code="operational_conditions_changed",
            related_entity_type=f"{staff_role}_profile",
            related_entity_id=staff_id,
        )

    captured_conditions = {
        "business_date": readiness.business_date.isoformat(),
        "hard_blockers": [item.model_dump() for item in readiness.hard_blockers],
        "operational_impacts": [
            item.model_dump() for item in readiness.operational_impacts
        ],
    }
    request = StaffDeactivationOverride(
        rule_code=RULE_CODE,
        subject_role=staff_role,
        subject_id=staff_id,
        requested_by=actor.id,
        request_reason=reason.strip(),
        evidence_refs=evidence_refs,
        captured_conditions=captured_conditions,
        condition_fingerprint=readiness.condition_fingerprint,
        before_state={"staff_status": "active"},
        status="pending",
        active_key=active_key,
        expires_at=_utc_now() + timedelta(hours=OVERRIDE_LIFETIME_HOURS),
    )
    db.add(request)
    db.flush()
    record_domain_audit_event(
        db,
        actor_id=actor.id,
        actor_role=actor.role,
        domain="administration",
        entity_type="staff_deactivation_override",
        entity_id=request.id,
        action="requested",
        from_state="not_requested",
        to_state="pending",
        reason_code=RULE_CODE.lower(),
        reason=reason,
        related_entity_type=f"{staff_role}_profile",
        related_entity_id=staff_id,
        details={
            "impact_codes": [
                item.code for item in readiness.operational_impacts
            ],
            "evidence_reference_count": len(evidence_refs),
        },
    )
    return request


def consume_staff_deactivation_override(
    db: Session,
    *,
    staff_role: str,
    staff_id: int,
    override_request_id: int | None,
    deactivation_reason: str | None,
    actor: User,
) -> StaffDeactivationOverride | None:
    if not deactivation_reason or len(deactivation_reason.strip()) < 10:
        raise DomainHTTPException(
            status_code=422,
            code="DEACTIVATION_REASON_REQUIRED",
            message="Enter a deactivation reason of at least 10 characters.",
            recoverable=True,
            suggested_action="enter_deactivation_reason",
            blocking_fields=["deactivation_reason"],
        )
    expire_staff_deactivation_overrides(db)
    readiness = build_staff_deactivation_readiness(
        db,
        staff_role=staff_role,
        staff_id=staff_id,
        lock_subject=True,
    )
    if readiness.hard_blockers:
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_HARD_BLOCKED",
            message="Active work must be closed before this profile can be deactivated.",
            recoverable=True,
            suggested_action=readiness.next_action,
            blocking_fields=[item.code for item in readiness.hard_blockers],
        )
    if not readiness.operational_impacts:
        return None
    if override_request_id is None:
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_OVERRIDE_REQUIRED",
            message="Open operational impacts require an approved override.",
            recoverable=True,
            suggested_action="request_override",
            blocking_fields=[
                item.code for item in readiness.operational_impacts
            ],
        )

    request = db.query(StaffDeactivationOverride).filter(
        StaffDeactivationOverride.id == override_request_id,
        StaffDeactivationOverride.subject_role == staff_role,
        StaffDeactivationOverride.subject_id == staff_id,
    ).with_for_update().first()
    if request is None:
        raise DomainHTTPException(
            status_code=404,
            code="STAFF_DEACTIVATION_OVERRIDE_NOT_FOUND",
            message="The selected deactivation override was not found.",
            recoverable=True,
            suggested_action="refresh_override_request",
        )
    if request.status != "approved":
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_OVERRIDE_NOT_APPROVED",
            message=f"This deactivation override is {request.status}.",
            recoverable=True,
            suggested_action="review_override_request",
            blocking_fields=["override_request_id"],
        )
    if _as_utc(request.expires_at) <= _utc_now():
        raise DomainHTTPException(
            status_code=410,
            code="STAFF_DEACTIVATION_OVERRIDE_EXPIRED",
            message="The approved deactivation override has expired.",
            recoverable=True,
            suggested_action="request_override",
        )
    if request.condition_fingerprint != readiness.condition_fingerprint:
        raise DomainHTTPException(
            status_code=409,
            code="STAFF_DEACTIVATION_CONDITIONS_CHANGED",
            message="Operational impacts changed after approval. Request a new review.",
            recoverable=True,
            suggested_action="request_override",
            blocking_fields=["condition_fingerprint"],
        )

    request.status = "consumed"
    request.active_key = None
    request.consumed_by = actor.id
    request.consumed_at = _utc_now()
    request.after_state = {
        "staff_status": "inactive",
        "deactivation_reason_recorded": True,
    }
    request.version += 1
    record_domain_audit_event(
        db,
        actor_id=actor.id,
        actor_role=actor.role,
        domain="administration",
        entity_type="staff_deactivation_override",
        entity_id=request.id,
        action="consumed",
        from_state="approved",
        to_state="consumed",
        reason_code=RULE_CODE.lower(),
        reason=deactivation_reason,
        related_entity_type=f"{staff_role}_profile",
        related_entity_id=staff_id,
        details={"decision_version": request.version},
    )
    return request
