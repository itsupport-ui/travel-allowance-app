import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Form,
    File,
    UploadFile,
)
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models.user import User
from app.models.doctor import Doctor
from app.models.treatment_schedule import TreatmentSchedule
from app.schemas.treatment_schedule import TreatmentScheduleCreate, TreatmentScheduleResponse, MissedTreatmentRequest, TreatmentScheduleUpdate
from app.utils.auth import require_role
from datetime import date, datetime
from sqlalchemy import and_, or_, func
# import get_current_user
from app.utils.auth import get_current_user
from app.services.claim_service import (
    TRAVEL_ENTRY_EXISTS_MESSAGE,
    cleanup_invoice_file,
    create_auto_travel_entry,
)
from app.services.schedule_location_service import (
    has_valid_coordinates,
    resolve_patient_coordinates,
)
from app.services.push_notification_service import (
    notify_schedule_assigned,
    notify_schedule_updated,
)



router = APIRouter(
    prefix="/schedule",
    tags=["Treatment Schedule"]
)

logger = logging.getLogger(__name__)


def _is_travel_schedule_unique_violation(error: IntegrityError) -> bool:
    message = str(error.orig).lower()
    return (
        "uq_travel_entries_therapist_schedule" in message
        or (
            "travel_entries.therapist_id" in message
            and "travel_entries.schedule_id" in message
        )
    )

@router.post(
    "/create",
    response_model=
    TreatmentScheduleResponse
)
def create_schedule(
    treatment_schedule:
    TreatmentScheduleCreate,

    background_tasks: BackgroundTasks,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    # Validate doctor
    doctor = (
        db.query(Doctor)
        .filter(
            Doctor.id
            ==
            treatment_schedule.doctor_id
        )
        .first()
    )

    if not doctor:
        raise HTTPException(
            status_code=404,
            detail=
            "Doctor not found"
        )

    # Validate therapist
    therapist = (
        db.query(User)
        .filter(
            User.id
            ==
            treatment_schedule.therapist_id,

            User.role
            ==
            "therapist"
        )
        .first()
    )

    if not therapist:
        raise HTTPException(
            status_code=404,
            detail=
            "Therapist not found"
        )

    # One-time validation
    if (
        treatment_schedule.schedule_type
        ==
        "one_time"
    ):
        if (
            not treatment_schedule
            .treatment_date
        ):
            raise HTTPException(
                status_code=400,
                detail=
                "Treatment date required"
            )

    # Recurring validation
    elif (
        treatment_schedule.schedule_type
        ==
        "recurring"
    ):
        if (
            not treatment_schedule
            .start_date
            or
            not treatment_schedule
            .end_date
        ):
            raise HTTPException(
                status_code=400,
                detail=
                "Start and end date required"
            )

    else:
        raise HTTPException(
            status_code=400,
            detail=
            "Invalid schedule type"
        )

    try:
        patient_latitude, patient_longitude = resolve_patient_coordinates(
            treatment_schedule.patient_address
        )

        schedule = TreatmentSchedule(
            patient_name=
            treatment_schedule.patient_name,

            doctor_id=
            treatment_schedule.doctor_id,

            therapist_id=
            treatment_schedule.therapist_id,

            treatment_name=
            treatment_schedule.treatment_name,

            medicines=
            treatment_schedule.medicines,

            patient_address=
            treatment_schedule.patient_address,

            patient_latitude=
            patient_latitude,

            patient_longitude=
            patient_longitude,

            schedule_type=
            treatment_schedule.schedule_type,

            treatment_date=
            treatment_schedule.treatment_date,

            start_date=
            treatment_schedule.start_date,

            end_date=
            treatment_schedule.end_date,

            in_time=
            treatment_schedule.in_time,

            out_time=
            treatment_schedule.out_time,

            instructions=
            treatment_schedule.instructions,

            priority=
            treatment_schedule.priority,

            transport_mode=
            treatment_schedule.transport_mode
        )

        db.add(schedule)
        db.commit()
    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    except Exception as error:
        db.rollback()
        logger.exception("Unable to create treatment schedule.")
        raise HTTPException(
            status_code=500,
            detail="Unable to create the schedule.",
        ) from error

    background_tasks.add_task(
        notify_schedule_assigned,
        therapist.id,
        schedule.id,
    )

    schedule.doctor_name = doctor.name
    schedule.therapist_name = therapist.username

    return schedule

@router.get(
    "/all",
    response_model=
    list[
        TreatmentScheduleResponse
    ]
)
def get_all_schedules(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    schedules = (
        db.query(
            TreatmentSchedule
        )
        .all()
    )

    return schedules


@router.get(
    "/my-today",
    response_model=
    list[
        TreatmentScheduleResponse
    ]
)
def get_my_today_schedule(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):
    today = date.today()

    schedules = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule
            .therapist_id
            ==
            current_user.id,

            TreatmentSchedule.status == "scheduled",

            or_(

                # One-time
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "one_time",

                    TreatmentSchedule
                    .treatment_date
                    ==
                    today
                ),

                # Recurring
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "recurring",

                    TreatmentSchedule
                    .start_date
                    <=
                    today,

                    TreatmentSchedule
                    .end_date
                    >=
                    today
                )
            )
        )
        .order_by(
            TreatmentSchedule
            .in_time
        )
        .all()
    )

    for schedule in schedules:
        schedule.doctor_name = schedule.doctor.name if schedule.doctor else None
        schedule.therapist_name = schedule.therapist.username if schedule.therapist else None

    return schedules


