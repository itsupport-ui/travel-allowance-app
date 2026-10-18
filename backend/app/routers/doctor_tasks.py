from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_task import DoctorTask
from app.models.doctor_visit import DoctorVisit
from app.models.place import Place
from app.models.user import User
from app.schemas.doctor_task import (
    DoctorTaskCancel,
    DoctorTaskCreate,
    DoctorTaskDayItem,
    DoctorTaskDaySummary,
    DoctorTaskExpenseOption,
    DoctorTaskPunchRequest,
    DoctorTaskResponse,
)
from app.services.doctor_attendance_service import (
    append_doctor_waypoint,
    apply_doctor_visit_status,
    elapsed_seconds,
    get_current_doctor,
    get_doctor_workday,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.services.location_exception_service import (
    consume_approved_exception,
    validate_action_location_evidence,
)
from app.services.location_policy_service import get_location_policy
from app.services.place_location_service import (
    place_radius_m,
    validate_place_arrival,
)
from app.utils.auth import require_permission
from app.utils.domain_errors import DomainHTTPException
from app.utils.timezone import india_now
from app.utils.uploads import (
    UploadValidationError,
    delete_stored_upload,
    resolve_stored_upload,
    store_validated_upload,
)

router = APIRouter(prefix="/doctor-tasks", tags=["Doctor Tasks"])

PROOF_SUBDIRECTORY = "doctor_tasks"
SCOPES = {"today", "upcoming", "history"}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _visit_state(visit: DoctorVisit) -> tuple[str, str]:
    """Map a linked visit onto task status / session status."""
    if visit.status == "cancelled":
        return "cancelled", visit.session_status
    if visit.status in {"visited", "treatment_plan_submitted"}:
        return "completed", "COMPLETED"
    if visit.session_status == "IN_PROGRESS":
        return "in_progress", "IN_PROGRESS"
    return "assigned", visit.session_status


def _task_response(
    task: DoctorTask,
    *,
    today: date,
    policy_radius_m: float,
) -> DoctorTaskResponse:
    visit = task.doctor_visit
    place = task.place
    via_visit = task.task_type == "patient_visit" and visit is not None
    if via_visit:
        task_status, session_status = _visit_state(visit)
        punch_in_time = visit.punch_in_time
        punch_out_time = visit.punch_out_time
        duration = visit.treatment_duration
    else:
        task_status, session_status = task.status, task.session_status
        punch_in_time = task.punch_in_time
        punch_out_time = task.punch_out_time
        duration = task.duration_seconds

    due_today = task.scheduled_date == today
    return DoctorTaskResponse(
        id=task.id,
        task_type=task.task_type,
        title=task.title,
        notes=task.notes,
        doctor_id=task.doctor_id,
        doctor_name=_doctor_name(task),
        assigned_by=task.assigned_by,
        scheduled_date=task.scheduled_date,
        status=task_status,
        session_status=session_status,
        place=place,
        doctor_visit_id=task.doctor_visit_id,
        patient_name=visit.patient_name if visit else None,
        patient_address=visit.patient_address if visit else None,
        visit_time=visit.visit_time if visit else None,
        punch_in_time=punch_in_time,
        punch_out_time=punch_out_time,
        duration_seconds=duration,
        has_proof=bool(task.proof_file),
        completion_notes=task.completion_notes,
        cancel_reason=task.cancel_reason,
        punch_via_visit=via_visit,
        can_punch_in=(
            not via_visit
            and due_today
            and task_status == "assigned"
            and session_status == "NOT_STARTED"
        ),
        can_punch_out=(
            not via_visit
            and task_status == "in_progress"
            and session_status == "IN_PROGRESS"
        ),
        geofence_radius_m=(
            place_radius_m(place, policy_radius_m) if place is not None else None
        ),
    )


def _doctor_name(task: DoctorTask) -> str | None:
    return getattr(task, "_doctor_name", None)


def _responses(
    db: Session,
    tasks: list[DoctorTask],
) -> list[DoctorTaskResponse]:
    today = india_now().date()
    policy = get_location_policy(db, today)
    doctor_ids = {task.doctor_id for task in tasks}
    names = {
        doctor.id: doctor.name
        for doctor in db.query(Doctor).filter(Doctor.id.in_(doctor_ids)).all()
    } if doctor_ids else {}
    for task in tasks:
        task._doctor_name = names.get(task.doctor_id)
    return [
        _task_response(
            task,
            today=today,
            policy_radius_m=policy.geofence_radius_m,
        )
        for task in tasks
    ]


def _get_task(
    db: Session,
    task_id: int,
    *,
    doctor_id: int | None = None,
    for_update: bool = False,
) -> DoctorTask:
    query = db.query(DoctorTask).filter(DoctorTask.id == task_id)
    if doctor_id is not None:
        query = query.filter(DoctorTask.doctor_id == doctor_id)
    if for_update:
        query = query.with_for_update()
    task = query.first()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor task not found.",
        )
    return task


