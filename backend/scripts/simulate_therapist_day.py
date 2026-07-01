import argparse
from datetime import date
from pathlib import Path
import sys
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import (
    auth,
    claims,
    therapist_workday,
    treatment_schedule,
    travel,
)
from app.services.maps_service import GOOGLE_MAPS_API_KEY
from app.services.schedule_location_service import resolve_patient_coordinates
from app.utils.auth import hash_password


TEST_PASSWORD = "LocalTestPassword123!"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run an isolated three-patient therapist day against the real "
            "Google Geocoding and Routes APIs."
        )
    )
    parser.add_argument(
        "--start-address",
        required=True,
        help="Complete workday starting address.",
    )
    parser.add_argument(
        "--patient-address",
        action="append",
        dest="patient_addresses",
        required=True,
        help="Complete patient address. Supply this argument exactly three times.",
    )
    parser.add_argument(
        "--per-km-rate",
        type=float,
        default=8.0,
        help="Vehicle reimbursement rate. Default: 8.0.",
    )
    parser.add_argument(
        "--daily-allowance",
        type=float,
        default=150.0,
        help="Daily allowance. Default: 150.0.",
    )
    args = parser.parse_args()

    if len(args.patient_addresses) != 3:
        parser.error("--patient-address must be supplied exactly three times.")

    if args.per_km_rate < 0 or args.daily_allowance < 0:
        parser.error("Rates and allowances cannot be negative.")

    normalized_addresses = [
        args.start_address.strip(),
        *(address.strip() for address in args.patient_addresses),
    ]
    if any(not address for address in normalized_addresses):
        parser.error("All addresses must contain text.")

    if len(set(normalized_addresses)) != len(normalized_addresses):
        parser.error("Use four distinct addresses for a meaningful route test.")

    args.start_address = normalized_addresses[0]
    args.patient_addresses = normalized_addresses[1:]
    return args


def require_response(response, operation: str) -> dict | list:
    if response.is_success:
        return response.json()

    try:
        body = response.json()
        detail = body.get("detail", body) if isinstance(body, dict) else body
    except ValueError:
        detail = response.text

    raise RuntimeError(
        f"{operation} failed with HTTP {response.status_code}: {detail}"
    )


def assert_close(actual: float, expected: float, label: str) -> None:
    if abs(float(actual) - float(expected)) > 0.01:
        raise RuntimeError(
            f"{label} mismatch: expected {expected:.2f}, got {actual:.2f}"
        )


def build_test_app(session_factory) -> FastAPI:
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(therapist_workday.router)
    app.include_router(treatment_schedule.router)
    app.include_router(travel.router)
    app.include_router(claims.router)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return app


def seed_test_database(
    session_factory,
    *,
    daily_allowance: float,
    per_km_rate: float,
) -> tuple[int, int]:
    db = session_factory()
    try:
        admin = User(
            username="Local Smoke Admin",
            email="local-smoke-admin@example.test",
            password_hash=hash_password(TEST_PASSWORD),
            role="admin",
            is_active=True,
        )
        therapist = User(
            username="Local Smoke Therapist",
            email="local-smoke-therapist@example.test",
            password_hash=hash_password(TEST_PASSWORD),
            role="therapist",
            is_active=True,
            base_location="Test fallback address",
        )
        doctor = Doctor(
            name="Local Smoke Doctor",
            specialization="General",
            phone="0000000000",
        )
        settings = Settings(
            per_km_rate=per_km_rate,
            daily_allowance=daily_allowance,
        )
        db.add_all([admin, therapist, doctor, settings])
        db.commit()
        return doctor.id, therapist.id
    finally:
        db.close()


def login(client: TestClient, email: str) -> dict[str, str]:
    payload = require_response(
        client.post(
            "/auth/login",
            data={
                "username": email,
                "password": TEST_PASSWORD,
            },
        ),
        f"Login for {email}",
    )
    return {"Authorization": f"Bearer {payload['access_token']}"}


def create_schedules(
    client: TestClient,
    *,
    admin_headers: dict[str, str],
    doctor_id: int,
    patient_addresses: list[str],
    therapist_id: int,
) -> list[dict]:
    schedules = []
    for index, address in enumerate(patient_addresses):
        payload = {
            "patient_name": f"Smoke Test Patient {index + 1}",
            "doctor_id": doctor_id,
            "therapist_id": therapist_id,
            "treatment_name": "Physiotherapy",
            "medicines": None,
            "patient_address": address,
            "schedule_type": "one_time",
            "treatment_date": date.today().isoformat(),
            "start_date": None,
            "end_date": None,
            "in_time": f"{9 + index:02d}:00:00",
            "out_time": f"{10 + index:02d}:00:00",
            "instructions": "Local three-patient smoke test",
            "priority": "normal",
            "transport_mode": "vehicle",
        }
        schedules.append(
            require_response(
                client.post(
                    "/schedule/create",
                    json=payload,
                    headers=admin_headers,
                ),
                f"Create schedule {index + 1}",
            )
        )
    return schedules


