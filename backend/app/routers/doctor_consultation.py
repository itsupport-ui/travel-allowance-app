from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_visit import DoctorVisit
from app.models.user import User
from app.schemas.doctor_consultation import (
    DoctorConsultationComplete,
    DoctorConsultationCreate,
    DoctorConsultationDashboardResponse,
    DoctorConsultationReject,
    DoctorConsultationResponse,
    DoctorConsultationVisitCreate,
)
from app.schemas.doctor_visit import DoctorVisitResponse
from app.utils.auth import require_permission, require_role
from app.utils.workflow_transitions import (
    DOCTOR_CONSULTATION_DECISION_TRANSITIONS,
    DOCTOR_CONSULTATION_STATUS_TRANSITIONS,
    validate_status_transition,
)


router = APIRouter(
    prefix="/doctor-consultations",
    tags=["Doctor Consultations"],
)


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


def _filter_consultations(
    query,
    doctor_id: int | None,
    status_filter: str | None,
    patient_decision: str | None,
    from_date: date | None,
    to_date: date | None,
):
    if from_date is not None and to_date is not None:
        if from_date > to_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="from_date cannot be later than to_date",
            )
    if doctor_id is not None:
        query = query.filter(
            DoctorConsultation.doctor_id == doctor_id
        )
    if status_filter is not None:
        query = query.filter(
            DoctorConsultation.status == status_filter
        )
    if patient_decision is not None:
        query = query.filter(
            DoctorConsultation.patient_decision
            == patient_decision
        )
    if from_date is not None:
        query = query.filter(
            DoctorConsultation.scheduled_date >= from_date
        )
    if to_date is not None:
        query = query.filter(
            DoctorConsultation.scheduled_date <= to_date
        )

    return query


def _order_consultations(query):
    return query.order_by(
        DoctorConsultation.scheduled_date.desc(),
        DoctorConsultation.scheduled_time.desc(),
    )


@router.post(
    "/",
    response_model=DoctorConsultationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_consultation(
    consultation_data: DoctorConsultationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.create")
    ),
):
    try:
        doctor = (
            db.query(Doctor)
            .filter(Doctor.id == consultation_data.doctor_id)
            .first()
        )
        if doctor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor not found",
            )

        scheduled_at = datetime.combine(
            consultation_data.scheduled_date,
            consultation_data.scheduled_time,
        )
        if scheduled_at < datetime.now():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot schedule a consultation in the past",
            )

        consultation = DoctorConsultation(
            patient_name=consultation_data.patient_name,
            patient_phone=consultation_data.patient_phone,
            patient_address=consultation_data.patient_address,
            doctor_id=consultation_data.doctor_id,
            scheduled_date=consultation_data.scheduled_date,
            scheduled_time=consultation_data.scheduled_time,
            purpose=consultation_data.purpose,
            notes=consultation_data.notes,
            patient_decision="pending",
            status="scheduled",
            created_by=current_user.id,
        )

        db.add(consultation)
        db.flush()
        db.refresh(consultation)
        db.commit()
        return consultation
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create doctor consultation",
        ) from error


@router.get(
    "/my",
    response_model=list[DoctorConsultationResponse],
)
def get_my_doctor_consultations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    return (
        db.query(DoctorConsultation)
        .filter(DoctorConsultation.doctor_id == doctor.id)
        .order_by(
            DoctorConsultation.scheduled_date.desc(),
            DoctorConsultation.scheduled_time.desc(),
        )
        .all()
    )


@router.get(
    "/dashboard",
    response_model=DoctorConsultationDashboardResponse,
)
def get_doctor_consultation_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    doctor_consultations = db.query(DoctorConsultation).filter(
        DoctorConsultation.doctor_id == doctor.id
    )

    return {
        "today_calls": doctor_consultations.filter(
            DoctorConsultation.scheduled_date == date.today()
        ).count(),
        "scheduled": doctor_consultations.filter(
            DoctorConsultation.status == "scheduled"
        ).count(),
        "completed": doctor_consultations.filter(
            DoctorConsultation.status == "completed"
        ).count(),
        "pending_confirmation": doctor_consultations.filter(
            DoctorConsultation.status == "completed",
            DoctorConsultation.patient_decision == "pending",
        ).count(),
        "confirmed": doctor_consultations.filter(
            DoctorConsultation.patient_decision == "confirmed"
        ).count(),
        "rejected": doctor_consultations.filter(
            DoctorConsultation.patient_decision == "rejected"
        ).count(),
        "follow_up": doctor_consultations.filter(
            DoctorConsultation.patient_decision == "follow_up"
        ).count(),
    }