def has_active_field_work(
    db: Session,
    doctor_id: int,
    *,
    exclude_task_id: int | None = None,
) -> bool:
    """True while the doctor is punched in to a task or a patient visit."""
    task_query = db.query(DoctorTask.id).filter(
        DoctorTask.doctor_id == doctor_id,
        DoctorTask.task_type != "patient_visit",
        DoctorTask.session_status == "IN_PROGRESS",
    )
    if exclude_task_id is not None:
        task_query = task_query.filter(DoctorTask.id != exclude_task_id)
    if task_query.first() is not None:
        return True
    return (
        db.query(DoctorVisit.id)
        .filter(
            DoctorVisit.doctor_id == doctor_id,
            DoctorVisit.status == "scheduled",
            DoctorVisit.session_status == "IN_PROGRESS",
        )
        .first()
        is not None
    )


def _require_active_workday(db: Session, doctor_id: int, today: date):
    workday = get_doctor_workday(db, doctor_id, today, active_only=True)
    if workday is None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="WORKDAY_NOT_ACTIVE",
            message="Start your workday before punching in.",
            recoverable=True,
            suggested_action="start_workday",
        )
    return workday


def _verify_location(
    db: Session,
    *,
    task: DoctorTask,
    payload: DoctorTaskPunchRequest,
    current_user: User,
    action: str,
    today: date,
):
    policy = get_location_policy(db, today)
    try:
        validate_action_location_evidence(
            device_timestamp=payload.device_timestamp,
            gps_accuracy_m=payload.gps_accuracy_m,
            accuracy_threshold_m=policy.gps_accuracy_threshold_m,
            max_age_minutes=policy.evidence_max_age_minutes,
        )
        validate_place_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            place=task.place,
            radius_m=place_radius_m(task.place, policy.geofence_radius_m),
        )
    except ValueError as error:
        return consume_approved_exception(
            db,
            exception_id=payload.location_exception_id,
            requested_by=current_user.id,
            target_type="doctor_task",
            target_id=task.id,
            action=action,
            latitude=payload.latitude,
            longitude=payload.longitude,
            verification_message=str(error),
        )
    return None


def _reject_visit_task(task: DoctorTask) -> None:
    if task.task_type == "patient_visit":
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="USE_VISIT_PUNCH",
            message="Patient visit tasks are punched in from the linked visit.",
            recoverable=True,
            suggested_action="open_linked_visit",
        )


# --------------------------------------------------------------------------
# assigner endpoints
# --------------------------------------------------------------------------
@router.post(
    "",
    response_model=DoctorTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_task(
    payload: DoctorTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.assign")),
):
    today = india_now().date()
    if payload.scheduled_date < today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign a task in the past.",
        )
    doctor = (
        db.query(Doctor)
        .filter(Doctor.id == payload.doctor_id, Doctor.active.is_(True))
        .first()
    )
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    visit = None
    if payload.task_type == "patient_visit":
        visit = DoctorVisit(
            patient_name=payload.patient_name.strip(),
            patient_phone=payload.patient_phone.strip(),
            patient_address=payload.patient_address.strip(),
            doctor_id=doctor.id,
            visit_date=payload.scheduled_date,
            visit_time=payload.visit_time,
            chief_complaint=payload.chief_complaint,
            remarks=payload.notes,
            created_by=current_user.id,
        )
        db.add(visit)
        db.flush()
    else:
        place = (
            db.query(Place)
            .filter(Place.id == payload.place_id, Place.active.is_(True))
            .first()
        )
        if place is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Place not found.",
            )

    task = DoctorTask(
        task_type=payload.task_type,
        title=payload.title.strip(),
        notes=payload.notes,
        assigned_by=current_user.id,
        doctor_id=doctor.id,
        scheduled_date=payload.scheduled_date,
        place_id=None if visit else payload.place_id,
        doctor_visit_id=visit.id if visit else None,
    )
    db.add(task)
    db.flush()
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="doctor_task",
        entity_id=task.id,
        action="assigned",
        business_date=task.scheduled_date,
        from_state="not_created",
        to_state="assigned",
        details={"task_type": task.task_type, "doctor_id": doctor.id},
    )
    db.commit()
    db.refresh(task)
    return _responses(db, [task])[0]


