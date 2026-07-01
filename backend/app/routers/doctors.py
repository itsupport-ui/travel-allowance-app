from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.doctor import Doctor
from app.models.user import User
from app.schemas.doctor import DoctorCreate, DoctorResponse, DoctorUpdate
from app.utils.auth import require_role
from sqlalchemy import func


router = APIRouter(
    prefix="/doctors",
    tags=["Doctors"]
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
    new_doctor = Doctor(
        name=normalized_name,
        specialization=(
            doctor.specialization.strip()
            if doctor.specialization
            else None
        ),
        phone=doctor.phone.strip() if doctor.phone else None,
    )
    db.add(new_doctor)
    db.commit()
    db.refresh(new_doctor)
    return new_doctor


@router.get(
    "/",
    response_model=list[DoctorResponse]
)
def get_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "therapist"]))
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
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update doctor profile",
        ) from error

    return doctor
