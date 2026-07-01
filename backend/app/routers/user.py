from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import TherapistResponse, TherapistUpdate
from app.utils.auth import hash_password, require_role



router = APIRouter()

@router.get("/therapists", response_model=list[TherapistResponse])
def get_therapists(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    therapists = db.query(User).filter(User.role == "therapist", User.is_active == True).all()
    return therapists


@router.get(
    "/therapists/manage",
    response_model=list[TherapistResponse],
)
def get_managed_therapists(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    return (
        db.query(User)
        .filter(User.role == "therapist")
        .order_by(User.username.asc())
        .all()
    )


@router.get(
    "/therapists/{therapist_id}",
    response_model=TherapistResponse,
)
def get_therapist(
    therapist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    therapist = (
        db.query(User)
        .filter(
            User.id == therapist_id,
            User.role == "therapist",
        )
        .first()
    )
    if therapist is None:
        raise HTTPException(status_code=404, detail="Therapist not found")
    return therapist


@router.put(
    "/therapists/{therapist_id}",
    response_model=TherapistResponse,
)
def update_therapist(
    therapist_id: int,
    payload: TherapistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    therapist = (
        db.query(User)
        .filter(
            User.id == therapist_id,
            User.role == "therapist",
        )
        .first()
    )
    if therapist is None:
        raise HTTPException(status_code=404, detail="Therapist not found")

    normalized_email = str(payload.email).strip().lower()
    duplicate_email = (
        db.query(User)
        .filter(
            User.id != therapist_id,
            func.lower(User.email) == normalized_email,
        )
        .first()
    )
    if duplicate_email is not None:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    therapist.username = payload.username.strip()
    therapist.email = normalized_email
    therapist.is_active = payload.is_active
    if payload.password:
        therapist.password_hash = hash_password(payload.password)

    try:
        db.commit()
        db.refresh(therapist)
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update therapist profile",
        ) from error

    return therapist