@router.get("", response_model=list[DoctorTaskResponse])
def list_tasks(
    doctor_id: int | None = Query(default=None, ge=1),
    scheduled_date: date | None = Query(default=None),
    task_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("doctor_tasks.assign")),
):
    query = db.query(DoctorTask)
    if doctor_id is not None:
        query = query.filter(DoctorTask.doctor_id == doctor_id)
    if scheduled_date is not None:
        query = query.filter(DoctorTask.scheduled_date == scheduled_date)
    tasks = (
        query.order_by(DoctorTask.scheduled_date.desc(), DoctorTask.id.desc())
        .limit(limit)
        .all()
    )
    responses = _responses(db, tasks)
    if task_status is not None:
        responses = [item for item in responses if item.status == task_status]
    return responses


@router.post("/{task_id}/cancel", response_model=DoctorTaskResponse)
def cancel_task(
    task_id: int,
    payload: DoctorTaskCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.assign")),
):
    task = _get_task(db, task_id, for_update=True)
    visit = task.doctor_visit
    if visit is not None:
        current_status, session_status = _visit_state(visit)
    else:
        current_status, session_status = task.status, task.session_status
    if current_status != "assigned" or session_status != "NOT_STARTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only tasks that have not started can be cancelled.",
        )
    if visit is not None:
        apply_doctor_visit_status(
            visit,
            "cancelled",
            remarks=payload.reason,
        )
    task.status = "cancelled"
    task.cancel_reason = payload.reason.strip()
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="doctor_task",
        entity_id=task.id,
        action="cancelled",
        business_date=task.scheduled_date,
        from_state="assigned",
        to_state="cancelled",
        reason=payload.reason,
    )
    db.commit()
    db.refresh(task)
    return _responses(db, [task])[0]