@router.get("/my-upcoming",response_model=list[ TreatmentScheduleResponse ])   
def get_my_upcoming_schedule (db: Session = Depends(get_db),

        current_user:
        User = Depends(
            require_role(
                ["therapist"]
            )
        )
    ):
        today = date.today()

        schedules = (
            db.query(
                TreatmentSchedule
            )
            .filter(
                TreatmentSchedule
                .therapist_id
                ==
                current_user.id,

                    TreatmentSchedule.status == "scheduled",

                or_(

                    # One-time upcoming
                    and_(
                        TreatmentSchedule
                        .schedule_type
                        ==
                        "one_time",

                        TreatmentSchedule
                        .treatment_date
                        >=
                        today
                    ),

                    # Recurring active/upcoming
                    and_(
                        TreatmentSchedule
                        .schedule_type
                        ==
                        "recurring",

                        TreatmentSchedule
                        .end_date
                        >=
                        today
                    )
                )
            )
            .order_by(
                TreatmentSchedule
                .in_time
            )
            .all()
        )

        return schedules

@router.put("/{schedule_id}/complete", response_model=TreatmentScheduleResponse)
def complete_treatment(
    schedule_id: int,
    completion_notes: str | None = Form(None),
    transport_mode: str = Form("vehicle"),
    arrival_latitude: float | None = Form(None),
    arrival_longitude: float | None = Form(None),
    bill_amount: float | None = Form(None),
    invoice_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    travel_entry = None

    try:
        schedule = (
            db.query(TreatmentSchedule)
            .filter(TreatmentSchedule.id == schedule_id)
            .first()
        )

        if not schedule:
            raise HTTPException(
                status_code=404,
                detail="Schedule not found"
            )

        if schedule.therapist_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

        if schedule.status == "completed":
            raise HTTPException(
                status_code=400,
                detail="Treatment is already completed"
            )

        selected_transport_mode = (transport_mode or "vehicle").lower()

        if selected_transport_mode != "vehicle" and (
            bill_amount is None or invoice_file is None
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Bill amount and invoice are required "
                    "for non-vehicle transport"
                ),
            )

        if arrival_latitude is None or arrival_longitude is None:
            raise HTTPException(
                status_code=400,
                detail="Current location is required to complete the treatment"
            )

        travel_entry = create_auto_travel_entry(
            db=db,
            schedule=schedule,
            therapist=current_user,
            arrival_latitude=arrival_latitude,
            arrival_longitude=arrival_longitude,
            transport_mode=selected_transport_mode,
            bill_amount=bill_amount,
            invoice_file=invoice_file,
        )
        schedule.status = "completed"
        schedule.completion_notes = completion_notes
        schedule.completed_at = datetime.now()
        schedule.doctor_name = (
            schedule.doctor.name if schedule.doctor else None
        )
        schedule.therapist_name = (
            schedule.therapist.username if schedule.therapist else None
        )
        schedule.arrival_warning = None

        db.commit()
    except HTTPException:
        db.rollback()
        cleanup_invoice_file(
            travel_entry.invoice_file if travel_entry else None
        )
        raise
    except ValueError as error:
        db.rollback()
        cleanup_invoice_file(
            travel_entry.invoice_file if travel_entry else None
        )
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error
    except IntegrityError as error:
        db.rollback()
        cleanup_invoice_file(
            travel_entry.invoice_file if travel_entry else None
        )

        if _is_travel_schedule_unique_violation(error):
            raise HTTPException(
                status_code=400,
                detail=TRAVEL_ENTRY_EXISTS_MESSAGE,
            ) from error

        logger.exception(
            "Database integrity error while completing schedule %s.",
            schedule_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to complete the treatment.",
        ) from error
    except Exception as error:
        db.rollback()
        cleanup_invoice_file(
            travel_entry.invoice_file if travel_entry else None
        )
        logger.exception(
            "Unexpected error while completing schedule %s.",
            schedule_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to complete the treatment.",
        ) from error

    return schedule