@router.get(
    "/",
    response_model=list[DoctorConsultationResponse],
)
def get_admin_doctor_consultations(
    doctor_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_decision: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.manage")
    ),
):
    query = _filter_consultations(
        db.query(DoctorConsultation),
        doctor_id,
        status_filter,
        patient_decision,
        from_date,
        to_date,
    )
    return _order_consultations(query).all()


@router.get(
    "/pending-confirmation",
    response_model=list[DoctorConsultationResponse],
)
def get_pending_confirmation_consultations(
    doctor_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_decision: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.manage")
    ),
):
    query = db.query(DoctorConsultation).filter(
        DoctorConsultation.status == "completed",
        DoctorConsultation.patient_decision == "pending",
    )
    query = _filter_consultations(
        query,
        doctor_id,
        status_filter,
        patient_decision,
        from_date,
        to_date,
    )
    return _order_consultations(query).all()


@router.get(
    "/confirmed",
    response_model=list[DoctorConsultationResponse],
)
def get_confirmed_consultations(
    doctor_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_decision: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.manage")
    ),
):
    query = db.query(DoctorConsultation).filter(
        DoctorConsultation.patient_decision == "confirmed"
    )
    query = _filter_consultations(
        query,
        doctor_id,
        status_filter,
        patient_decision,
        from_date,
        to_date,
    )
    return _order_consultations(query).all()


@router.get(
    "/cancelled",
    response_model=list[DoctorConsultationResponse],
)
def get_cancelled_consultations(
    doctor_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    patient_decision: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.manage")
    ),
):
    query = db.query(DoctorConsultation).filter(
        DoctorConsultation.status == "cancelled"
    )
    query = _filter_consultations(
        query,
        doctor_id,
        status_filter,
        patient_decision,
        from_date,
        to_date,
    )
    return _order_consultations(query).all()


@router.get(
    "/{consultation_id}",
    response_model=DoctorConsultationResponse,
)
def get_doctor_consultation(
    consultation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(["doctor", "admin"])
    ),
):
    doctor = (
        _get_current_doctor(db, current_user)
        if current_user.role == "doctor"
        else None
    )
    consultation = (
        db.query(DoctorConsultation)
        .filter(DoctorConsultation.id == consultation_id)
        .first()
    )
    if consultation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor consultation not found",
        )
    if (
        doctor is not None
        and consultation.doctor_id != doctor.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this consultation",
        )

    return consultation


@router.put(
    "/{consultation_id}/complete",
    response_model=DoctorConsultationResponse,
)
def complete_doctor_consultation(
    consultation_id: int,
    completion_data: DoctorConsultationComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    try:
        doctor = _get_current_doctor(db, current_user)
        consultation = (
            db.query(DoctorConsultation)
            .filter(DoctorConsultation.id == consultation_id)
            .with_for_update()
            .first()
        )
        if consultation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor consultation not found",
            )
        if consultation.doctor_id != doctor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to complete this consultation",
            )
        validate_status_transition(
            entity="Doctor consultation status",
            current_status=consultation.status,
            next_status="completed",
            transitions=DOCTOR_CONSULTATION_STATUS_TRANSITIONS,
        )
        validate_status_transition(
            entity="Doctor consultation decision",
            current_status=consultation.patient_decision,
            next_status=completion_data.patient_decision,
            transitions=DOCTOR_CONSULTATION_DECISION_TRANSITIONS,
            allow_noop=True,
        )

        consultation.call_outcome = completion_data.call_outcome
        consultation.preliminary_diagnosis = (
            completion_data.preliminary_diagnosis
        )
        consultation.proposed_treatment = (
            completion_data.proposed_treatment
        )
        consultation.estimated_amount = (
            completion_data.estimated_amount
        )
        consultation.patient_decision = (
            completion_data.patient_decision
        )
        consultation.status = "completed"
        consultation.completed_at = datetime.now(timezone.utc)

        db.flush()
        db.refresh(consultation)
        db.commit()
        return consultation
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to complete doctor consultation",
        ) from error