# --------------------------------------------------------------------------
# doctor endpoints
# --------------------------------------------------------------------------
@router.get("/my", response_model=list[DoctorTaskResponse])
def my_tasks(
    scope: str = Query(default="today"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    if scope not in SCOPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scope must be today, upcoming or history.",
        )
    doctor = get_current_doctor(db, current_user)
    today = india_now().date()
    query = db.query(DoctorTask).filter(DoctorTask.doctor_id == doctor.id)
    if scope == "today":
        query = query.filter(DoctorTask.scheduled_date == today).order_by(
            DoctorTask.id
        )
    elif scope == "upcoming":
        query = query.filter(DoctorTask.scheduled_date > today).order_by(
            DoctorTask.scheduled_date, DoctorTask.id
        )
    else:
        query = query.filter(DoctorTask.scheduled_date < today).order_by(
            DoctorTask.scheduled_date.desc(), DoctorTask.id.desc()
        )
    return _responses(db, query.limit(100).all())


@router.get("/today/completed", response_model=list[DoctorTaskExpenseOption])
def completed_tasks_without_expense(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    """Completed non-visit tasks from today that can still take an expense."""
    doctor = get_current_doctor(db, current_user)
    tasks = (
        db.query(DoctorTask)
        .outerjoin(DoctorExpense, DoctorExpense.task_id == DoctorTask.id)
        .filter(
            DoctorTask.doctor_id == doctor.id,
            DoctorTask.task_type != "patient_visit",
            DoctorTask.scheduled_date == india_now().date(),
            DoctorTask.status == "completed",
            DoctorExpense.id.is_(None),
        )
        .order_by(DoctorTask.punch_in_time)
        .all()
    )
    return [
        DoctorTaskExpenseOption(
            id=task.id,
            title=task.title,
            task_type=task.task_type,
            place_name=task.place.name if task.place else None,
            punch_in_time=task.punch_in_time,
            punch_out_time=task.punch_out_time,
        )
        for task in tasks
    ]


@router.get("/day-summary", response_model=DoctorTaskDaySummary)
def day_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    """Today's tasks with proof and expense state, for the day-end screen."""
    doctor = get_current_doctor(db, current_user)
    today = india_now().date()
    tasks = (
        db.query(DoctorTask)
        .filter(
            DoctorTask.doctor_id == doctor.id,
            DoctorTask.scheduled_date == today,
            DoctorTask.status != "cancelled",
        )
        .order_by(DoctorTask.id)
        .all()
    )
    task_ids = [task.id for task in tasks]
    visit_ids = [task.doctor_visit_id for task in tasks if task.doctor_visit_id]
    task_expenses = (
        {
            row[0]
            for row in db.query(DoctorExpense.task_id)
            .filter(DoctorExpense.task_id.in_(task_ids))
            .all()
        }
        if task_ids
        else set()
    )
    visit_expenses = (
        {
            row[0]
            for row in db.query(DoctorExpense.visit_id)
            .filter(DoctorExpense.visit_id.in_(visit_ids))
            .all()
        }
        if visit_ids
        else set()
    )

    items: list[DoctorTaskDayItem] = []
    for task in tasks:
        via_visit = task.task_type == "patient_visit" and task.doctor_visit
        task_status = (
            _visit_state(task.doctor_visit)[0] if via_visit else task.status
        )
        items.append(
            DoctorTaskDayItem(
                id=task.id,
                title=task.title,
                task_type=task.task_type,
                status=task_status,
                proof_required=not via_visit,
                has_proof=bool(task.proof_file),
                has_expense=(
                    task.doctor_visit_id in visit_expenses
                    if via_visit
                    else task.id in task_expenses
                ),
            )
        )
    completed = [item for item in items if item.status == "completed"]
    return DoctorTaskDaySummary(
        business_date=today,
        total=len(items),
        completed=len(completed),
        unfinished=sum(
            1 for item in items if item.status in {"assigned", "in_progress"}
        ),
        completed_without_expense=sum(
            1 for item in completed if not item.has_expense
        ),
        tasks=items,
    )


@router.get("/{task_id}", response_model=DoctorTaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    doctor = get_current_doctor(db, current_user)
    return _responses(db, [_get_task(db, task_id, doctor_id=doctor.id)])[0]


@router.post("/{task_id}/punch-in", response_model=DoctorTaskResponse)
def punch_in_task(
    task_id: int,
    payload: DoctorTaskPunchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    today = india_now().date()
    doctor = get_current_doctor(db, current_user)
    task = _get_task(db, task_id, doctor_id=doctor.id, for_update=True)
    _reject_visit_task(task)

    if task.session_status == "IN_PROGRESS":
        return _responses(db, [task])[0]
    workday = _require_active_workday(db, doctor.id, today)
    if task.scheduled_date != today:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="TASK_NOT_DUE_TODAY",
            message="Punch In is available only on the task date.",
            recoverable=False,
            suggested_action="view_task_date",
            blocking_fields=["scheduled_date"],
        )
    if task.status != "assigned" or task.session_status != "NOT_STARTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This task cannot be punched in.",
        )
    if has_active_field_work(db, doctor.id, exclude_task_id=task.id):
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="ANOTHER_WORK_IS_ACTIVE",
            message=(
                "Punch out from your active task or visit before "
                "starting another."
            ),
            recoverable=True,
            suggested_action="punch_out_active_work",
        )

    exception_used = _verify_location(
        db,
        task=task,
        payload=payload,
        current_user=current_user,
        action="punch_in",
        today=today,
    )
    punched_in_at = datetime.now(timezone.utc)
    task.punch_in_time = punched_in_at
    task.punch_in_latitude = payload.latitude
    task.punch_in_longitude = payload.longitude
    task.session_status = "IN_PROGRESS"
    task.status = "in_progress"
    append_doctor_waypoint(
        db,
        doctor_id=doctor.id,
        workday_id=workday.id,
        waypoint_type="TASK",
        latitude=task.place.latitude,
        longitude=task.place.longitude,
        address=task.place.address,
        recorded_at=punched_in_at,
        task_id=task.id,
    )
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="doctor_task",
        entity_id=task.id,
        action="punch_in",
        business_date=task.scheduled_date,
        from_state="not_started",
        to_state="in_progress",
        related_entity_type="doctor_workday",
        related_entity_id=workday.id,
        details={
            "location_exception_id": (
                exception_used.id if exception_used is not None else None
            )
        },
    )
    db.commit()
    db.refresh(task)
    return _responses(db, [task])[0]