@router.put(
    "/{schedule_id}/missed",
    response_model=
    TreatmentScheduleResponse
)
def mark_treatment_missed(
    schedule_id: int,

    payload: MissedTreatmentRequest,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):
    schedule = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.id
            ==
            schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail=
            "Schedule not found"
        )

    if (
        schedule.therapist_id
        !=
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=
            "Access denied"
        )

    schedule.status = (
        "missed"
    )

    schedule.missed_reason = (
        payload
        .missed_reason
    )

    db.commit()

    db.refresh(
        schedule
    )

    return schedule

@router.get("/completed", response_model=list[TreatmentScheduleResponse])
def get_completed_schedules(
    db: Session = Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin", "therapist"]
        )
    )
):
    query = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.status == "completed"
        )
    )

    if current_user.role == "therapist":
        query = query.filter(
            TreatmentSchedule.therapist_id == current_user.id
        )

    schedules = (
        query
        .order_by(
            TreatmentSchedule.created_at.desc()
        )
        .all()
    )

    for schedule in schedules:
        schedule.doctor_name = schedule.doctor.name if schedule.doctor else None
        schedule.therapist_name = schedule.therapist.username if schedule.therapist else None

    return schedules


@router.get(
    "/pending",
    response_model=list[TreatmentScheduleResponse]
)
def get_pending_schedules(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin", "therapist"]
        )
    )
):
    query = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.status == "scheduled"
        )
    )

    if current_user.role == "therapist":
        query = query.filter(
            TreatmentSchedule.therapist_id == current_user.id
        )

    schedules = (
        query
        .order_by(
            TreatmentSchedule.in_time
        )
        .all()
    )

    for schedule in schedules:
        schedule.doctor_name = schedule.doctor.name if schedule.doctor else None
        schedule.therapist_name = schedule.therapist.username if schedule.therapist else None

    return schedules

@router.get("/missed",response_model=list[TreatmentScheduleResponse])
def get_missed_schedules(
    db: Session = Depends(get_db),

    current_user: User = Depends(require_role(["admin", "therapist"]))
):
    query = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.status == "missed"
        )
    )

    if current_user.role == "therapist":
        query = query.filter(
            TreatmentSchedule.therapist_id == current_user.id
        )

    schedules = (
        query
        .order_by(
            TreatmentSchedule.created_at.desc()
        )
        .all()
    )

    for schedule in schedules:
        schedule.doctor_name = schedule.doctor.name if schedule.doctor else None
        schedule.therapist_name = schedule.therapist.username if schedule.therapist else None

    return schedules    


    @router.put(
    "/{schedule_id}/cancel",
    response_model=
    TreatmentScheduleResponse
)
    def cancel_schedule(
        schedule_id: int,

        db: Session =
        Depends(get_db),

        current_user:
        User = Depends(
            require_role(
                ["admin"]
            )
        )
    ):
        schedule = (
            db.query(
                TreatmentSchedule
            )
            .filter(
                TreatmentSchedule.id
                ==
                schedule_id
            )
            .first()
        )

        if not schedule:
            raise HTTPException(
                status_code=404,
                detail=
                "Schedule not found"
            )

        schedule.status = (
            "cancelled"
        )

        db.commit()

        db.refresh(
            schedule
        )

        return schedule


