import unittest
from datetime import date, time
from unittest.mock import patch

from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers.claims import approve_claim, reject_claim
from app.routers.treatment_schedule import (
    create_schedule,
    update_schedule,
)
from app.schemas.treatment_schedule import (
    TreatmentScheduleCreate,
    TreatmentScheduleUpdate,
)


class NotificationEventTests(unittest.TestCase):
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
            username="Admin",
            email="admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Therapist",
            email="therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.other_therapist = User(
            username="Other Therapist",
            email="other@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.doctor = Doctor(
            name="Doctor",
            specialization="General",
            phone="1234567890",
            active=True,
        )
        self.db.add_all(
            [
                self.admin,
                self.therapist,
                self.other_therapist,
                self.doctor,
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def schedule_payload(self, therapist_id):
        return {
            "patient_name": "Patient",
            "doctor_id": self.doctor.id,
            "therapist_id": therapist_id,
            "treatment_name": "Physiotherapy",
            "medicines": None,
            "patient_address": "Patient address",
            "schedule_type": "one_time",
            "treatment_date": date.today(),
            "start_date": None,
            "end_date": None,
            "in_time": time(10, 0),
            "out_time": time(11, 0),
            "instructions": "Instructions",
            "priority": "normal",
            "transport_mode": "vehicle",
        }

    @patch(
        "app.routers.treatment_schedule.resolve_patient_coordinates",
        return_value=(12.9716, 77.5946),
    )
    def test_schedule_create_and_update_queue_expected_events(
        self,
        _resolve_coordinates,
    ):
        create_tasks = BackgroundTasks()
        schedule = create_schedule(
            TreatmentScheduleCreate(
                **self.schedule_payload(self.therapist.id)
            ),
            create_tasks,
            self.db,
            self.admin,
        )

        self.assertEqual(len(create_tasks.tasks), 1)
        self.assertEqual(
            create_tasks.tasks[0].args,
            (self.therapist.id, schedule.id),
        )

        update_tasks = BackgroundTasks()
        update_schedule(
            schedule.id,
            TreatmentScheduleUpdate(
                **self.schedule_payload(self.other_therapist.id)
            ),
            update_tasks,
            self.db,
            self.admin,
        )

        self.assertEqual(len(update_tasks.tasks), 1)
        self.assertEqual(
            update_tasks.tasks[0].args,
            (self.other_therapist.id, schedule.id),
        )
        self.assertEqual(
            update_tasks.tasks[0].func.__name__,
            "notify_schedule_assigned",
        )

    def test_claim_decisions_queue_status_notifications(self):
        approved_claim = Claim(
            therapist_id=self.therapist.id,
            claim_date=date.today(),
            status="pending",
        )
        rejected_claim = Claim(
            therapist_id=self.therapist.id,
            claim_date=date.today(),
            status="pending",
        )
        self.db.add_all([approved_claim, rejected_claim])
        self.db.commit()

        approve_tasks = BackgroundTasks()
        approve_claim(
            approved_claim.id,
            approve_tasks,
            self.db,
            self.admin,
        )
        reject_tasks = BackgroundTasks()
        reject_claim(
            rejected_claim.id,
            reject_tasks,
            self.db,
            self.admin,
        )

        self.assertEqual(
            approve_tasks.tasks[0].args,
            (
                self.therapist.id,
                approved_claim.id,
                "approved",
            ),
        )
        self.assertEqual(
            reject_tasks.tasks[0].args,
            (
                self.therapist.id,
                rejected_claim.id,
                "rejected",
            ),
        )


if __name__ == "__main__":
    unittest.main()