def verify_travels(
    travels: list[dict],
    *,
    patient_addresses: list[str],
    per_km_rate: float,
    schedules: list[dict],
    start_address: str,
) -> None:
    expected_origins = [
        start_address,
        patient_addresses[0],
        patient_addresses[1],
    ]

    if len(travels) != 3:
        raise RuntimeError(f"Expected 3 travel entries, received {len(travels)}.")

    for index, travel_entry in enumerate(travels):
        if travel_entry["from_address"] != expected_origins[index]:
            raise RuntimeError(f"Travel leg {index + 1} has an incorrect origin.")
        if travel_entry["to_address"] != patient_addresses[index]:
            raise RuntimeError(f"Travel leg {index + 1} has an incorrect destination.")
        if travel_entry["schedule_id"] != schedules[index]["id"]:
            raise RuntimeError(f"Travel leg {index + 1} has an incorrect schedule.")
        if float(travel_entry["total_km"]) <= 0:
            raise RuntimeError(f"Travel leg {index + 1} did not return positive KM.")

        expected_fare = round(
            float(travel_entry["total_km"]) * per_km_rate,
            2,
        )
        assert_close(
            travel_entry["per_km_rate"],
            per_km_rate,
            f"Travel leg {index + 1} per-KM rate",
        )
        assert_close(
            travel_entry["travel_fare"],
            expected_fare,
            f"Travel leg {index + 1} fare",
        )


def print_report(travels: list[dict], claim: dict) -> None:
    print()
    print("THREE-PATIENT TRAVEL REPORT")
    print("=" * 100)
    print(f"{'Leg':<5}{'From':<28}{'To':<28}{'KM':>9}{'Rate':>10}{'Fare':>12}")
    print("-" * 100)
    for index, item in enumerate(travels, start=1):
        print(
            f"{index:<5}"
            f"{item['from_address'][:26]:<28}"
            f"{item['to_address'][:26]:<28}"
            f"{float(item['total_km']):>9.2f}"
            f"{float(item['per_km_rate']):>10.2f}"
            f"{float(item['travel_fare']):>12.2f}"
        )
    print("-" * 100)
    print(f"Total KM:        {float(claim['total_km']):.2f}")
    print(f"Travel Total:    {float(claim['travel_total']):.2f}")
    print(f"Daily Allowance: {float(claim['daily_allowance']):.2f}")
    print(f"Grand Total:     {float(claim['grand_total']):.2f}")
    print("=" * 100)


def run_simulation(args: argparse.Namespace) -> None:
    if not GOOGLE_MAPS_API_KEY:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured.")

    with tempfile.TemporaryDirectory(prefix="travel-day-smoke-") as temp_dir:
        database_path = Path(temp_dir) / "simulation.db"
        engine = create_engine(
            f"sqlite:///{database_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=engine,
        )

        try:
            Base.metadata.create_all(engine)
            doctor_id, therapist_id = seed_test_database(
                session_factory,
                daily_allowance=args.daily_allowance,
                per_km_rate=args.per_km_rate,
            )
            app = build_test_app(session_factory)

            with TestClient(app) as client:
                admin_headers = login(
                    client,
                    "local-smoke-admin@example.test",
                )
                therapist_headers = login(
                    client,
                    "local-smoke-therapist@example.test",
                )
                start_latitude, start_longitude = (
                    resolve_patient_coordinates(args.start_address)
                )
                schedules = create_schedules(
                    client,
                    admin_headers=admin_headers,
                    doctor_id=doctor_id,
                    patient_addresses=args.patient_addresses,
                    therapist_id=therapist_id,
                )

                require_response(
                    client.post(
                        "/therapist/workday/start",
                        json={
                            "start_address": args.start_address,
                            "start_latitude": start_latitude,
                            "start_longitude": start_longitude,
                        },
                        headers=therapist_headers,
                    ),
                    "Start workday",
                )

                for index, schedule in enumerate(schedules):
                    require_response(
                        client.put(
                            f"/schedule/{schedule['id']}/complete",
                            data={
                                "completion_notes": (
                                    f"Smoke test patient {index + 1}"
                                ),
                                "transport_mode": "vehicle",
                                "arrival_latitude": schedule["patient_latitude"],
                                "arrival_longitude": schedule["patient_longitude"],
                            },
                            headers=therapist_headers,
                        ),
                        f"Complete schedule {index + 1}",
                    )

                travels = require_response(
                    client.get(
                        "/travel/today",
                        headers=therapist_headers,
                    ),
                    "Load today's travel",
                )
                travels.sort(key=lambda item: item["id"])
                verify_travels(
                    travels,
                    patient_addresses=args.patient_addresses,
                    per_km_rate=args.per_km_rate,
                    schedules=schedules,
                    start_address=args.start_address,
                )

                claim = require_response(
                    client.post(
                        "/claims/submit",
                        headers=therapist_headers,
                    ),
                    "Submit today's claim",
                )
                expected_total_km = round(
                    sum(float(item["total_km"]) for item in travels),
                    2,
                )
                expected_travel_total = round(
                    sum(float(item["travel_fare"]) for item in travels),
                    2,
                )
                assert_close(claim["total_km"], expected_total_km, "Claim KM")
                assert_close(
                    claim["travel_total"],
                    expected_travel_total,
                    "Claim travel total",
                )
                assert_close(
                    claim["daily_allowance"],
                    args.daily_allowance,
                    "Claim daily allowance",
                )
                assert_close(
                    claim["grand_total"],
                    round(expected_travel_total + args.daily_allowance, 2),
                    "Claim grand total",
                )

                details = require_response(
                    client.get(
                        f"/claims/{claim['id']}/details",
                        headers=therapist_headers,
                    ),
                    "Load claim details",
                )
                if len(details["travels"]) != 3:
                    raise RuntimeError(
                        "The submitted claim is not linked to all three travels."
                    )

                print_report(travels, claim)
                print("PASS: addresses, route KM, fares, and claim totals match.")
        finally:
            engine.dispose()


def main() -> None:
    args = parse_args()

    try:
        run_simulation(args)
    except Exception as error:
        raise SystemExit(f"FAIL: {error}") from error


if __name__ == "__main__":
    main()
