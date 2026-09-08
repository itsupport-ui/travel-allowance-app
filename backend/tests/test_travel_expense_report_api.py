from datetime import date, datetime

import openpyxl
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_visit import DoctorVisit
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import reports
from app.utils.auth import get_current_user


def _build_app(db, current_user):
    app = FastAPI()
    app.include_router(reports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(app)


def _seed():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    admin = User(
        username="Admin",
        email="tep-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    sarita = User(
        username="Sarita",
        email="tep-sarita@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    priya = User(
        username="Priya",
        email="tep-priya@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    doctor_user = User(
        username="Dr John",
        email="tep-drjohn@example.com",
        password_hash="unused",
        role="doctor",
        is_active=True,
    )
    db.add_all([admin, sarita, priya, doctor_user])
    db.flush()

    doctor = Doctor(user_id=doctor_user.id, name="Dr. John", specialization="ENT")
    db.add(doctor)
    db.flush()

    # Sarita: two visits on 2026-09-01 (tests daily-allowance attribution),
    # one visit on 2026-09-10 (outside a 1-15 custom range boundary check).
    db.add(
        Claim(
            therapist_id=sarita.id,
            claim_date=date(2026, 9, 1),
            total_km=34.69,
            travel_total=104,
            daily_allowance=175,
            grand_total=279,
            status="approved",
        )
    )
    db.add_all(
        [
            TravelEntry(
                therapist_id=sarita.id,
                travel_date=datetime(2026, 9, 1, 9, 0),
                from_address="Clinic",
                to_address="Patient A House",
                total_km=16.61,
                per_km_rate=3,
                travel_fare=50,
                patient_visited=True,
                patient_name="Patient A",
                status="approved",
            ),
            TravelEntry(
                therapist_id=sarita.id,
                travel_date=datetime(2026, 9, 1, 14, 0),
                from_address="Patient A House",
                to_address="Patient B House",
                total_km=18.08,
                per_km_rate=3,
                travel_fare=54,
                patient_visited=True,
                patient_name="Patient B",
                status="approved",
            ),
            TravelEntry(
                therapist_id=sarita.id,
                travel_date=datetime(2026, 9, 10, 9, 0),
                from_address="Clinic",
                to_address="Patient C House",
                total_km=10,
                per_km_rate=3,
                travel_fare=30,
                patient_visited=True,
                patient_name="Patient C",
                status="approved",
            ),
        ]
    )

    # Priya: one visit on 2026-09-02, no claim submitted yet (daily allowance
    # should show 0 since there is no Claim row for that day).
    db.add(
        TravelEntry(
            therapist_id=priya.id,
            travel_date=datetime(2026, 9, 2, 10, 0),
            from_address="Clinic",
            to_address="Patient D House",
            total_km=12,
            per_km_rate=3,
            travel_fare=36,
            patient_visited=True,
            patient_name="Patient D",
            status="draft",
        )
    )

    # Dr. John: one visit on 2026-09-01 with a linked DoctorVisit for the
    # patient name.
    visit = DoctorVisit(
        patient_name="Patient E",
        patient_phone="9999999999",
        doctor_id=doctor.id,
        visit_date=date(2026, 9, 1),
        visit_time=datetime(2026, 9, 1, 11, 0).time(),
        created_by=admin.id,
        status="completed",
    )
    db.add(visit)
    db.flush()
    db.add(
        DoctorExpense(
            doctor_id=doctor.id,
            expense_date=date(2026, 9, 1),
            visit_id=visit.id,
            from_location="Hospital",
            to_location="Patient E House",
            distance_km=8.5,
            transport_mode="car",
            fare=60,
        )
    )
    db.commit()

    return db, admin, sarita, priya, doctor_user, doctor


def test_individual_therapist_month_report_attributes_daily_allowance_once():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={
            "person_type": "therapist",
            "person_id": sarita.id,
            "month": "2026-09",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["heading"] == "SARITA THERAPIST TRAVEL EXPENSE SEPTEMBER FROM 1 TO 30"
    assert body["row_count"] == 3
    group = body["groups"][0]
    rows = group["rows"]
    # First visit of 2026-09-01 carries the day's daily allowance, the
    # second visit that same day must show 0 so totals aren't double-counted.
    first_day_rows = [row for row in rows if row["date"] == "2026-09-01"]
    assert sorted(r["daily_allowance"] for r in first_day_rows) == [0, 175]
    for row in rows:
        assert row["total"] == row["fare"] + row["daily_allowance"] + row["others"]
    assert group["total_fare"] == 134
    assert group["total_daily_allowance"] == 175
    assert group["grand_total"] == 309


def test_individual_therapist_custom_range_is_inclusive():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={
            "person_type": "therapist",
            "person_id": sarita.id,
            "start_date": "2026-09-01",
            "end_date": "2026-09-01",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["heading"] == "SARITA THERAPIST TRAVEL EXPENSE SEPTEMBER FROM 1 TO 1"
    assert body["row_count"] == 2


def test_all_therapists_report_groups_by_person_with_subtotals():
    db, admin, _sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={"person_type": "therapist", "person_id": "all", "month": "2026-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["heading"] == "ALL THERAPISTS TRAVEL EXPENSE SEPTEMBER FROM 1 TO 30"
    names = sorted(group["person_name"] for group in body["groups"])
    assert names == ["Priya", "Sarita"]
    priya_group = next(g for g in body["groups"] if g["person_name"] == "Priya")
    # No submitted claim for Priya's day -> daily allowance is 0.
    assert priya_group["total_daily_allowance"] == 0
    # Sarita: 279 (Sep 1, fare+DA) + 30 (Sep 10, fare only) = 309; Priya: 36.
    assert body["grand_total"] == 309 + 36


def test_all_doctors_report_includes_patient_name_from_linked_visit():
    db, admin, _sarita, _priya, _doctor_user, doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={"person_type": "doctor", "person_id": "all", "month": "2026-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["heading"] == "ALL DOCTORS TRAVEL EXPENSE SEPTEMBER FROM 1 TO 30"
    group = body["groups"][0]
    assert group["person_name"] == "Dr. John"
    assert group["rows"][0]["patient_name"] == "Patient E"
    # Doctors have no daily-allowance concept in this schema.
    assert group["rows"][0]["daily_allowance"] == 0
    assert group["rows"][0]["total"] == group["rows"][0]["fare"]


def test_individual_doctor_month_report():
    db, admin, _sarita, _priya, doctor_user, doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={"person_type": "doctor", "person_id": doctor.id, "month": "2026-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["heading"] == "DR. JOHN DOCTOR TRAVEL EXPENSE SEPTEMBER FROM 1 TO 30"
    assert body["row_count"] == 1


def test_therapist_cannot_view_another_therapists_report_by_changing_person_id():
    db, _admin, sarita, priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, sarita)

    response = client.get(
        "/reports/travel-expense",
        params={
            "person_type": "therapist",
            "person_id": priya.id,
            "month": "2026-09",
        },
    )
    assert response.status_code == 200
    body = response.json()
    # The id/type the therapist supplied is ignored; they only ever see
    # their own data.
    assert body["person_name"] == "Sarita"
    assert all(
        row["patient_name"] != "Patient D"
        for group in body["groups"]
        for row in group["rows"]
    )


def test_doctor_self_service_report_is_scoped_to_own_doctor_profile():
    db, _admin, _sarita, _priya, doctor_user, doctor = _seed()
    client = _build_app(db, doctor_user)

    response = client.get(
        "/reports/travel-expense",
        params={"month": "2026-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["person_name"] == "Dr. John"
    assert body["scope"] == "individual"


def test_therapist_cannot_request_all_scope():
    db, _admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, sarita)

    response = client.get(
        "/reports/travel-expense",
        params={"person_type": "therapist", "person_id": "all", "month": "2026-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "individual"
    assert body["person_name"] == "Sarita"


def test_invalid_date_range_is_rejected():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={
            "person_type": "therapist",
            "person_id": sarita.id,
            "start_date": "2026-09-15",
            "end_date": "2026-09-01",
        },
    )
    assert response.status_code == 422


def test_month_and_custom_range_together_is_rejected():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={
            "person_type": "therapist",
            "person_id": sarita.id,
            "month": "2026-09",
            "start_date": "2026-09-01",
            "end_date": "2026-09-15",
        },
    )
    assert response.status_code == 422


def test_leap_year_february_month_resolution():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)

    response = client.get(
        "/reports/travel-expense",
        params={"person_type": "therapist", "person_id": sarita.id, "month": "2028-02"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["end_date"] == "2028-02-29"
    assert body["row_count"] == 0
    assert body["warnings"] == ["No travel expense records found for the selected period."]


def test_pdf_excel_csv_exports_all_succeed_with_matching_row_count():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)
    params = {
        "person_type": "therapist",
        "person_id": sarita.id,
        "month": "2026-09",
    }

    pdf_response = client.get("/reports/travel-expense/pdf", params=params)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.headers["x-report-row-count"] == "3"
    assert pdf_response.content.startswith(b"%PDF")
    assert "Sarita_Therapist_Travel_Expense_September_01-30_2026.pdf" in (
        pdf_response.headers["content-disposition"]
    )

    excel_response = client.get("/reports/travel-expense/excel", params=params)
    assert excel_response.status_code == 200
    workbook = openpyxl.load_workbook(filename=__import__("io").BytesIO(excel_response.content))
    sheet = workbook.active
    assert sheet["A1"].value.startswith("SARITA THERAPIST TRAVEL EXPENSE")

    csv_response = client.get("/reports/travel-expense/csv", params=params)
    assert csv_response.status_code == 200
    csv_text = csv_response.content.decode("utf-8-sig")
    lines = [line for line in csv_text.splitlines() if line]
    assert lines[0] == "Date,Patient Name,From Address,To Address,KM,Fare,Daily Allowance,Others,Total"
    assert len(lines) == 1 + 3


def test_empty_report_exports_show_friendly_message_not_broken_files():
    db, admin, sarita, _priya, _doctor_user, _doctor = _seed()
    client = _build_app(db, admin)
    params = {
        "person_type": "therapist",
        "person_id": sarita.id,
        "month": "2026-01",
    }

    csv_response = client.get("/reports/travel-expense/csv", params=params)
    assert csv_response.status_code == 200
    csv_text = csv_response.content.decode("utf-8-sig")
    assert "No travel expense records found for the selected period." in csv_text

    pdf_response = client.get("/reports/travel-expense/pdf", params=params)
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")
