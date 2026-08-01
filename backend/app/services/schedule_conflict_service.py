from __future__ import annotations

from datetime import date, time

from sqlalchemy.orm import Query, Session

from app.models.treatment_schedule import TreatmentSchedule


def schedule_date_bounds(
    *,
    schedule_type: str,
    treatment_date: date | None,
    start_date: date | None,
    end_date: date | None,
) -> tuple[date, date]:
    if schedule_type == "one_time" and treatment_date is not None:
        return treatment_date, treatment_date
    if (
        schedule_type == "recurring"
        and start_date is not None
        and end_date is not None
    ):
        return start_date, end_date
    raise ValueError("Valid schedule dates are required.")


def overlapping_schedule_query(
    db: Session,
    *,
    therapist_id: int,
    schedule_type: str,
    treatment_date: date | None,
    start_date: date | None,
    end_date: date | None,
    in_time: time,
    out_time: time,
    exclude_schedule_id: int | None = None,
) -> Query:
    candidate_start, candidate_end = schedule_date_bounds(
        schedule_type=schedule_type,
        treatment_date=treatment_date,
        start_date=start_date,
        end_date=end_date,
    )

    query = db.query(TreatmentSchedule).filter(
        TreatmentSchedule.therapist_id == therapist_id,
        TreatmentSchedule.status == "scheduled",
        TreatmentSchedule.in_time < out_time,
        TreatmentSchedule.out_time > in_time,
        (
            (
                (TreatmentSchedule.schedule_type == "one_time")
                & (TreatmentSchedule.treatment_date >= candidate_start)
                & (TreatmentSchedule.treatment_date <= candidate_end)
            )
            | (
                (TreatmentSchedule.schedule_type == "recurring")
                & (TreatmentSchedule.start_date <= candidate_end)
                & (TreatmentSchedule.end_date >= candidate_start)
            )
        ),
    )

    if exclude_schedule_id is not None:
        query = query.filter(TreatmentSchedule.id != exclude_schedule_id)

    return query


def find_schedule_conflicts(
    db: Session,
    *,
    therapist_id: int,
    schedule_type: str,
    treatment_date: date | None,
    start_date: date | None,
    end_date: date | None,
    in_time: time,
    out_time: time,
    exclude_schedule_id: int | None = None,
) -> list[TreatmentSchedule]:
    return (
        overlapping_schedule_query(
            db,
            therapist_id=therapist_id,
            schedule_type=schedule_type,
            treatment_date=treatment_date,
            start_date=start_date,
            end_date=end_date,
            in_time=in_time,
            out_time=out_time,
            exclude_schedule_id=exclude_schedule_id,
        )
        .order_by(
            TreatmentSchedule.treatment_date,
            TreatmentSchedule.start_date,
            TreatmentSchedule.in_time,
        )
        .all()
    )
