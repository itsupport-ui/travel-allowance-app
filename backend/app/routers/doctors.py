from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.doctor import Doctor
from app.models.user import User
from app.schemas.doctor import DoctorCreate, DoctorResponse, DoctorUpdate
from app.utils.auth import hash_password, require_role
from app.services.domain_audit_service import record_domain_audit_event
from app.services.staff_deactivation_service import (
    consume_staff_deactivation_override,
)
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
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="doctor_profile",
            entity_id=new_doctor.id,
            action="created",
            from_state=None,
            to_state="active",
            related_entity_type="staff_user",
            related_entity_id=new_doctor.user_id,
            details={"role": "doctor"},
        )
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

    prior_state = "active" if doctor.active else "inactive"
    prior_user_id = doctor.user_id
    prior_values = {
        "name": doctor.name,
        "specialization": doctor.specialization,
        "phone": doctor.phone,
        "active": bool(doctor.active),
    }
    if (
        prior_state == "active"
        and not payload.active
        and payload.user_id != prior_user_id
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Change the linked login and deactivate the doctor in separate "
                "updates so the access change can be audited safely."
            ),
        )
    deactivation_override = None
    if prior_state == "active" and not payload.active:
        deactivation_override = consume_staff_deactivation_override(
            db,
            staff_role="doctor",
            staff_id=doctor.id,
            override_request_id=payload.override_request_id,
            deactivation_reason=payload.deactivation_reason,
            actor=current_user,
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
    if prior_state != ("active" if doctor.active else "inactive"):
        linked_user.is_active = bool(doctor.active)

    try:
        changed_fields = [
            field_name
            for field_name, next_value in {
                "name": doctor.name,
                "specialization": doctor.specialization,
                "phone": doctor.phone,
                "active": bool(doctor.active),
            }.items()
            if prior_values[field_name] != next_value
        ]
        if prior_user_id != doctor.user_id:
            changed_fields.append("user_link")
        if payload.email is not None:
            changed_fields.append("email")
        if payload.password:
            changed_fields.append("password")
        next_state = "active" if doctor.active else "inactive"
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="doctor_profile",
            entity_id=doctor.id,
            action=(
                "activated"
                if prior_state == "inactive" and next_state == "active"
                else "deactivated"
                if prior_state == "active" and next_state == "inactive"
                else "updated"
                if changed_fields
                else "no_change"
            ),
            from_state=prior_state,
            to_state=next_state,
            related_entity_type="staff_user",
            related_entity_id=doctor.user_id,
            reason_code=(
                "staff_deactivation"
                if prior_state == "active" and next_state == "inactive"
                else None
            ),
            reason=(
                payload.deactivation_reason
                if prior_state == "active" and next_state == "inactive"
                else None
            ),
            details={
                "role": "doctor",
                "changed_fields": list(dict.fromkeys(changed_fields)),
                "credential_changed": bool(payload.password),
                "login_access_synchronized": prior_state != next_state,
                "override_used": deactivation_override is not None,
                "override_request_id": (
                    deactivation_override.id
                    if deactivation_override is not None
                    else None
                ),
            },
        )
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
