from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_expense import DoctorExpense
from app.models.user import User
from app.schemas.doctor_claim import (
    DoctorClaimAdminHistoryResponse,
    DoctorClaimDashboardResponse,
    DoctorClaimDetailsResponse,
    DoctorClaimRejectRequest,
    DoctorClaimResponse,
)
from app.schemas.claim_readiness import DoctorClaimReadinessResponse
from app.utils.auth import (
    get_current_user,
    require_permission,
    require_role,
)
from app.utils.permissions import role_has_permission
from app.utils.uploads import resolve_stored_upload
from app.utils.workflow_transitions import (
    DOCTOR_CLAIM_STATUS_TRANSITIONS,
    validate_status_transition,
)
from app.utils.timezone import india_now
from app.utils.domain_errors import DomainHTTPException
from app.services.reimbursement_policy_service import (
    CALCULATION_VERSION,
    ROUNDING_MODE,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.services.claim_readiness_service import (
    build_doctor_claim_readiness,
    raise_for_claim_readiness,
)


router = APIRouter(
    prefix="/doctor-claims",
    tags=["Doctor Claims"],
)

ADMIN_HISTORY_STATUSES = {
    "pending",
    "approved",
    "rejected",
    "submitted",
}


def _get_current_doctor(db: Session, current_user: User) -> Doctor:
    doctor = (
        db.query(Doctor)
        .filter(Doctor.user_id == current_user.id)
        .first()
    )
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor profile is not linked to this user",
        )
    return doctor


@router.get(
    "/preview",
    response_model=DoctorClaimReadinessResponse,
)
def preview_doctor_claim(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    return build_doctor_claim_readiness(
        db,
        doctor_id=doctor.id,
        business_date=india_now().date(),
    ).response()


@router.post(
    "/submit",
    response_model=DoctorClaimDetailsResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_doctor_claim(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    today = india_now().date()

    try:
        doctor = _get_current_doctor(db, current_user)
        readiness = build_doctor_claim_readiness(
            db,
            doctor_id=doctor.id,
            business_date=today,
            lock=True,
        )
        existing_claim = readiness.existing_claim
        if (
            readiness.state == "already_submitted"
            and existing_claim is not None
        ):
            response.headers["X-Idempotent-Replay"] = "true"
            response.status_code = status.HTTP_200_OK
            return existing_claim

        raise_for_claim_readiness(readiness)
        expenses = readiness.eligible_records
        submitted_at = datetime.now(timezone.utc)

        prior_status = (
            existing_claim.status if existing_claim is not None else "draft"
        )
        claim = existing_claim or DoctorClaim(
            doctor_id=doctor.id,
            claim_date=today,
            submitted_at=submitted_at,
        )
        claim.total_amount = readiness.expense_total
        claim.expense_count = len(expenses)
        claim.status = "pending"
        claim.submitted_at = submitted_at
        claim.approved_at = None
        claim.approved_by = None
        claim.rejection_reason = None
        claim.calculation_version = CALCULATION_VERSION
        claim.rounding_mode = ROUNDING_MODE
        claim.included_expense_ids = [expense.id for expense in expenses]
        if existing_claim is not None:
            claim.revision = int(claim.revision or 1) + 1
        db.add(claim)
        db.flush()

        for expense in expenses:
            expense.claim_id = claim.id
            expense.status = "submitted"

        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="financial",
            entity_type="doctor_claim",
            entity_id=claim.id,
            action=("resubmitted" if existing_claim is not None else "submitted"),
            business_date=claim.claim_date,
            from_state=prior_status,
            to_state="pending",
            related_entity_type="doctor",
            related_entity_id=doctor.id,
            details={
                "revision": int(claim.revision or 1),
                "record_count": len(expenses),
            },
        )

        db.flush()
        db.refresh(claim)
        db.commit()
        return claim
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Doctor claim for today already exists",
        ) from error
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to submit doctor claim",
        ) from error


