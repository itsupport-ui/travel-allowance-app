import logging

from datetime import date, datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.claim import Claim
from app.models.user import User
from app.models.travel import TravelEntry
from app.schemas.claim import ClaimDetailsResponse, ClaimRejectRequest, ClaimResponse
from app.schemas.claim_readiness import TherapistClaimReadinessResponse
from app.utils.auth import (
    get_current_user,
    require_permission,
    require_role,
)
from app.utils.permissions import role_has_permission
from app.services.push_notification_service import notify_claim_status
from app.services.domain_audit_service import record_domain_audit_event
from app.services.claim_readiness_service import (
    build_therapist_claim_readiness,
    raise_for_claim_readiness,
)
from app.utils.workflow_transitions import (
    THERAPIST_CLAIM_STATUS_TRANSITIONS,
    validate_status_transition,
)
from app.utils.timezone import india_now
from app.utils.domain_errors import DomainHTTPException
from app.services.reimbursement_policy_service import (
    CALCULATION_VERSION,
    ROUNDING_MODE,
    money,
)


router = APIRouter(
    prefix="/claims",
    tags=["Claims"]
)

logger = logging.getLogger(__name__)


@router.get("/preview", response_model=TherapistClaimReadinessResponse)
def preview_claim(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    return build_therapist_claim_readiness(
        db,
        therapist_id=current_user.id,
        business_date=india_now().date(),
    ).response()


@router.post("/submit", response_model=ClaimResponse)
def submit_claim(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    today = india_now().date()
    readiness = build_therapist_claim_readiness(
        db,
        therapist_id=current_user.id,
        business_date=today,
        lock=True,
    )
    existing_claim = readiness.existing_claim

    if readiness.state == "already_submitted" and existing_claim is not None:
        response.headers["X-Idempotent-Replay"] = "true"
        return existing_claim

    raise_for_claim_readiness(readiness)
    travels = readiness.eligible_records
    policy = readiness.policy
    if policy is None:
        raise DomainHTTPException(
            status_code=409,
            code="REIMBURSEMENT_POLICY_UNAVAILABLE",
            message="No reimbursement policy is effective for today.",
            recoverable=True,
            suggested_action="contact_administrator",
            blocking_fields=["policy_id"],
        )
    per_km_rate = money(policy.per_km_rate)

    prior_status = existing_claim.status if existing_claim is not None else "draft"
    claim = existing_claim or Claim(
        therapist_id=current_user.id,
        claim_date=today,
    )
    claim.total_km = readiness.total_km
    claim.per_km_rate = per_km_rate
    claim.travel_total = readiness.travel_total
    claim.daily_allowance = readiness.daily_allowance
    claim.grand_total = readiness.grand_total
    claim.policy_id = policy.id
    claim.calculation_version = CALCULATION_VERSION
    claim.rounding_mode = ROUNDING_MODE
    claim.included_travel_ids = [travel.id for travel in travels]
    claim.patient_visited_today = readiness.patient_visited_today
    claim.status = "pending"
    claim.submitted_at = datetime.now(timezone.utc)
    claim.rejection_reason = None
    claim.reviewed_at = None
    claim.reviewed_by = None
    if existing_claim is not None:
        claim.revision = int(claim.revision or 1) + 1

    try:
        db.add(claim)
        db.flush()

        for travel in travels:
            travel.claim_id = claim.id
            travel.status = "submitted"

        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="financial",
            entity_type="therapist_claim",
            entity_id=claim.id,
            action=("resubmitted" if existing_claim is not None else "submitted"),
            business_date=claim.claim_date,
            from_state=prior_status,
            to_state="pending",
            related_entity_type="therapist",
            related_entity_id=current_user.id,
            details={
                "revision": int(claim.revision or 1),
                "record_count": len(travels),
            },
        )

        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Claim for today already exists",
        ) from error
    except Exception as error:
        db.rollback()
        logger.exception(
            "Unable to submit claim for therapist %s.",
            current_user.id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to submit today's claim.",
        ) from error

    return claim


