from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.doctor import Doctor
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.user import User
from app.services.maps_service import MapsServiceError, calculate_distance_km
from app.services.schedule_location_service import (
    has_valid_coordinates,
    resolve_patient_coordinates,
)
from app.utils.workflow_transitions import (
    DOCTOR_VISIT_STATUS_TRANSITIONS,
    validate_status_transition,
)


def get_current_doctor(db: Session, current_user: User) -> Doctor:
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


def get_doctor_workday(
    db: Session,
    doctor_id: int,
    work_date: date,
    *,
    active_only: bool = False,
) -> DoctorWorkDay | None:
    query = db.query(DoctorWorkDay).filter(
        DoctorWorkDay.doctor_id == doctor_id,
        DoctorWorkDay.work_date == work_date,
    )
    if active_only:
        query = query.filter(DoctorWorkDay.is_active.is_(True))
    return query.order_by(DoctorWorkDay.id.desc()).first()


def ensure_visit_coordinates(visit: DoctorVisit) -> tuple[float, float]:
    if has_valid_coordinates(
        visit.patient_latitude,
        visit.patient_longitude,
    ):
        return float(visit.patient_latitude), float(visit.patient_longitude)

    if not visit.patient_address or not visit.patient_address.strip():
        raise ValueError(
            "Patient location has not been configured. "
            "Please contact the administrator."
        )

    latitude, longitude = resolve_patient_coordinates(
        visit.patient_address,
    )
    visit.patient_latitude = latitude
    visit.patient_longitude = longitude
    return latitude, longitude


def elapsed_seconds(
    started_at: datetime | None,
    ended_at: datetime | None = None,
) -> int:
    if started_at is None:
        return 0

    end = ended_at or datetime.now(timezone.utc)
    start = started_at
    if start.tzinfo is None and end.tzinfo is not None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None and start.tzinfo is not None:
        end = end.replace(tzinfo=timezone.utc)
    return max(0, int((end - start).total_seconds()))


def append_doctor_waypoint(
    db: Session,
    *,
    doctor_id: int,
    workday_id: int,
    waypoint_type: str,
    latitude: float,
    longitude: float,
    address: str | None,
    recorded_at: datetime,
    visit_id: int | None = None,
) -> DoctorTravelWaypoint:
    if visit_id is not None:
        existing = (
            db.query(DoctorTravelWaypoint)
            .filter(
                DoctorTravelWaypoint.workday_id == workday_id,
                DoctorTravelWaypoint.visit_id == visit_id,
            )
            .first()
        )
        if existing is not None:
            return existing

    previous = (
        db.query(DoctorTravelWaypoint)
        .filter(DoctorTravelWaypoint.workday_id == workday_id)
        .order_by(DoctorTravelWaypoint.sequence_number.desc())
        .first()
    )
    next_sequence = 1 if previous is None else previous.sequence_number + 1
    distance_km = None
    if previous is not None:
        try:
            distance_km = calculate_distance_km(
                from_address=previous.address,
                to_address=address,
                from_latitude=previous.latitude,
                from_longitude=previous.longitude,
                to_latitude=latitude,
                to_longitude=longitude,
            )
        except MapsServiceError:
            # Treatment and attendance must not fail because route pricing is
            # temporarily unavailable. Expense creation retries this segment.
            distance_km = None

    waypoint = DoctorTravelWaypoint(
        doctor_id=doctor_id,
        workday_id=workday_id,
        visit_id=visit_id,
        waypoint_type=waypoint_type,
        sequence_number=next_sequence,
        address=address,
        latitude=latitude,
        longitude=longitude,
        recorded_at=recorded_at,
        distance_from_previous_km=distance_km,
    )
    db.add(waypoint)
    db.flush()
    return waypoint


def previous_waypoint(
    db: Session,
    waypoint: DoctorTravelWaypoint,
) -> DoctorTravelWaypoint | None:
    return (
        db.query(DoctorTravelWaypoint)
        .filter(
            DoctorTravelWaypoint.workday_id == waypoint.workday_id,
            DoctorTravelWaypoint.sequence_number
            < waypoint.sequence_number,
        )
        .order_by(DoctorTravelWaypoint.sequence_number.desc())
        .first()
    )


def route_distance_km(
    origin: DoctorTravelWaypoint,
    destination: DoctorTravelWaypoint,
) -> float:
    if destination.distance_from_previous_km is not None:
        return float(destination.distance_from_previous_km)

    distance_km = calculate_distance_km(
        from_address=origin.address,
        to_address=destination.address,
        from_latitude=origin.latitude,
        from_longitude=origin.longitude,
        to_latitude=destination.latitude,
        to_longitude=destination.longitude,
    )
    destination.distance_from_previous_km = distance_km
    return distance_km


def total_workday_distance(db: Session, workday_id: int) -> float:
    value = (
        db.query(
            func.coalesce(
                func.sum(
                    DoctorTravelWaypoint.distance_from_previous_km,
                ),
                0.0,
            )
        )
        .filter(DoctorTravelWaypoint.workday_id == workday_id)
        .scalar()
    )
    return round(float(value or 0), 2)


def apply_doctor_visit_status(
    visit: DoctorVisit,
    next_status: str,
    *,
    remarks: str | None = None,
    completed_at: datetime | None = None,
) -> None:
    validate_status_transition(
        entity="Doctor visit status",
        current_status=visit.status,
        next_status=next_status,
        transitions=DOCTOR_VISIT_STATUS_TRANSITIONS,
        allow_noop=True,
    )
    visit.status = next_status
    if remarks:
        visit.remarks = remarks
    if next_status == "visited":
        visit.completed_at = completed_at or datetime.now(timezone.utc)
