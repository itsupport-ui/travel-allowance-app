from datetime import date, datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_consultation_event import DoctorConsultationEvent
from app.models.doctor_visit import DoctorVisit
from app.models.user import User
from app.schemas.doctor_consultation import (
    DoctorConsultationCancel,
    DoctorConsultationComplete,
    DoctorConsultationConfirm,
    DoctorConsultationCreate,
    DoctorConsultationDashboardResponse,
    DoctorConsultationEventResponse,
    DoctorConsultationFollowUpSchedule,
    DoctorConsultationReject,
    DoctorConsultationReschedule,
    DoctorConsultationResponse,
    DoctorConsultationVisitCreate,
)
from app.schemas.doctor_visit import DoctorVisitResponse
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.auth import require_permission, require_role
from app.utils.domain_errors import DomainHTTPException
from app.utils.permissions import role_has_permission
from app.utils.timezone import india_now
from app.utils.workflow_transitions import (
    DOCTOR_CONSULTATION_DECISION_TRANSITIONS,
    DOCTOR_CONSULTATION_STATUS_TRANSITIONS,
    validate_status_transition,
)


router = APIRouter(
    prefix="/doctor-consultations",
    tags=["Doctor Consultations"],
)
logger = logging.getLogger(__name__)


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


def _validate_future_schedule(scheduled_date: date, scheduled_time) -> None:
    scheduled_at = datetime.combine(scheduled_date, scheduled_time)
    if scheduled_at < india_now().replace(tzinfo=None):
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="CONSULTATION_SCHEDULE_IN_PAST",
            message="Cannot schedule a consultation in the past",
            recoverable=True,
            suggested_action="choose_future_consultation_time",
            blocking_fields=("scheduled_date", "scheduled_time"),
        )


def _check_lifecycle_version(
    consultation: DoctorConsultation,
    expected_version: int | None,
) -> None:
    if (
        expected_version is not None
        and consultation.lifecycle_version != expected_version
    ):
        raise DomainHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            code="CONSULTATION_VERSION_CONFLICT",
            message=(
                "This consultation changed after it was loaded. "
                "Refresh it before trying again."
            ),
            recoverable=True,
            suggested_action="refresh_consultation",
        )


def _authorize_consultation_lifecycle(
    db: Session,
    consultation: DoctorConsultation,
    current_user: User,
) -> None:
    if role_has_permission(current_user.role, "consultations.manage"):
        return
    if current_user.role == "doctor":
        doctor = _get_current_doctor(db, current_user)
        if consultation.doctor_id == doctor.id:
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized to manage this consultation",
    )


def _record_event(
    db: Session,
    consultation: DoctorConsultation,
    current_user: User,
    *,
    event_type: str,
    from_status: str | None = None,
    to_status: str | None = None,
    from_decision: str | None = None,
    to_decision: str | None = None,
    reason: str | None = None,
    related_consultation_id: int | None = None,
    related_visit_id: int | None = None,
) -> None:
    db.add(
        DoctorConsultationEvent(
            consultation_id=consultation.id,
            event_type=event_type,
            actor_id=current_user.id,
            from_status=from_status,
            to_status=to_status,
            from_decision=from_decision,
            to_decision=to_decision,
            reason=reason,
            related_consultation_id=related_consultation_id,
            related_visit_id=related_visit_id,
            lifecycle_version=consultation.lifecycle_version,
        )
    )
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="doctor_consultation",
        entity_id=consultation.id,
        action=event_type,
        from_state=from_status or from_decision,
        to_state=to_status or to_decision,
        reason=(
            reason
            if event_type
            in {"cancelled", "rescheduled", "follow_up_scheduled"}
            else None
        ),
        related_entity_type=(
            "doctor_consultation"
            if related_consultation_id is not None
            else "doctor_visit"
            if related_visit_id is not None
            else None
        ),
        related_entity_id=(
            related_consultation_id
            if related_consultation_id is not None
            else related_visit_id
        ),
        details={"lifecycle_version": consultation.lifecycle_version},
    )