@router.get("/pending", response_model=list[ClaimResponse])
def get_pending_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.view")
    )
):
    claims = db.query(Claim).filter(Claim.status == "pending").all()
    result = []

    for claim in claims:
        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "travel_total": claim.travel_total,
            "daily_allowance": claim.daily_allowance,
            "grand_total": claim.grand_total,
            "status": claim.status,
            "therapist_name": claim.therapist.username,
            "per_km_rate": claim.per_km_rate,
            "patient_count": len(db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all()),
            "patient_visited_today": claim.patient_visited_today
        }
        result.append(claim_data)

    return result


@router.put("/{claim_id}/approve", response_model=ClaimResponse)
def approve_claim(
    claim_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.approve")
    )
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    validate_status_transition(
        entity="Therapist claim status",
        current_status=claim.status,
        next_status="approved",
        transitions=THERAPIST_CLAIM_STATUS_TRANSITIONS,
    )

    prior_status = claim.status
    claim.status = "approved"
    claim.reviewed_at = datetime.now(timezone.utc)
    claim.reviewed_by = current_user.id
    claim.rejection_reason = None
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="financial",
        entity_type="therapist_claim",
        entity_id=claim.id,
        action="approved",
        business_date=claim.claim_date,
        from_state=prior_status,
        to_state="approved",
        related_entity_type="therapist",
        related_entity_id=claim.therapist_id,
        details={"revision": int(claim.revision or 1)},
    )
    db.commit()
    db.refresh(claim)
    background_tasks.add_task(
        notify_claim_status,
        claim.therapist_id,
        claim.id,
        "approved",
    )
    return claim


@router.put("/{claim_id}/reject", response_model=ClaimResponse)
def reject_claim(
    claim_id: int,
    reject_data: ClaimRejectRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.reject")
    )
):
    claim = (
        db.query(Claim)
        .filter(Claim.id == claim_id)
        .with_for_update()
        .first()
    )
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    validate_status_transition(
        entity="Therapist claim status",
        current_status=claim.status,
        next_status="rejected",
        transitions=THERAPIST_CLAIM_STATUS_TRANSITIONS,
    )

    prior_status = claim.status
    travels = (
        db.query(TravelEntry)
        .filter(TravelEntry.claim_id == claim.id)
        .with_for_update()
        .all()
    )
    for travel in travels:
        travel.claim_id = None
        travel.status = "draft"

    claim.status = "rejected"
    claim.rejection_reason = reject_data.rejection_reason
    claim.reviewed_at = datetime.now(timezone.utc)
    claim.reviewed_by = current_user.id
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="financial",
        entity_type="therapist_claim",
        entity_id=claim.id,
        action="changes_requested",
        business_date=claim.claim_date,
        from_state=prior_status,
        to_state="rejected",
        reason_code="review_changes_requested",
        reason=reject_data.rejection_reason,
        related_entity_type="therapist",
        related_entity_id=claim.therapist_id,
        details={
            "revision": int(claim.revision or 1),
            "released_record_count": len(travels),
        },
    )
    db.commit()
    db.refresh(claim)
    background_tasks.add_task(
        notify_claim_status,
        claim.therapist_id,
        claim.id,
        "rejected",
    )
    return claim


@router.get("/my", response_model=list[ClaimResponse])
def get_my_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    claims = (
        db.query(Claim)
        .filter(Claim.therapist_id == current_user.id)
        .order_by(Claim.claim_date.desc())
        .all()
    )

    result = []

    for claim in claims:

        patient_count = (
            db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).count()
        )
        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "per_km_rate": claim.per_km_rate,
            "travel_total": claim.travel_total,
            "daily_allowance": claim.daily_allowance,
            "grand_total": claim.grand_total,
            "status": claim.status,
            "therapist_name": claim.therapist.username,
            "patient_count": patient_count,
            "patient_visited_today": claim.patient_visited_today
        }
        result.append(claim_data)

    return result


@router.get("/all", response_model=list[ClaimResponse])
def get_all_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.view")
    )
):
    claims = db.query(Claim).order_by(Claim.claim_date.desc()).all()

    result = []

    for claim in claims:
        # Calculate the number of travel entries for the current claim
        patient_count = (
            len(db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all())
        )

        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "per_km_rate": claim.per_km_rate,
            "travel_total": claim.travel_total,
            "daily_allowance": claim.daily_allowance,
            "grand_total": claim.grand_total,
            "patient_visited_today": claim.patient_visited_today,
            "status": claim.status,
            "therapist_name": claim.therapist.username,
            "patient_count": patient_count,  # Integrated into the response dictionary
        }
        result.append(claim_data)

    return result
    
