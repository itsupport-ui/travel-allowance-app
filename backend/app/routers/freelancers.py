from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.freelance_therapist import FreelanceTherapist
from app.models.user import User
from app.schemas.freelance import (
    FreelancerCreate,
    FreelancerResponse,
    FreelancerUpdate,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.services.freelance_link_service import normalize_phone
from app.utils.auth import require_permission

router = APIRouter(prefix="/freelancers", tags=["Freelancers"])


def _audit(db: Session, user: User, freelancer, action: str) -> None:
    record_domain_audit_event(
        db,
        actor_id=user.id,
        actor_role=user.role,
        domain="clinical",
        entity_type="freelance_therapist",
        entity_id=freelancer.id,
        action=action,
    )


@router.post(
    "",
    response_model=FreelancerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_freelancer(
    payload: FreelancerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelancers.manage")),
):
    existing = (
        db.query(FreelanceTherapist)
        .filter(FreelanceTherapist.phone == payload.phone)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{existing.name} is already in the directory with this "
                "mobile number."
            ),
        )
    freelancer = FreelanceTherapist(
        name=payload.name.strip(),
        phone=payload.phone,
        upi_id=payload.upi_id.strip() if payload.upi_id else None,
        created_by=current_user.id,
    )
    db.add(freelancer)
    db.flush()
    _audit(db, current_user, freelancer, "created")
    db.commit()
    db.refresh(freelancer)
    return freelancer


@router.get("", response_model=list[FreelancerResponse])
def list_freelancers(
    q: str | None = Query(default=None, max_length=50),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("freelancers.manage")),
):
    query = db.query(FreelanceTherapist)
    if not include_inactive:
        query = query.filter(FreelanceTherapist.active.is_(True))
    if q:
        term = q.strip()
        digits = "".join(ch for ch in term if ch.isdigit())
        like = f"%{term.lower()}%"
        condition = FreelanceTherapist.name.ilike(like)
        if digits:
            condition = condition | FreelanceTherapist.phone.contains(digits)
        query = query.filter(condition)
    return query.order_by(FreelanceTherapist.name).limit(200).all()


@router.get("/lookup", response_model=FreelancerResponse | None)
def lookup_by_phone(
    phone: str = Query(...),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("freelancers.manage")),
):
    try:
        normalized = normalize_phone(phone)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return (
        db.query(FreelanceTherapist)
        .filter(FreelanceTherapist.phone == normalized)
        .first()
    )


@router.put("/{freelancer_id}", response_model=FreelancerResponse)
def update_freelancer(
    freelancer_id: int,
    payload: FreelancerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelancers.manage")),
):
    freelancer = db.get(FreelanceTherapist, freelancer_id)
    if freelancer is None:
        raise HTTPException(status_code=404, detail="Freelancer not found.")
    if payload.name is not None:
        freelancer.name = payload.name.strip()
    if payload.upi_id is not None:
        freelancer.upi_id = payload.upi_id.strip() or None
    if payload.active is not None:
        freelancer.active = payload.active
    _audit(db, current_user, freelancer, "updated")
    db.commit()
    db.refresh(freelancer)
    return freelancer
