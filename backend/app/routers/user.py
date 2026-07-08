from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.doctor import DoctorUserCreate
from app.schemas.user import (
    TherapistResponse,
    TherapistUpdate,
    UserResponse,
)
from app.utils.auth import (
    hash_password,
    require_permission,
    require_role,
)



router = APIRouter()


@router.post(
    "/users/doctors",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_user(
    payload: DoctorUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    normalized_email = str(payload.email).strip().lower()
    normalized_username = payload.username.strip()
    duplicate_username = (
        db.query(User)
        .filter(
            func.lower(User.username)
            == normalized_username.lower()
        )
        .first()
    )
    if duplicate_username is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    doctor_user = User(
        username=normalized_username,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        role="doctor",
        is_active=True,
    )

    try:
        db.add(doctor_user)
        db.flush()
        db.refresh(doctor_user)
        db.commit()
        return doctor_user
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        ) from error
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create doctor user",
        ) from error


@router.get("/therapists", response_model=list[TherapistResponse])
def get_therapists(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("schedules.create")
    )
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

    normalized_username = payload.username.strip()
    duplicate_username = (
        db.query(User)
        .filter(
            User.id != therapist_id,
            func.lower(User.username)
            == normalized_username.lower(),
        )
        .first()
    )
    if duplicate_username is not None:
        raise HTTPException(
            status_code=400,
            detail="Username already registered",
        )

    therapist.username = normalized_username
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