@router.post("/{task_id}/punch-out", response_model=DoctorTaskResponse)
def punch_out_task(
    task_id: int,
    latitude: float = Form(...),
    longitude: float = Form(...),
    gps_accuracy_m: float | None = Form(default=None),
    location_exception_id: int | None = Form(default=None),
    device_timestamp: datetime | None = Form(default=None),
    notes: str | None = Form(default=None),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    try:
        payload = DoctorTaskPunchRequest(
            latitude=latitude,
            longitude=longitude,
            gps_accuracy_m=gps_accuracy_m,
            location_exception_id=location_exception_id,
            device_timestamp=device_timestamp,
        )
    except ValidationError as error:
        raise HTTPException(
            status_code=422,
            detail="The punch location is invalid.",
        ) from error

    today = india_now().date()
    doctor = get_current_doctor(db, current_user)
    task = _get_task(db, task_id, doctor_id=doctor.id, for_update=True)
    _reject_visit_task(task)

    if task.status == "completed":
        return _responses(db, [task])[0]
    workday = get_doctor_workday(db, doctor.id, today, active_only=True)
    if workday is None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="WORKDAY_NOT_ACTIVE",
            message="An active workday is required to punch out.",
            recoverable=True,
            suggested_action="resume_workday",
        )
    if (
        task.scheduled_date != today
        or task.session_status != "IN_PROGRESS"
        or task.punch_in_time is None
    ):
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="TASK_NOT_STARTED",
            message="Punch In is required before Punch Out.",
            recoverable=True,
            suggested_action="punch_in_task",
        )

    exception_used = _verify_location(
        db,
        task=task,
        payload=payload,
        current_user=current_user,
        action="punch_out",
        today=today,
    )
    try:
        stored = store_validated_upload(photo, subdirectory=PROOF_SUBDIRECTORY)
    except UploadValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    try:
        punched_out_at = datetime.now(timezone.utc)
        task.punch_out_time = punched_out_at
        task.punch_out_latitude = latitude
        task.punch_out_longitude = longitude
        task.duration_seconds = elapsed_seconds(
            task.punch_in_time,
            punched_out_at,
        )
        task.session_status = "COMPLETED"
        task.status = "completed"
        task.proof_file = str(stored)
        task.completion_notes = notes.strip() if notes else None
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="clinical",
            entity_type="doctor_task",
            entity_id=task.id,
            action="completed",
            business_date=task.scheduled_date,
            from_state="in_progress",
            to_state="completed",
            related_entity_type="doctor_workday",
            related_entity_id=workday.id,
            details={
                "duration_seconds": int(task.duration_seconds or 0),
                "location_exception_id": (
                    exception_used.id if exception_used is not None else None
                ),
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        delete_stored_upload(stored, PROOF_SUBDIRECTORY)
        raise
    db.refresh(task)
    return _responses(db, [task])[0]


# --------------------------------------------------------------------------
# proof download
# --------------------------------------------------------------------------
def _proof_response(task: DoctorTask) -> FileResponse:
    if not task.proof_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No proof was uploaded for this task.",
        )
    try:
        path = resolve_stored_upload(task.proof_file, PROOF_SUBDIRECTORY)
    except (FileNotFoundError, ValueError, OSError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The proof file is no longer available.",
        ) from error
    return FileResponse(path)


@router.get("/{task_id}/proof")
def get_task_proof(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("doctor_tasks.own")),
):
    doctor = get_current_doctor(db, current_user)
    return _proof_response(_get_task(db, task_id, doctor_id=doctor.id))


@router.get("/{task_id}/review-proof")
def review_task_proof(
    task_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("doctor_tasks.assign")),
):
    return _proof_response(_get_task(db, task_id))
