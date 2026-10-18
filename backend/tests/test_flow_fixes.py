import unittest
from datetime import date, time, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_visit import DoctorVisit
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers import doctor_consultation, doctor_visit
from app.routers.treatment_plan import _treatment_plan_response
from app.utils.auth import get_current_user
from app.utils.permissions import role_has_permission
from app.utils.timezone import india_now


class FlowFixTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        self.users = {
            role: self.create_user(role)
            for role in (
                "admin",
                "clinical_head",
                "telecaller",
                "therapist",
                "doctor",
            )
        }
        self.doctor = Doctor(
            user_id=self.users["doctor"].id,
            name="Dr. Meera",
            specialization="Physiotherapy",
            active=True,
        )
        self.db.add(self.doctor)
        self.db.commit()

        self.current_user = self.users["clinical_head"]
        app = FastAPI()
        app.include_router(doctor_visit.router)
        app.include_router(doctor_consultation.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_user(self, role):
        user = User(
            username=role,
            email=f"{role}@example.com",
            password_hash="unused",
            role=role,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_visit(self, patient="Patient Alpha"):
        visit = DoctorVisit(
            patient_name=patient,
            patient_phone="9000000000",
            patient_address="Anna Nagar",
            doctor_id=self.doctor.id,
            visit_date=date.today(),
            visit_time=time(10, 0),
            created_by=self.users["clinical_head"].id,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def test_visit_scheduling_permission_is_narrow(self):
        for role in ("admin", "clinical_head", "telecaller"):
            self.assertTrue(
                role_has_permission(role, "consultations.schedule_visit"), role
            )
        for role in ("doctor", "therapist"):
            self.assertFalse(
                role_has_permission(role, "consultations.schedule_visit"), role
            )
        # Scheduling from a consultation does not open standalone visits.
        self.assertFalse(role_has_permission("telecaller", "doctor_visits.create"))

    def test_telecaller_reaches_create_visit_but_therapist_does_not(self):
        body = {
            "visit_date": (date.today() + timedelta(days=1)).isoformat(),
            "visit_time": "10:00:00",
            "lifecycle_version": 1,
        }
        self.current_user = self.users["telecaller"]
        allowed = self.client.post("/doctor-consultations/999/create-visit", json=body)
        self.current_user = self.users["therapist"]
        denied = self.client.post("/doctor-consultations/999/create-visit", json=body)

        self.assertEqual(allowed.status_code, 404, allowed.text)
        self.assertEqual(denied.status_code, 403)

    def test_clinical_head_can_view_any_visit_but_others_cannot(self):
        visit = self.create_visit()

        for role, expected in (
            ("clinical_head", 200),
            ("admin", 200),
            ("doctor", 200),
            ("telecaller", 403),
            ("therapist", 403),
        ):
            self.current_user = self.users[role]
            response = self.client.get(f"/doctor-visits/{visit.id}")
            self.assertEqual(response.status_code, expected, role)

    def test_approved_plan_warns_about_upcoming_direct_schedules(self):
        visit = self.create_visit("Patient Alpha")
        plan = TreatmentPlan(
            doctor_visit_id=visit.id,
            doctor_id=self.doctor.id,
            patient_name="Patient Alpha",
            status="approved",
        )
        self.db.add(plan)
        self.db.commit()

        def schedule(name, *, days, plan_id=None, status="scheduled"):
            self.db.add(
                TreatmentSchedule(
                    patient_name=name,
                    doctor_id=self.doctor.id,
                    therapist_id=self.users["therapist"].id,
                    treatment_name="Home physiotherapy",
                    patient_address="Anna Nagar",
                    schedule_type="one_time",
                    treatment_date=india_now().date() + timedelta(days=days),
                    occurrence_date=india_now().date() + timedelta(days=days),
                    in_time=time(9, 0),
                    out_time=time(10, 0),
                    status=status,
                    treatment_plan_id=plan_id,
                )
            )

        schedule("patient alpha", days=1)  # counts (case-insensitive)
        schedule("Patient Alpha", days=-3)  # past
        schedule("Patient Alpha", days=2, status="cancelled")
        schedule("Someone Else", days=1)
        self.db.commit()
        self.db.refresh(plan)

        admin_view = _treatment_plan_response(plan, actor_role="admin")
        doctor_view = _treatment_plan_response(plan, actor_role="doctor")

        self.assertEqual(admin_view.similar_schedule_count, 1)
        self.assertEqual(doctor_view.similar_schedule_count, 0)
        self.assertIn("generate_schedule", admin_view.available_actions)


if __name__ == "__main__":
    unittest.main()
