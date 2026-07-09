from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.doctor import Doctor
from app.models.user import User
from app.schemas.doctor import DoctorCreate, DoctorResponse, DoctorUpdate
from app.utils.auth import hash_password, require_role
from sqlalchemy import func


router = APIRouter(
    prefix="/doctors",
    tags=["Doctors"]
)


def validate_doctor_user(
    db: Session,
    user_id: int,
    doctor_id: int | None = None,
) -> None:
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )
    if user.role != "doctor":
        raise HTTPException(
            status_code=400,
            detail="Only users with role 'doctor' can be linked",
        )

    duplicate = db.query(Doctor).filter(
        Doctor.user_id == user_id
    )
    if doctor_id is not None:
        duplicate = duplicate.filter(Doctor.id != doctor_id)
    if duplicate.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="Doctor user is already linked to another profile",
        )


@router.post(
    "/",
    response_model=DoctorResponse
)
def create_doctor(
    doctor: DoctorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    normalized_name = doctor.name.strip()
    existing_doctor = (
        db.query(Doctor)
        .filter(func.lower(Doctor.name) == normalized_name.lower())
        .first()
    )
    if existing_doctor:
        raise HTTPException(status_code=400, detail="Doctor with this name already exists")
    validate_doctor_user(db, doctor.user_id)
    new_doctor = Doctor(
        user_id=doctor.user_id,
        name=normalized_name,
        specialization=(
            doctor.specialization.strip()
            if doctor.specialization
            else None
        ),
        phone=doctor.phone.strip() if doctor.phone else None,
    )
    try:
        db.add(new_doctor)
        db.flush()
        db.refresh(new_doctor)
        db.commit()
        return new_doctor
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Doctor user is already linked to another profile",
        ) from error
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to create doctor profile",
        ) from error


@router.get(
    "/",
    response_model=list[DoctorResponse]
)
def get_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(["admin", "therapist"])
    )
):
    doctors = db.query(Doctor).filter(Doctor.active.is_(True)).all()
    return doctors


@router.get(
    "/manage",
    response_model=list[DoctorResponse],
)
def get_managed_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    return db.query(Doctor).order_by(Doctor.name.asc()).all()


@router.get(
    "/{doctor_id}",
    response_model=DoctorResponse,
)
def get_doctor(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return doctor


@router.put(
    "/{doctor_id}",
    response_model=DoctorResponse,
)
def update_doctor(
    doctor_id: int,
    payload: DoctorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")

    normalized_name = payload.name.strip()
    duplicate = (
        db.query(Doctor)
        .filter(
            Doctor.id != doctor_id,
            func.lower(Doctor.name) == normalized_name.lower(),
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=400,
            detail="Doctor with this name already exists",
        )

    validate_doctor_user(db, payload.user_id, doctor.id)
    doctor.user_id = payload.user_id
    linked_user = db.query(User).filter(User.id == payload.user_id).first()
    if linked_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        normalized_email = str(payload.email).strip().lower()
        duplicate_email = (
            db.query(User)
            .filter(
                User.id != linked_user.id,
                func.lower(User.email) == normalized_email,
            )
            .first()
        )
        if duplicate_email is not None:
            raise HTTPException(
                status_code=400,
                detail="Email already registered",
            )
        linked_user.email = normalized_email

    if payload.password:
        linked_user.password_hash = hash_password(payload.password)

    doctor.name = normalized_name
    doctor.specialization = (
        payload.specialization.strip()
        if payload.specialization
        else None
    )
    doctor.phone = payload.phone.strip() if payload.phone else None
    doctor.active = payload.active

    try:
        db.commit()
        db.refresh(doctor)
        db.refresh(linked_user)
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update doctor profile",
        ) from error

    return doctor