@router.put(
    "/{consultation_id}/confirm",
    response_model=DoctorConsultationResponse,
)
def confirm_doctor_consultation(
    consultation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.manage")
    ),
):
    try:
        consultation = (
            db.query(DoctorConsultation)
            .filter(DoctorConsultation.id == consultation_id)
            .with_for_update()
            .first()
        )
        if consultation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor consultation not found",
            )
        if consultation.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only completed consultations can be confirmed",
            )
        if consultation.doctor_visit_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Consultation already converted to a visit; "
                    "confirmation or rejection is not allowed"
                ),
            )
        validate_status_transition(
            entity="Doctor consultation decision",
            current_status=consultation.patient_decision,
            next_status="confirmed",
            transitions=DOCTOR_CONSULTATION_DECISION_TRANSITIONS,
        )

        consultation.patient_decision = "confirmed"

        db.flush()
        db.refresh(consultation)
        db.commit()
        return consultation
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to confirm doctor consultation",
        ) from error


@router.put(
    "/{consultation_id}/reject",
    response_model=DoctorConsultationResponse,
)
def reject_doctor_consultation(
    consultation_id: int,
    rejection_data: DoctorConsultationReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("consultations.manage")
    ),
):
    try:
        consultation = (
            db.query(DoctorConsultation)
            .filter(DoctorConsultation.id == consultation_id)
            .with_for_update()
            .first()
        )
        if consultation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor consultation not found",
            )
        if consultation.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only completed consultations can be rejected",
            )
        if consultation.doctor_visit_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Consultation already converted to a visit; "
                    "confirmation or rejection is not allowed"
                ),
            )
        validate_status_transition(
            entity="Doctor consultation decision",
            current_status=consultation.patient_decision,
            next_status="rejected",
            transitions=DOCTOR_CONSULTATION_DECISION_TRANSITIONS,
        )

        consultation.patient_decision = "rejected"
        consultation.rejection_reason = rejection_data.rejection_reason

        db.flush()
        db.refresh(consultation)
        db.commit()
        return consultation
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to reject doctor consultation",
        ) from error


@router.post(
    "/{consultation_id}/create-visit",
    response_model=DoctorVisitResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_visit_from_doctor_consultation(
    consultation_id: int,
    visit_data: DoctorConsultationVisitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("doctor_visits.create")
    ),
):
    try:
        consultation = (
            db.query(DoctorConsultation)
            .filter(DoctorConsultation.id == consultation_id)
            .with_for_update()
            .first()
        )
        if consultation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor consultation not found",
            )
        if consultation.patient_decision != "confirmed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only confirmed consultations can create visits",
            )
        if consultation.doctor_visit_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A doctor visit already exists for this consultation",
            )
        if visit_data.visit_date < date.today():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot schedule a visit in the past",
            )

        visit_values = {
            "patient_name": consultation.patient_name,
            "patient_phone": consultation.patient_phone,
            "patient_address": consultation.patient_address,
            "doctor_id": consultation.doctor_id,
            "visit_date": visit_data.visit_date,
            "visit_time": visit_data.visit_time,
            "chief_complaint": consultation.purpose,
            "remarks": visit_data.remarks,
            "status": "scheduled",
            "created_by": current_user.id,
        }
        if hasattr(DoctorVisit, "consultation_id"):
            visit_values["consultation_id"] = consultation.id

        visit = DoctorVisit(**visit_values)
        db.add(visit)
        db.flush()

        consultation.doctor_visit_id = visit.id

        db.flush()
        db.refresh(visit)
        db.commit()
        return visit
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A doctor visit already exists for this consultation",
        ) from error
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create doctor visit",
        ) from error