def _create_successor(
    db: Session,
    source: DoctorConsultation,
    current_user: User,
    *,
    scheduled_date: date,
    scheduled_time,
    origin_kind: str,
) -> DoctorConsultation:
    successor = DoctorConsultation(
        patient_name=source.patient_name,
        patient_phone=source.patient_phone,
        patient_address=source.patient_address,
        doctor_id=source.doctor_id,
        origin_consultation_id=source.id,
        origin_kind=origin_kind,
        scheduled_date=scheduled_date,
        scheduled_time=scheduled_time,
        purpose=source.purpose,
        notes=source.notes,
        patient_decision="pending",
        status="scheduled",
        created_by=current_user.id,
        lifecycle_version=1,
    )
    db.add(successor)
    db.flush()
    source.successor_consultation_id = successor.id
    return successor


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
        if not doctor.active or doctor.user is None or not doctor.user.is_active:
            raise DomainHTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="DOCTOR_INACTIVE",
                message="Consultations can only be assigned to an active doctor",
                recoverable=True,
                suggested_action="choose_active_doctor",
                blocking_fields=("doctor_id",),
            )

        _validate_future_schedule(
            consultation_data.scheduled_date,
            consultation_data.scheduled_time,
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
        _record_event(
            db,
            consultation,
            current_user,
            event_type="created",
            to_status="scheduled",
            to_decision="pending",
        )
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
            DoctorConsultation.scheduled_date == india_now().date()
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


@router.get(
    "/{consultation_id}/history",
    response_model=list[DoctorConsultationEventResponse],
)
def get_doctor_consultation_history(
    consultation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor", "admin"])),
):
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
    _authorize_consultation_lifecycle(db, consultation, current_user)
    return (
        db.query(DoctorConsultationEvent)
        .filter(DoctorConsultationEvent.consultation_id == consultation_id)
        .order_by(
            DoctorConsultationEvent.created_at.asc(),
            DoctorConsultationEvent.id.asc(),
        )
        .all()
    )


@router.put(
    "/{consultation_id}/cancel",
    response_model=DoctorConsultationResponse,
)
def cancel_doctor_consultation(
    consultation_id: int,
    cancellation_data: DoctorConsultationCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor", "admin"])),
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
        _authorize_consultation_lifecycle(db, consultation, current_user)
        _check_lifecycle_version(
            consultation,
            cancellation_data.lifecycle_version,
        )
        validate_status_transition(
            entity="Doctor consultation status",
            current_status=consultation.status,
            next_status="cancelled",
            transitions=DOCTOR_CONSULTATION_STATUS_TRANSITIONS,
        )

        previous_status = consultation.status
        consultation.status = "cancelled"
        consultation.cancellation_code = cancellation_data.cancellation_code
        consultation.cancellation_reason = cancellation_data.reason
        consultation.cancelled_by = current_user.id
        consultation.cancelled_at = datetime.now(timezone.utc)
        consultation.lifecycle_version += 1
        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="cancelled",
            from_status=previous_status,
            to_status="cancelled",
            from_decision=consultation.patient_decision,
            to_decision=consultation.patient_decision,
            reason=cancellation_data.reason,
        )
        db.commit()
        db.refresh(consultation)
        return consultation
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        logger.exception("Unable to create doctor consultation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to cancel doctor consultation",
        ) from error


@router.post(
    "/{consultation_id}/reschedule",
    response_model=DoctorConsultationResponse,
    status_code=status.HTTP_201_CREATED,
)
def reschedule_doctor_consultation(
    consultation_id: int,
    reschedule_data: DoctorConsultationReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor", "admin"])),
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
        _authorize_consultation_lifecycle(db, consultation, current_user)
        _check_lifecycle_version(
            consultation,
            reschedule_data.lifecycle_version,
        )
        validate_status_transition(
            entity="Doctor consultation status",
            current_status=consultation.status,
            next_status="cancelled",
            transitions=DOCTOR_CONSULTATION_STATUS_TRANSITIONS,
        )
        if consultation.successor_consultation_id is not None:
            raise DomainHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                code="CONSULTATION_SUCCESSOR_EXISTS",
                message="A replacement consultation already exists",
                recoverable=True,
                suggested_action="view_successor_consultation",
            )
        _validate_future_schedule(
            reschedule_data.scheduled_date,
            reschedule_data.scheduled_time,
        )

        successor = _create_successor(
            db,
            consultation,
            current_user,
            scheduled_date=reschedule_data.scheduled_date,
            scheduled_time=reschedule_data.scheduled_time,
            origin_kind="rescheduled",
        )
        previous_status = consultation.status
        consultation.status = "cancelled"
        consultation.cancellation_code = "rescheduled"
        consultation.cancellation_reason = reschedule_data.reason
        consultation.cancelled_by = current_user.id
        consultation.cancelled_at = datetime.now(timezone.utc)
        consultation.lifecycle_version += 1
        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="rescheduled",
            from_status=previous_status,
            to_status="cancelled",
            from_decision=consultation.patient_decision,
            to_decision=consultation.patient_decision,
            reason=reschedule_data.reason,
            related_consultation_id=successor.id,
        )
        _record_event(
            db,
            successor,
            current_user,
            event_type="created_from_reschedule",
            to_status="scheduled",
            to_decision="pending",
            reason=reschedule_data.reason,
            related_consultation_id=consultation.id,
        )
        db.commit()
        db.refresh(successor)
        return successor
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise DomainHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            code="CONSULTATION_SUCCESSOR_EXISTS",
            message="A replacement consultation already exists",
            recoverable=True,
            suggested_action="refresh_consultation",
        ) from error
    except Exception as error:
        db.rollback()
        logger.exception("Unable to create doctor consultation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to reschedule doctor consultation",
        ) from error


