from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.doctor import DoctorUserCreate
from app.schemas.user import (
    OPERATIONS_STAFF_ROLES,
    OperationsStaffCreate,
    OperationsStaffPasswordReset,
    OperationsStaffResponse,
    OperationsStaffUpdate,
    TherapistResponse,
    TherapistUpdate,
    UserResponse,
)
from app.utils.auth import (
    hash_password,
    require_permission,
    require_role,
)
from app.utils.permissions import get_role_permissions
from app.services.domain_audit_service import record_domain_audit_event
from app.services.staff_deactivation_service import (
    consume_staff_deactivation_override,
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
    current_user: User = Depends(require_permission("staff.manage")),
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
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_user",
            entity_id=doctor_user.id,
            action="created",
            from_state=None,
            to_state="active",
            related_entity_type="staff_role",
            related_entity_id="doctor",
            details={"role": "doctor"},
        )
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
    current_user: User = Depends(require_permission("staff.manage")),
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
    current_user: User = Depends(require_permission("staff.manage")),
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
    current_user: User = Depends(require_permission("staff.manage")),
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

    prior_state = "active" if therapist.is_active else "inactive"
    deactivation_override = None
    if therapist.is_active and not payload.is_active:
        deactivation_override = consume_staff_deactivation_override(
            db,
            staff_role="therapist",
            staff_id=therapist.id,
            override_request_id=payload.override_request_id,
            deactivation_reason=payload.deactivation_reason,
            actor=current_user,
        )
    changed_fields = []
    if therapist.username != normalized_username:
        changed_fields.append("username")
    if therapist.email != normalized_email:
        changed_fields.append("email")
    if bool(therapist.is_active) != bool(payload.is_active):
        changed_fields.append("is_active")
    if payload.password:
        changed_fields.append("password")

    therapist.username = normalized_username
    therapist.email = normalized_email
    therapist.is_active = payload.is_active
    if payload.password:
        therapist.password_hash = hash_password(payload.password)

    try:
        next_state = "active" if therapist.is_active else "inactive"
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_user",
            entity_id=therapist.id,
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
            related_entity_type="staff_role",
            related_entity_id="therapist",
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
                "role": "therapist",
                "changed_fields": changed_fields,
                "credential_changed": "password" in changed_fields,
                "override_used": deactivation_override is not None,
                "override_request_id": (
                    deactivation_override.id
                    if deactivation_override is not None
                    else None
                ),
            },
        )
        db.commit()
        db.refresh(therapist)
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update therapist profile",
        ) from error

    return therapist


def _to_operations_staff_response(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "permissions": sorted(get_role_permissions(user.role)),
    }


@router.post(
    "/users/operations-staff",
    response_model=OperationsStaffResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_operations_staff(
    payload: OperationsStaffCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    normalized_email = str(payload.email).strip().lower()
    normalized_username = payload.username.strip()

    duplicate_username = (
        db.query(User)
        .filter(func.lower(User.username) == normalized_username.lower())
        .first()
    )
    if duplicate_username is not None:
        raise HTTPException(
            status_code=400,
            detail="Username already registered",
        )

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    operations_user = User(
        username=normalized_username,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )

    try:
        db.add(operations_user)
        db.flush()
        db.refresh(operations_user)
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_user",
            entity_id=operations_user.id,
            action="created",
            from_state=None,
            to_state="active",
            related_entity_type="staff_role",
            related_entity_id=payload.role,
            details={"role": payload.role},
        )
        db.commit()
        return _to_operations_staff_response(operations_user)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        ) from error
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to create operations staff account",
        ) from error


@router.get(
    "/users/operations-staff",
    response_model=list[OperationsStaffResponse],
)
def list_operations_staff(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    users = (
        db.query(User)
        .filter(User.role.in_(OPERATIONS_STAFF_ROLES))
        .order_by(User.username.asc())
        .all()
    )
    return [_to_operations_staff_response(user) for user in users]


def _get_operations_staff_or_404(db: Session, user_id: int) -> User:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.role.in_(OPERATIONS_STAFF_ROLES))
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Operations staff account not found",
        )
    return user


@router.get(
    "/users/operations-staff/{user_id}",
    response_model=OperationsStaffResponse,
)
def get_operations_staff(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = _get_operations_staff_or_404(db, user_id)
    return _to_operations_staff_response(user)


@router.put(
    "/users/operations-staff/{user_id}",
    response_model=OperationsStaffResponse,
)
def update_operations_staff(
    user_id: int,
    payload: OperationsStaffUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = _get_operations_staff_or_404(db, user_id)

    normalized_email = str(payload.email).strip().lower()
    duplicate_email = (
        db.query(User)
        .filter(
            User.id != user_id,
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
            User.id != user_id,
            func.lower(User.username) == normalized_username.lower(),
        )
        .first()
    )
    if duplicate_username is not None:
        raise HTTPException(
            status_code=400,
            detail="Username already registered",
        )

    prior_state = "active" if user.is_active else "inactive"
    changed_fields = []
    if user.username != normalized_username:
        changed_fields.append("username")
    if user.email != normalized_email:
        changed_fields.append("email")
    if user.role != payload.role:
        changed_fields.append("role")
    if bool(user.is_active) != bool(payload.is_active):
        changed_fields.append("is_active")

    user.username = normalized_username
    user.email = normalized_email
    user.role = payload.role
    user.is_active = payload.is_active

    try:
        next_state = "active" if user.is_active else "inactive"
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_user",
            entity_id=user.id,
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
            related_entity_type="staff_role",
            related_entity_id=payload.role,
            details={
                "role": payload.role,
                "changed_fields": changed_fields,
            },
        )
        db.commit()
        db.refresh(user)
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update operations staff account",
        ) from error

    return _to_operations_staff_response(user)


@router.post(
    "/users/operations-staff/{user_id}/reset-password",
    response_model=OperationsStaffResponse,
)
def reset_operations_staff_password(
    user_id: int,
    payload: OperationsStaffPasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    user = _get_operations_staff_or_404(db, user_id)
    user.password_hash = hash_password(payload.password)

    try:
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="administration",
            entity_type="staff_user",
            entity_id=user.id,
            action="password_reset",
            from_state="active" if user.is_active else "inactive",
            to_state="active" if user.is_active else "inactive",
            related_entity_type="staff_role",
            related_entity_id=user.role,
            details={"role": user.role},
        )
        db.commit()
        db.refresh(user)
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to reset password",
        ) from error

    return _to_operations_staff_response(user)
