import unittest
from datetime import time, timedelta
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_visit import DoctorVisit
from app.models.domain_audit_event import DomainAuditEvent
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers import doctor_claim, treatment_plan, treatment_schedule
from app.utils.auth import get_current_user
from app.utils.timezone import india_now


class BusinessLogicCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        self.admin = User(
            username="Correction Admin",
            email="correction-admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.doctor_user = User(
            username="Correction Doctor",
            email="correction-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.therapist = User(
            username="Correction Therapist",
            email="correction-therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.db.add_all([self.admin, self.doctor_user, self.therapist])
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Correction Doctor",
            specialization="General",
            phone="9999999999",
            active=True,
        )
        self.db.add(self.doctor)
        self.db.commit()

        app = FastAPI()
        app.include_router(doctor_claim.router)
        app.include_router(treatment_plan.router)
        app.include_router(treatment_schedule.router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.current_user = self.doctor_user
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def use_user(self, user: User) -> None:
        self.current_user = user

    def create_visit(self, *, status: str) -> DoctorVisit:
        visit = DoctorVisit(
            patient_name="Patient",
            patient_phone="9999999998",
            patient_address="Patient address",
            doctor_id=self.doctor.id,
            visit_date=india_now().date(),
            visit_time=time(10, 0),
            status=status,
            session_status="COMPLETED",
            created_by=self.admin.id,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def test_rejected_doctor_claim_can_be_resubmitted(self):
        expense = DoctorExpense(
            doctor_id=self.doctor.id,
            expense_date=india_now().date(),
            from_location="Clinic",
            to_location="Patient",
            transport_mode="car",
            fare=125.0,
            status="draft",
        )
        self.db.add(expense)
        self.db.commit()

        submitted = self.client.post("/doctor-claims/submit")
        self.assertEqual(submitted.status_code, 201, submitted.text)
        claim_id = submitted.json()["id"]
        replayed = self.client.post("/doctor-claims/submit")
        self.assertEqual(replayed.status_code, 200, replayed.text)
        self.assertEqual(replayed.json()["id"], claim_id)
        self.assertEqual(
            replayed.headers["X-Idempotent-Replay"],
            "true",
        )
        self.assertEqual(self.db.query(DoctorClaim).count(), 1)

        self.use_user(self.admin)
        rejected = self.client.put(
            f"/doctor-claims/{claim_id}/reject",
            json={"rejection_reason": "Correct the expense evidence"},
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.db.refresh(expense)
        self.assertEqual(expense.status, "draft")
        self.assertIsNone(expense.claim_id)

        self.use_user(self.doctor_user)
        resubmitted = self.client.post("/doctor-claims/submit")
        self.assertEqual(resubmitted.status_code, 201, resubmitted.text)
        self.assertEqual(resubmitted.json()["id"], claim_id)
        self.assertEqual(resubmitted.json()["revision"], 2)
        self.assertEqual(resubmitted.json()["status"], "pending")
        self.assertIsNone(resubmitted.json()["rejection_reason"])
        self.assertEqual(self.db.query(DoctorClaim).count(), 1)
        self.assertEqual(
            [
                event.action
                for event in self.db.query(DomainAuditEvent)
                .filter(DomainAuditEvent.entity_type == "doctor_claim")
                .order_by(DomainAuditEvent.id)
                .all()
            ],
            ["submitted", "changes_requested", "resubmitted"],
        )

    def test_rejected_treatment_plan_can_be_corrected_and_resubmitted(self):
        visit = self.create_visit(status="treatment_plan_submitted")
        plan = TreatmentPlan(
            doctor_visit_id=visit.id,
            doctor_id=self.doctor.id,
            patient_name=visit.patient_name,
            diagnosis="Initial diagnosis",
            treatment_plan="Initial plan",
            sessions_required=3,
            frequency="daily",
            status="submitted",
        )
        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)

        self.use_user(self.admin)
        rejected = self.client.put(
            f"/treatment-plans/{plan.id}/reject",
            json={"reason": "Clarify the diagnosis"},
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["rejection_reason"], "Clarify the diagnosis")
        self.assertEqual(rejected.json()["reviewed_by"], self.admin.id)
        self.assertEqual(
            rejected.json()["available_actions"],
            ["view_correction_status"],
        )
        self.assertEqual(
            rejected.json()["blocking_reasons"],
            ["AWAITING_DOCTOR_CORRECTION"],
        )

        self.use_user(self.doctor_user)
        resubmitted = self.client.put(
            f"/treatment-plans/{plan.id}/resubmit",
            json={
                "diagnosis": "Corrected diagnosis",
                "treatment_plan": "Corrected plan",
                "sessions_required": 4,
            },
        )
        self.assertEqual(resubmitted.status_code, 200, resubmitted.text)
        self.assertEqual(resubmitted.json()["id"], plan.id)
        self.assertEqual(resubmitted.json()["status"], "submitted")
        self.assertEqual(resubmitted.json()["revision"], 2)
        self.assertIsNone(resubmitted.json()["rejection_reason"])
        self.assertEqual(
            resubmitted.json()["available_actions"],
            ["view_review_status"],
        )
        self.assertEqual(resubmitted.json()["next_action"], "wait_for_review")
        self.db.refresh(visit)
        self.assertEqual(visit.status, "treatment_plan_submitted")
        self.assertEqual(
            [
                event.action
                for event in self.db.query(DomainAuditEvent)
                .filter(DomainAuditEvent.entity_type == "treatment_plan")
                .order_by(DomainAuditEvent.id)
                .all()
            ],
            ["changes_requested", "resubmitted"],
        )

    @patch(
        "app.routers.treatment_plan.resolve_patient_coordinates",
        return_value=(13.05, 77.55),
    )
    def test_plan_generated_schedules_store_patient_coordinates(self, _geocode):
        visit = self.create_visit(status="treatment_plan_submitted")
        plan = TreatmentPlan(
            doctor_visit_id=visit.id,
            doctor_id=self.doctor.id,
            patient_name=visit.patient_name,
            diagnosis="Diagnosis",
            treatment_plan="Physiotherapy",
            sessions_required=2,
            frequency="daily",
            status="approved",
        )
        self.db.add(plan)
        self.db.commit()

        self.use_user(self.admin)
        response = self.client.post(
            f"/treatment-plans/{plan.id}/create-schedule",
            json={
                "therapist_id": self.therapist.id,
                "treatment_date": india_now().date().isoformat(),
                "start_date": None,
                "number_of_sessions": 2,
                "in_time": "10:00:00",
                "out_time": "11:00:00",
                "priority": "normal",
                "instructions": "Standard care",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()), 2)
        schedules = self.db.query(TreatmentSchedule).all()
        self.assertTrue(
            all(
                schedule.patient_latitude == 13.05
                and schedule.patient_longitude == 77.55
                for schedule in schedules
            )
        )
        self.assertIsNotNone(schedules[0].series_id)
        self.assertTrue(
            all(
                schedule.series_id == schedules[0].series_id
                and schedule.occurrence_date == schedule.treatment_date
                for schedule in schedules
            )
        )
        schedule_event = (
            self.db.query(DomainAuditEvent)
            .filter(
                DomainAuditEvent.entity_type == "treatment_schedule_series"
            )
            .one()
        )
        self.assertEqual(schedule_event.action, "created")
        self.assertEqual(schedule_event.details["occurrence_count"], 2)

    @patch(
        "app.routers.treatment_plan.resolve_patient_coordinates",
        return_value=(13.05, 77.55),
    )
    def test_plan_generated_schedules_follow_weekly_cadence(self, _geocode):
        visit = self.create_visit(status="treatment_plan_submitted")
        plan = TreatmentPlan(
            doctor_visit_id=visit.id,
            doctor_id=self.doctor.id,
            patient_name=visit.patient_name,
            diagnosis="Diagnosis",
            treatment_plan="Physiotherapy",
            sessions_required=3,
            frequency="weekly",
            status="approved",
        )
        self.db.add(plan)
        self.db.commit()

        first_date = india_now().date()
        self.use_user(self.admin)
        response = self.client.post(
            f"/treatment-plans/{plan.id}/create-schedule",
            json={
                "therapist_id": self.therapist.id,
                "treatment_date": first_date.isoformat(),
                "number_of_sessions": 3,
                "in_time": "10:00:00",
                "out_time": "11:00:00",
                "priority": "normal",
                "instructions": "Standard care",
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(
            [item["treatment_date"] for item in response.json()],
            [
                first_date.isoformat(),
                (first_date + timedelta(days=7)).isoformat(),
                (first_date + timedelta(days=14)).isoformat(),
            ],
        )

    @patch(
        "app.routers.treatment_plan.resolve_patient_coordinates",
        return_value=(13.05, 77.55),
    )
    def test_plan_schedule_count_must_match_approved_requirement(self, _geocode):
        visit = self.create_visit(status="treatment_plan_submitted")
        plan = TreatmentPlan(
            doctor_visit_id=visit.id,
            doctor_id=self.doctor.id,
            patient_name=visit.patient_name,
            diagnosis="Diagnosis",
            treatment_plan="Physiotherapy",
            sessions_required=3,
            frequency="daily",
            status="approved",
        )
        self.db.add(plan)
        self.db.commit()

        self.use_user(self.admin)
        response = self.client.post(
            f"/treatment-plans/{plan.id}/create-schedule",
            json={
                "therapist_id": self.therapist.id,
                "treatment_date": india_now().date().isoformat(),
                "number_of_sessions": 2,
                "in_time": "10:00:00",
                "out_time": "11:00:00",
                "priority": "normal",
                "instructions": "Standard care",
            },
        )

        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(
            self.db.query(TreatmentSchedule)
            .filter(TreatmentSchedule.treatment_plan_id == plan.id)
            .count(),
            0,
        )

    def test_completed_schedule_cannot_be_rewritten(self):
        visit = self.create_visit(status="treatment_plan_submitted")
        schedule = TreatmentSchedule(
            patient_name=visit.patient_name,
            doctor_id=self.doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Physiotherapy",
            patient_address=visit.patient_address,
            schedule_type="one_time",
            treatment_date=visit.visit_date,
            in_time=time(10, 0),
            out_time=time(11, 0),
            instructions="Completed care",
            priority="normal",
            status="completed",
            session_status="COMPLETED",
        )
        self.db.add(schedule)
        self.db.commit()

        self.use_user(self.admin)
        response = self.client.put(
            f"/schedule/{schedule.id}",
            json={
                "patient_name": "Changed patient",
                "doctor_id": self.doctor.id,
                "therapist_id": self.therapist.id,
                "treatment_name": "Changed treatment",
                "patient_address": visit.patient_address,
                "schedule_type": "one_time",
                "treatment_date": visit.visit_date.isoformat(),
                "in_time": "10:00:00",
                "out_time": "11:00:00",
                "instructions": "Changed instructions",
                "priority": "normal",
            },
        )

        self.assertEqual(response.status_code, 409, response.text)
        self.db.refresh(schedule)
        self.assertEqual(schedule.patient_name, visit.patient_name)

    @patch(
        "app.routers.treatment_schedule.resolve_patient_coordinates",
        return_value=(13.05, 77.55),
    )
    def test_recurring_schedule_creates_independent_dated_occurrences(
        self,
        _geocode,
    ):
        first_date = india_now().date()
        self.use_user(self.admin)
        response = self.client.post(
            "/schedule/create",
            json={
                "patient_name": "Recurring patient",
                "doctor_id": self.doctor.id,
                "therapist_id": self.therapist.id,
                "treatment_name": "Physiotherapy",
                "patient_address": "Patient address",
                "schedule_type": "recurring",
                "start_date": first_date.isoformat(),
                "end_date": (first_date + timedelta(days=4)).isoformat(),
                "cadence_days": 2,
                "in_time": "10:00:00",
                "out_time": "11:00:00",
                "instructions": "Standard care",
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["generated_occurrences"], 3)
        occurrences = (
            self.db.query(TreatmentSchedule)
            .filter(TreatmentSchedule.series_id.is_not(None))
            .order_by(TreatmentSchedule.treatment_date)
            .all()
        )
        self.assertEqual(len(occurrences), 3)
        self.assertEqual(
            [occurrence.treatment_date for occurrence in occurrences],
            [
                first_date,
                first_date + timedelta(days=2),
                first_date + timedelta(days=4),
            ],
        )
        self.assertTrue(
            all(
                occurrence.schedule_type == "one_time"
                and occurrence.occurrence_date == occurrence.treatment_date
                and occurrence.series_id == occurrences[0].series_id
                for occurrence in occurrences
            )
        )

        self.use_user(self.therapist)
        missed = self.client.put(
            f"/schedule/{occurrences[0].id}/missed",
            json={"missed_reason": "Patient unavailable"},
        )
        self.assertEqual(missed.status_code, 200, missed.text)
        series_id = occurrences[0].series_id
        first_id = occurrences[0].id
        self.db.expire_all()
        remaining = (
            self.db.query(TreatmentSchedule)
            .filter(
                TreatmentSchedule.series_id == series_id,
                TreatmentSchedule.id != first_id,
            )
            .all()
        )
        self.assertTrue(
            all(item.status == "scheduled" for item in remaining)
        )


if __name__ == "__main__":
    unittest.main()
