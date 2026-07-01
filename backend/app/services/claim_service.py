from datetime import date, datetime
import os
from pathlib import Path
import shutil

from sqlalchemy import func

from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.services.maps_service import calculate_distance_km
from app.services.schedule_location_service import validate_patient_arrival


TRAVEL_ENTRY_EXISTS_MESSAGE = "Travel entry already exists for this schedule."
UPLOAD_ROOT = Path("uploads")


def cleanup_invoice_file(invoice_path: str | None) -> None:
    if not invoice_path:
        return

    upload_root = UPLOAD_ROOT.resolve()
    candidate = Path(invoice_path).resolve()

    try:
        candidate.relative_to(upload_root)
    except ValueError:
        return

    try:
        candidate.unlink(missing_ok=True)
    except OSError:
        pass


def create_auto_travel_entry(
    db,
    schedule,
    therapist,
    arrival_latitude=None,
    arrival_longitude=None,
    transport_mode="vehicle",
    bill_amount=None,
    invoice_file=None,
):
    """Create a travel entry without committing the caller's transaction."""
    selected_transport_mode = (transport_mode or "vehicle").lower()
    allowed_modes = {"vehicle", "auto", "bus", "metro", "cab"}

    if selected_transport_mode not in allowed_modes:
        raise ValueError("Invalid transport mode selected.")

    if selected_transport_mode != "vehicle" and (
        not bill_amount or not invoice_file
    ):
        raise ValueError(
            "Bill amount and invoice are required for non-vehicle transport."
        )

    existing_travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.therapist_id == therapist.id,
            TravelEntry.schedule_id == schedule.id,
        )
        .first()
    )

    if existing_travel:
        raise ValueError(TRAVEL_ENTRY_EXISTS_MESSAGE)

    if arrival_latitude is None or arrival_longitude is None:
        raise ValueError("Current location is required to complete the treatment.")

    validate_patient_arrival(
        arrival_latitude=arrival_latitude,
        arrival_longitude=arrival_longitude,
        patient_latitude=schedule.patient_latitude,
        patient_longitude=schedule.patient_longitude,
    )

    today = date.today()
    previous_schedule = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == therapist.id,
            TreatmentSchedule.status == "completed",
            func.date(TreatmentSchedule.completed_at) == today,
            TreatmentSchedule.id != schedule.id,
        )
        .order_by(TreatmentSchedule.completed_at.desc())
        .first()
    )

    if previous_schedule:
        from_address = previous_schedule.patient_address
        previous_travel = (
            db.query(TravelEntry)
            .filter(
                TravelEntry.therapist_id == therapist.id,
                TravelEntry.schedule_id == previous_schedule.id,
            )
            .first()
        )
        from_latitude = (
            previous_travel.arrival_latitude
            if previous_travel
            and previous_travel.arrival_latitude is not None
            else None
        )
        from_longitude = (
            previous_travel.arrival_longitude
            if previous_travel
            and previous_travel.arrival_longitude is not None
            else None
        )
    else:
        workday = (
            db.query(TherapistWorkDay)
            .filter(
                TherapistWorkDay.therapist_id == therapist.id,
                TherapistWorkDay.work_date == today,
            )
            .first()
        )
        if workday and workday.start_address:
            from_address = workday.start_address
            from_latitude = workday.start_latitude
            from_longitude = workday.start_longitude
        else:
            from_address = therapist.base_location or ""
            from_latitude = None
            from_longitude = None

    distance_km = calculate_distance_km(
        from_address=from_address,
        to_address=schedule.patient_address,
        from_latitude=from_latitude,
        from_longitude=from_longitude,
        to_latitude=schedule.patient_latitude,
        to_longitude=schedule.patient_longitude,
    )

    settings = db.query(Settings).first()
    per_km_rate = settings.per_km_rate if settings else 3.0
    travel_fare = (
        round(distance_km * per_km_rate, 2)
        if selected_transport_mode == "vehicle"
        else float(bill_amount)
    )
    invoice_path = None

    try:
        if invoice_file:
            UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
            filename = os.path.basename(invoice_file.filename or "invoice")
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
            invoice_path = str(UPLOAD_ROOT / f"{timestamp}_{filename}")

            with open(invoice_path, "wb") as buffer:
                shutil.copyfileobj(invoice_file.file, buffer)

        travel_entry = TravelEntry(
            therapist_id=therapist.id,
            schedule_id=schedule.id,
            travel_date=today,
            from_address=from_address,
            to_address=schedule.patient_address,
            total_km=distance_km,
            per_km_rate=per_km_rate,
            travel_fare=travel_fare,
            patient_visited=True,
            patient_name=schedule.patient_name,
            transport_mode=selected_transport_mode,
            bill_amount=(
                None if selected_transport_mode == "vehicle" else bill_amount
            ),
            invoice_file=invoice_path,
            status="draft",
            arrival_latitude=arrival_latitude,
            arrival_longitude=arrival_longitude,
        )
        db.add(travel_entry)
        db.flush()
        return travel_entry
    except Exception:
        cleanup_invoice_file(invoice_path)
        raise


# Legacy function kept to avoid breaking any direct references.
def create_auto_travel_claim(db, schedule, therapist):
    return create_auto_travel_entry(db, schedule, therapist)
