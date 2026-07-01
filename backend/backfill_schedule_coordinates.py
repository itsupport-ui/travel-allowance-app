from app.database import SessionLocal
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.travel import TravelEntry
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.services.schedule_location_service import resolve_patient_coordinates


def backfill_schedule_coordinates(db) -> int:
    try:
        schedules = (
            db.query(TreatmentSchedule)
            .filter(
                (TreatmentSchedule.patient_latitude.is_(None))
                | (TreatmentSchedule.patient_longitude.is_(None))
            )
            .order_by(TreatmentSchedule.id)
            .all()
        )

        if not schedules:
            return 0

        resolved_coordinates: dict[int, tuple[float, float]] = {}
        failures: list[str] = []

        for schedule in schedules:
            try:
                resolved_coordinates[schedule.id] = (
                    resolve_patient_coordinates(schedule.patient_address)
                )
            except ValueError:
                failures.append(
                    f"schedule {schedule.id}: {schedule.patient_address}"
                )

        if failures:
            raise RuntimeError(
                "Coordinate backfill aborted. Resolve these addresses first: "
                + "; ".join(failures)
            )

        for schedule in schedules:
            latitude, longitude = resolved_coordinates[schedule.id]
            schedule.patient_latitude = latitude
            schedule.patient_longitude = longitude

        db.commit()
        return len(schedules)
    except Exception:
        db.rollback()
        raise


def main() -> None:
    db = SessionLocal()

    try:
        updated_count = backfill_schedule_coordinates(db)
        if updated_count:
            print(f"Backfilled coordinates for {updated_count} schedule(s)")
        else:
            print("All treatment schedules already have patient coordinates")
    finally:
        db.close()


if __name__ == "__main__":
    main()