@router.get(
    "/my",
    response_model=list[DoctorClaimResponse],
)
def get_my_doctor_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    return (
        db.query(DoctorClaim)
        .filter(DoctorClaim.doctor_id == doctor.id)
        .order_by(
            DoctorClaim.claim_date.desc(),
            DoctorClaim.created_at.desc(),
        )
        .all()
    )


@router.get(
    "/pending",
    response_model=list[DoctorClaimResponse],
)
def get_pending_doctor_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.view")
    ),
):
    return (
        db.query(DoctorClaim)
        .filter(DoctorClaim.status == "pending")
        .order_by(DoctorClaim.submitted_at.asc())
        .all()
    )


@router.get(
    "/dashboard",
    response_model=DoctorClaimDashboardResponse,
)
def get_doctor_claim_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(["doctor", "admin"])
    ),
):
    query = db.query(DoctorClaim)
    if current_user.role == "doctor":
        doctor = _get_current_doctor(db, current_user)
        query = query.filter(
            DoctorClaim.doctor_id == doctor.id
        )

    return {
        "total_claims": query.count(),
        "pending_claims": query.filter(
            DoctorClaim.status == "pending"
        ).count(),
        "approved_claims": query.filter(
            DoctorClaim.status == "approved"
        ).count(),
        "rejected_claims": query.filter(
            DoctorClaim.status == "rejected"
        ).count(),
    }


@router.get(
    "/admin/history",
    response_model=list[DoctorClaimAdminHistoryResponse],
)
def get_admin_doctor_claim_history(
    status_filter: str | None = Query(None, alias="status"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    doctor_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    can_view_all = role_has_permission(
        current_user.role,
        "claims.view",
    )
    can_view_approved = role_has_permission(
        current_user.role,
        "claims.approved.view",
    )
    if not can_view_all and not can_view_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: claims.view",
        )
    if (
        not can_view_all
        and status_filter not in {None, "approved"}
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Finance can only view approved claims",
        )
    if not can_view_all:
        status_filter = "approved"

    if (
        status_filter is not None
        and status_filter not in ADMIN_HISTORY_STATUSES
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Status must be pending, approved, rejected, "
                "or submitted"
            ),
        )
    if (
        from_date is not None
        and to_date is not None
        and from_date > to_date
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date cannot be after to_date",
        )

    query = (
        db.query(DoctorClaim, Doctor.name)
        .join(Doctor, Doctor.id == DoctorClaim.doctor_id)
    )
    if status_filter is not None:
        query = query.filter(
            DoctorClaim.status == status_filter
        )
    if from_date is not None:
        query = query.filter(
            DoctorClaim.claim_date >= from_date
        )
    if to_date is not None:
        query = query.filter(
            DoctorClaim.claim_date <= to_date
        )
    if doctor_id is not None:
        query = query.filter(
            DoctorClaim.doctor_id == doctor_id
        )

    rows = query.order_by(
        DoctorClaim.claim_date.desc(),
        DoctorClaim.created_at.desc(),
    ).all()

    history = []
    for claim, doctor_name in rows:
        claim_data = DoctorClaimResponse.model_validate(
            claim
        ).model_dump()
        claim_data["doctor_name"] = doctor_name
        history.append(claim_data)

    return history


@router.get(
    "/{claim_id}/proof/{expense_id}",
    response_class=FileResponse,
)
def download_doctor_claim_expense_proof(
    claim_id: int,
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = (
        db.query(DoctorClaim)
        .filter(DoctorClaim.id == claim_id)
        .first()
    )
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor claim not found",
        )

    if current_user.role == "doctor":
        doctor = _get_current_doctor(db, current_user)
        if claim.doctor_id != doctor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to download this proof",
            )
    elif not (
        role_has_permission(current_user.role, "claims.view")
        or (
            claim.status == "approved"
            and role_has_permission(
                current_user.role,
                "claims.approved.view",
            )
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to download this proof",
        )

    expense = (
        db.query(DoctorExpense)
        .filter(
            DoctorExpense.id == expense_id,
            DoctorExpense.claim_id == claim.id,
            DoctorExpense.doctor_id == claim.doctor_id,
        )
        .first()
    )
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense is not linked to this claim",
        )
    if not expense.proof_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proof file not found",
        )

    try:
        proof_path = resolve_stored_upload(
            expense.proof_file,
            subdirectory="doctor_expenses",
        )
    except (OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proof file not found",
        )

    if not proof_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proof file not found",
        )

    return FileResponse(
        path=proof_path,
        filename=f"expense-{expense.id}-proof{proof_path.suffix}",
    )