@router.post(
    "/{consultation_id}/schedule-follow-up",
    response_model=DoctorConsultationResponse,
    status_code=status.HTTP_201_CREATED,
)
def schedule_doctor_consultation_follow_up(
    consultation_id: int,
    follow_up_data: DoctorConsultationFollowUpSchedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor", "admin"])),
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
        _authorize_consultation_lifecycle(db, consultation, current_user)
        _check_lifecycle_version(
            consultation,
            follow_up_data.lifecycle_version,
        )
        if (
            consultation.status != "completed"
            or consultation.patient_decision != "follow_up"
        ):
            raise DomainHTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="CONSULTATION_NOT_READY_FOR_FOLLOW_UP",
                message=(
                    "Only a completed consultation marked for follow-up "
                    "can create a follow-up appointment"
                ),
                recoverable=False,
                suggested_action="view_consultation_status",
            )
        if consultation.successor_consultation_id is not None:
            raise DomainHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                code="CONSULTATION_SUCCESSOR_EXISTS",
                message="A follow-up consultation already exists",
                recoverable=True,
                suggested_action="view_successor_consultation",
            )

        follow_up_date = (
            follow_up_data.scheduled_date or consultation.follow_up_date
        )
        follow_up_time = (
            follow_up_data.scheduled_time or consultation.follow_up_time
        )
        if follow_up_date is None or follow_up_time is None:
            raise DomainHTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="FOLLOW_UP_SCHEDULE_REQUIRED",
                message="Follow-up date and time are required",
                recoverable=True,
                suggested_action="provide_follow_up_schedule",
                blocking_fields=("scheduled_date", "scheduled_time"),
            )
        _validate_future_schedule(follow_up_date, follow_up_time)
        reason = follow_up_data.reason or consultation.follow_up_reason
        if reason is None or len(reason.strip()) < 3:
            raise DomainHTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="FOLLOW_UP_REASON_REQUIRED",
                message="A clear follow-up reason is required",
                recoverable=True,
                suggested_action="provide_follow_up_reason",
                blocking_fields=("reason",),
            )
        reason = reason.strip()

        successor = _create_successor(
            db,
            consultation,
            current_user,
            scheduled_date=follow_up_date,
            scheduled_time=follow_up_time,
            origin_kind="follow_up",
        )
        consultation.lifecycle_version += 1
        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="follow_up_scheduled",
            from_status=consultation.status,
            to_status=consultation.status,
            from_decision="follow_up",
            to_decision="follow_up",
            reason=reason,
            related_consultation_id=successor.id,
        )
        _record_event(
            db,
            successor,
            current_user,
            event_type="created_from_follow_up",
            to_status="scheduled",
            to_decision="pending",
            reason=reason,
            related_consultation_id=consultation.id,
        )
        db.commit()
        db.refresh(successor)
        return successor
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise DomainHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            code="CONSULTATION_SUCCESSOR_EXISTS",
            message="A follow-up consultation already exists",
            recoverable=True,
            suggested_action="refresh_consultation",
        ) from error
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to schedule follow-up consultation",
        ) from error


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
        _check_lifecycle_version(
            consultation,
            completion_data.lifecycle_version,
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
        if completion_data.patient_decision == "follow_up":
            _validate_future_schedule(
                completion_data.follow_up_date,
                completion_data.follow_up_time,
            )

        previous_status = consultation.status
        previous_decision = consultation.patient_decision
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
        consultation.follow_up_date = completion_data.follow_up_date
        consultation.follow_up_time = completion_data.follow_up_time
        consultation.follow_up_reason = completion_data.follow_up_reason
        consultation.status = "completed"
        consultation.completed_at = datetime.now(timezone.utc)
        consultation.lifecycle_version += 1

        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="completed",
            from_status=previous_status,
            to_status=consultation.status,
            from_decision=previous_decision,
            to_decision=consultation.patient_decision,
            reason=consultation.call_outcome,
        )
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
    confirmation_data: DoctorConsultationConfirm,
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
        _check_lifecycle_version(
            consultation,
            confirmation_data.lifecycle_version,
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

        previous_decision = consultation.patient_decision
        consultation.patient_decision = "confirmed"
        consultation.rejection_reason = None
        consultation.lifecycle_version += 1

        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="confirmed",
            from_status=consultation.status,
            to_status=consultation.status,
            from_decision=previous_decision,
            to_decision="confirmed",
        )
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
        _check_lifecycle_version(
            consultation,
            rejection_data.lifecycle_version,
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

        previous_decision = consultation.patient_decision
        consultation.patient_decision = "rejected"
        consultation.rejection_reason = rejection_data.rejection_reason
        consultation.lifecycle_version += 1

        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="rejected",
            from_status=consultation.status,
            to_status=consultation.status,
            from_decision=previous_decision,
            to_decision="rejected",
            reason=rejection_data.rejection_reason,
        )
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
        _check_lifecycle_version(
            consultation,
            visit_data.lifecycle_version,
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
        if visit_data.visit_date < india_now().date():
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
        consultation.lifecycle_version += 1

        db.flush()
        _record_event(
            db,
            consultation,
            current_user,
            event_type="visit_created",
            from_status=consultation.status,
            to_status=consultation.status,
            from_decision=consultation.patient_decision,
            to_decision=consultation.patient_decision,
            related_visit_id=visit.id,
        )
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