@router.get(
    "/dashboard-summary"
)
def dashboard_summary(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    today = date.today()

    total_scheduled = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.status
            ==
            "scheduled",

            or_(

                # One-time
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "one_time",

                    TreatmentSchedule
                    .treatment_date
                    ==
                    today
                ),

                # Recurring
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "recurring",

                    TreatmentSchedule
                    .start_date
                    <=
                    today,

                    TreatmentSchedule
                    .end_date
                    >=
                    today
                )
            )
        )
        .count()
    )

    completed = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.status
            ==
            "completed"
        )
        .count()
    )

    missed = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.status
            ==
            "missed"
        )
        .count()
    )

    cancelled = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.status
            ==
            "cancelled"
        )
        .count()
    )

    return {
        "today_scheduled":
        total_scheduled,

        "completed":
        completed,

        "missed":
        missed,

        "cancelled":
        cancelled
    }


@router.get("/today",response_model=list[TreatmentScheduleResponse])
def get_today_schedules(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    today = date.today()

    schedules = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.status
            ==
            "scheduled",

            or_(

                # One-time
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "one_time",

                    TreatmentSchedule
                    .treatment_date
                    ==
                    today
                ),

                # Recurring
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "recurring",

                    TreatmentSchedule
                    .start_date
                    <=
                    today,

                    TreatmentSchedule
                    .end_date
                    >=
                    today
                )
            )
        )
        .order_by(
            TreatmentSchedule
            .in_time
        )
        .all()
    )

    for schedule in schedules:
        schedule.doctor_name = schedule.doctor.name if schedule.doctor else None
        schedule.therapist_name = schedule.therapist.username if schedule.therapist else None

    return schedules


@router.get(
    "/my-dashboard"
)
def therapist_dashboard(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):
    today = date.today()

    # Today's scheduled
    today_scheduled = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule
            .therapist_id
            ==
            current_user.id,

            TreatmentSchedule
            .status
            ==
            "scheduled",

            or_(

                # One-time
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "one_time",

                    TreatmentSchedule
                    .treatment_date
                    ==
                    today
                ),

                # Recurring
                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "recurring",

                    TreatmentSchedule
                    .start_date
                    <=
                    today,

                    TreatmentSchedule
                    .end_date
                    >=
                    today
                )
            )
        )
        .count()
    )

    completed_today = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule
            .therapist_id
            ==
            current_user.id,

            TreatmentSchedule
            .status
            ==
            "completed",

            func.date(
                TreatmentSchedule
                .completed_at
            )
            ==
            today
        )
        .count()
    )

    missed_today = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule
            .therapist_id
            ==
            current_user.id,

            TreatmentSchedule
            .status
            ==
            "missed"
        )
        .count()
    )

    upcoming = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule
            .therapist_id
            ==
            current_user.id,

            TreatmentSchedule
            .status
            ==
            "scheduled",

            or_(

                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "one_time",

                    TreatmentSchedule
                    .treatment_date
                    >
                    today
                ),

                and_(
                    TreatmentSchedule
                    .schedule_type
                    ==
                    "recurring",

                    TreatmentSchedule
                    .end_date
                    >
                    today
                )
            )
        )
        .count()
    )

    return {
        "today_scheduled":
        today_scheduled,

        "completed_today":
        completed_today,

        "missed_today":
        missed_today,

        "upcoming":
        upcoming
    }


@router.get("/{schedule_id}", response_model = TreatmentScheduleResponse )


