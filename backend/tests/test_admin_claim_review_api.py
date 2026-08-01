import unittest
from datetime import date, datetime, time, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import claims
from app.routers.admin_claim_review import router
from app.utils.auth import get_current_user


class AdminClaimReviewApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        self.admin = self.create_user(
            "Administrator",
            "admin@example.com",
            "admin",
        )
        self.therapist = self.create_user(
            "Therapist One",
            "therapist-one@example.com",
            "therapist",
        )
        self.other_therapist = self.create_user(
            "Therapist Two",
            "therapist-two@example.com",
            "therapist",
        )

        self.pending_claim = self.create_claim(
            self.therapist,
            claim_date=date.today() - timedelta(days=3),
            amount=2500,
            distance=22,
            status="pending",
            patient_name="Patient Alpha",
        )
        self.approved_claim = self.create_claim(
            self.other_therapist,
            claim_date=date.today(),
            amount=400,
            distance=8,
            status="approved",
            patient_name="Patient Beta",
        )

        self.current_user = self.admin
        app = FastAPI()
        app.include_router(router)
        app.include_router(claims.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = (
            lambda: self.current_user
        )
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_user(self, username, email, role):
        user = User(
            username=username,
            email=email,
            password_hash="unused",
            role=role,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_claim(
        self,
        therapist,
        *,
        claim_date,
        amount,
        distance,
        status,
        patient_name,
    ):
        claim = Claim(
            therapist_id=therapist.id,
            claim_date=claim_date,
            total_km=distance,
            per_km_rate=8,
            travel_total=amount - 150,
            daily_allowance=150,
            grand_total=amount,
            status=status,
            remarks="Reviewed travel",
        )
        self.db.add(claim)
        self.db.flush()
        self.db.add(
            TravelEntry(
                therapist_id=therapist.id,
                claim_id=claim.id,
                travel_date=datetime.combine(claim_date, time(9, 30)),
                from_address="Clinic",
                to_address="Patient address",
                total_km=distance,
                per_km_rate=8,
                travel_fare=amount - 150,
                patient_visited=True,
                patient_name=patient_name,
                transport_mode="vehicle",
                status="submitted",
            )
        )
        self.db.commit()
        self.db.refresh(claim)
        return claim

    def test_returns_paginated_workflow_data_and_summary(self):
        response = self.client.get(
            "/admin-claims/review",
            params={"status": "all", "sort": "highest_amount"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(body["items"][0]["id"], self.pending_claim.id)
        self.assertEqual(
            body["items"][0]["patient_name"],
            "Patient Alpha",
        )
        self.assertEqual(body["items"][0]["patient_count"], 1)
        self.assertTrue(body["items"][0]["is_high_value"])
        self.assertTrue(body["items"][0]["is_urgent"])
        self.assertEqual(body["summary"]["pending_claims"], 1)
        self.assertEqual(body["summary"]["todays_claims"], 1)
        self.assertEqual(body["summary"]["pending_amount"], 2500)

    def test_searches_patient_and_filters_therapist(self):
        response = self.client.get(
            "/admin-claims/review",
            params={
                "status": "all",
                "search": "alpha",
                "therapist_id": self.therapist.id,
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["therapist_name"], "Therapist One")

    def test_list_query_has_no_per_claim_database_queries(self):
        for index in range(4):
            self.create_claim(
                self.therapist,
                claim_date=date.today() - timedelta(days=index + 10),
                amount=300 + index,
                distance=5 + index,
                status="pending",
                patient_name=f"Patient {index}",
            )

        statements = []

        def record_statement(
            connection,
            cursor,
            statement,
            parameters,
            context,
            executemany,
        ):
            del connection, cursor, parameters, context, executemany
            statements.append(statement)

        event.listen(
            self.engine,
            "before_cursor_execute",
            record_statement,
        )
        try:
            response = self.client.get("/admin-claims/review")
        finally:
            event.remove(
                self.engine,
                "before_cursor_execute",
                record_statement,
            )

        self.assertEqual(response.status_code, 200)
        # One statement may refresh the expired test user; claim count does
        # not affect the bounded review query count.
        self.assertLessEqual(len(statements), 4)

    def test_therapist_cannot_access_admin_review(self):
        self.current_user = self.therapist

        response = self.client.get("/admin-claims/review")

        self.assertEqual(response.status_code, 403)

    def test_admin_detail_includes_review_metadata(self):
        response = self.client.get(
            f"/claims/{self.pending_claim.id}/details"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            body["claim"]["therapist_id"],
            self.therapist.id,
        )
        self.assertEqual(body["claim"]["therapist_role"], "therapist")
        self.assertEqual(body["claim"]["notes"], "Reviewed travel")
        self.assertEqual(body["claim"]["patient_count"], 1)
        self.assertIsNotNone(body["claim"]["submitted_at"])
        self.assertIn("T", body["travels"][0]["travel_timestamp"])


if __name__ == "__main__":
    unittest.main()