@router.get("/{claim_id}/details", response_model=ClaimDetailsResponse)
def get_claim_details(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    owns_claim = (
        current_user.role == "therapist"
        and claim.therapist_id == current_user.id
    )
    can_view_claims = role_has_permission(
        current_user.role,
        "claims.view",
    )
    can_view_approved = (
        claim.status == "approved"
        and role_has_permission(
            current_user.role,
            "claims.approved.view",
        )
    )
    if not (
        owns_claim
        or can_view_claims
        or can_view_approved
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    travels = (db.query(TravelEntry)
        .filter(TravelEntry.claim_id == claim.id)
        .order_by(TravelEntry.travel_date.asc(), TravelEntry.id.asc())
        .all()
    )

    return {

        "claim": {

        "id": claim.id,
        "therapist_id": claim.therapist_id,
        "therapist_name": claim.therapist.username,
        "therapist_role": claim.therapist.role,
        "claim_date": claim.claim_date,
        "submitted_at": claim.submitted_at,
        "total_km": claim.total_km,
        "per_km_rate": claim.per_km_rate,
        "travel_total": claim.travel_total,
        "daily_allowance": claim.daily_allowance,
        "grand_total": claim.grand_total,
        "status": claim.status,
        "notes": claim.remarks,
        "patient_count": len(travels),
        "rejection_reason": claim.rejection_reason,
        "reviewed_at": claim.reviewed_at,
        "reviewed_by": claim.reviewed_by,
        "revision": claim.revision,
    },

    "travels": [
        {
            "id": travel.id,
            "travel_date": travel.travel_date.date(),
            "travel_timestamp": travel.travel_date,
            "patient_name": travel.patient_name,
            "transport_mode": travel.transport_mode,
            "bill_amount": travel.bill_amount,
            "invoice_file": travel.invoice_file,
            "from_address": travel.from_address,
            "to_address": travel.to_address,
            "total_km": travel.total_km,
            "per_km_rate": travel.per_km_rate,
            "travel_fare": travel.travel_fare,
            "patient_visited": travel.patient_visited,
            "status": travel.status,
        }
        for travel in travels
    ]
    }


@router.get(
    "/history",
    response_model=
    list[ClaimResponse]
)
def get_claim_history(

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_permission("claims.view")
    )
):

    claims = (

        db.query(Claim)

        .filter(
            Claim.status
            !=
            "pending"
        )

        .order_by(
            Claim.claim_date.desc()
        )

        .all()
    )

    result = []

    for claim in claims:

        patient_count = (

            db.query(
                TravelEntry
            )

            .filter(
                TravelEntry.claim_id
                ==
                claim.id
            )

            .count()
        )

        claim_data = {

            "id":
            claim.id,

            "claim_date":
            claim.claim_date,

            "total_km":
            claim.total_km,

            "per_km_rate":
            claim.per_km_rate,

            "travel_total":
            claim.travel_total,

            "daily_allowance":
            claim.daily_allowance,

            "grand_total":
            claim.grand_total,

            "status":
            claim.status,

            "therapist_name":
            claim.therapist.username,

            "patient_count":
            patient_count
        }

        result.append(
            claim_data
        )

    return result



def create_auto_travel_claim(db, schedule, therapist):
    previous_schedule = (db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == therapist.id,
            TreatmentSchedule.status == "completed",
            TreatmentSchedule.treatment_date == india_now().date(),
            TreatmentSchedule.id != schedule.id
        )
        .order_by(TreatmentSchedule.completed_at.desc())
        .first()
    )

    from_address = ( previous_schedule.patient_address if previous_schedule else therapist.base_location)
    to_address = schedule.patient_address
    claim = Claim(
        therapist_id=therapist.id,
        schedule_id=schedule.id,
        claim_date=india_now().date(),
        from_address=from_address,
        to_address=to_address,
        patient_visited_today=True,
        total_km=0,
        travel_total=0,
        grand_total=0,
        auto_generated=True,
        source_type="auto",
        status="pending",
        remarks="Auto-generated from schedule"
    )

    db.add(claim)
    db.commit()
    db.refresh(claim)

    return claim