@router.get(
    "/{claim_id}",
    response_model=DoctorClaimDetailsResponse,
)
def get_doctor_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = (
        _get_current_doctor(db, current_user)
        if current_user.role == "doctor"
        else None
    )
    claim = (
        db.query(DoctorClaim)
        .options(selectinload(DoctorClaim.expenses))
        .filter(DoctorClaim.id == claim_id)
        .first()
    )
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor claim not found",
        )
    owns_claim = (
        doctor is not None
        and claim.doctor_id == doctor.id
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this claim",
        )

    return claim


@router.put(
    "/{claim_id}/approve",
    response_model=DoctorClaimResponse,
)
def approve_doctor_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.approve")
    ),
):
    try:
        claim = (
            db.query(DoctorClaim)
            .filter(DoctorClaim.id == claim_id)
            .with_for_update()
            .first()
        )
        if claim is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor claim not found",
            )
        validate_status_transition(
            entity="Doctor claim status",
            current_status=claim.status,
            next_status="approved",
            transitions=DOCTOR_CLAIM_STATUS_TRANSITIONS,
        )

        prior_status = claim.status
        claim.status = "approved"
        claim.approved_at = datetime.now(timezone.utc)
        claim.approved_by = current_user.id
        claim.rejection_reason = None
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="financial",
            entity_type="doctor_claim",
            entity_id=claim.id,
            action="approved",
            business_date=claim.claim_date,
            from_state=prior_status,
            to_state="approved",
            related_entity_type="doctor",
            related_entity_id=claim.doctor_id,
            details={"revision": int(claim.revision or 1)},
        )

        db.flush()
        db.refresh(claim)
        db.commit()
        return claim
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to approve doctor claim",
        ) from error


@router.put(
    "/{claim_id}/reject",
    response_model=DoctorClaimResponse,
)
def reject_doctor_claim(
    claim_id: int,
    reject_data: DoctorClaimRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.reject")
    ),
):
    try:
        claim = (
            db.query(DoctorClaim)
            .filter(DoctorClaim.id == claim_id)
            .with_for_update()
            .first()
        )
        if claim is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor claim not found",
            )
        validate_status_transition(
            entity="Doctor claim status",
            current_status=claim.status,
            next_status="rejected",
            transitions=DOCTOR_CLAIM_STATUS_TRANSITIONS,
        )

        prior_status = claim.status
        expenses = (
            db.query(DoctorExpense)
            .filter(DoctorExpense.claim_id == claim.id)
            .with_for_update()
            .all()
        )
        for expense in expenses:
            expense.status = "draft"
            expense.claim_id = None

        claim.status = "rejected"
        claim.approved_at = None
        claim.approved_by = None
        claim.rejection_reason = (
            reject_data.rejection_reason.strip()
        )
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="financial",
            entity_type="doctor_claim",
            entity_id=claim.id,
            action="changes_requested",
            business_date=claim.claim_date,
            from_state=prior_status,
            to_state="rejected",
            reason_code="review_changes_requested",
            reason=reject_data.rejection_reason,
            related_entity_type="doctor",
            related_entity_id=claim.doctor_id,
            details={
                "revision": int(claim.revision or 1),
                "released_record_count": len(expenses),
            },
        )

        db.flush()
        db.refresh(claim)
        db.commit()
        return claim
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to reject doctor claim",
        ) from error