def get_schedule_details(
    schedule_id: int,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            [
                "admin",
                "therapist"
            ]
        )
    )
):
    schedule = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.id
            ==
            schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail=
            "Schedule not found"
        )

    # Therapist ownership check
    if (
        current_user.role
        ==
        "therapist"
        and
        schedule.therapist_id
        !=
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=
            "Access denied"
        )

    schedule.doctor_name = schedule.doctor.name if schedule.doctor else None
    schedule.therapist_name = schedule.therapist.username if schedule.therapist else None
        
    return schedule


@router.put(
    "/{schedule_id}",
    response_model=
    TreatmentScheduleResponse
)
def update_schedule(
    schedule_id: int,

    payload:
    TreatmentScheduleUpdate,

    background_tasks: BackgroundTasks,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    schedule = (
        db.query(
            TreatmentSchedule
        )
        .filter(
            TreatmentSchedule.id
            ==
            schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail=
            "Schedule not found"
        )

    previous_therapist_id = schedule.therapist_id

    # Validate doctor
    doctor = (
        db.query(Doctor)
        .filter(
            Doctor.id
            ==
            payload.doctor_id
        )
        .first()
    )

    if not doctor:
        raise HTTPException(
            status_code=404,
            detail=
            "Doctor not found"
        )

    # Validate therapist
    therapist = (
        db.query(User)
        .filter(
            User.id
            ==
            payload.therapist_id,

            User.role
            ==
            "therapist"
        )
        .first()
    )

    if not therapist:
        raise HTTPException(
            status_code=404,
            detail=
            "Therapist not found"
        )

    # One-time validation
    if (
        payload.schedule_type
        ==
        "one_time"
    ):
        if (
            not payload
            .treatment_date
        ):
            raise HTTPException(
                status_code=400,
                detail=
                "Treatment date required"
            )

    # Recurring validation
    elif (
        payload.schedule_type
        ==
        "recurring"
    ):
        if (
            not payload
            .start_date
            or
            not payload
            .end_date
        ):
            raise HTTPException(
                status_code=400,
                detail=
                "Start and end date required"
            )

    else:
        raise HTTPException(
            status_code=400,
            detail=
            "Invalid schedule type"
        )

    address_changed = (
        payload.patient_address.strip()
        != schedule.patient_address.strip()
    )
    coordinates_missing = not has_valid_coordinates(
        schedule.patient_latitude,
        schedule.patient_longitude,
    )

    try:
        if address_changed or coordinates_missing:
            patient_latitude, patient_longitude = (
                resolve_patient_coordinates(payload.patient_address)
            )
        else:
            patient_latitude = schedule.patient_latitude
            patient_longitude = schedule.patient_longitude
    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    schedule.patient_name = (
        payload.patient_name
    )

    schedule.doctor_id = (
        payload.doctor_id
    )

    schedule.therapist_id = (
        payload.therapist_id
    )

    schedule.treatment_name = (
        payload.treatment_name
    )

    schedule.medicines = (
        payload.medicines
    )

    schedule.patient_address = (
        payload.patient_address
    )

    schedule.patient_latitude = (
        patient_latitude
    )

    schedule.patient_longitude = (
        patient_longitude
    )

    schedule.schedule_type = (
        payload.schedule_type
    )

    schedule.treatment_date = (
        payload.treatment_date
    )

    schedule.start_date = (
        payload.start_date
    )

    schedule.end_date = (
        payload.end_date
    )

    schedule.in_time = (
        payload.in_time
    )

    schedule.out_time = (
        payload.out_time
    )

    schedule.instructions = (
        payload.instructions
    )

    schedule.priority = (
        payload.priority
    )

    schedule.transport_mode = (
        payload.transport_mode
        or
        schedule.transport_mode
    )

    try:
        db.commit()
    except Exception as error:
        db.rollback()
        logger.exception(
            "Unable to update treatment schedule %s.",
            schedule_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to update the schedule.",
        ) from error

    if previous_therapist_id != therapist.id:
        background_tasks.add_task(
            notify_schedule_assigned,
            therapist.id,
            schedule.id,
        )
    else:
        background_tasks.add_task(
            notify_schedule_updated,
            therapist.id,
            schedule.id,
        )

    schedule.doctor_name = doctor.name
    schedule.therapist_name = therapist.username

    return schedule



