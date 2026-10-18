from datetime import date, timedelta
from unittest.mock import patch

from app.models.doctor_expense import DoctorExpense
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.reimbursement_policy import ReimbursementPolicy
from app.routers import doctor_claim, doctor_expense
from app.services.clinical_activity_report_service import (
    get_clinical_activity_rows,
    summarize_clinical_activity,
)
from app.utils.timezone import india_now
from tests import test_doctor_tasks_api


class DoctorTaskClaimTests(test_doctor_tasks_api.TaskApiFixture):
    """Task expenses, the day-end claim, and reporting."""

    def setUp(self):
        super().setUp()
        self.client.app.include_router(doctor_expense.router)
        self.client.app.include_router(doctor_claim.router)
        self.db.add(
            ReimbursementPolicy(
                version=1,
                effective_from=date.today() - timedelta(days=30),
                per_km_rate=8,
                daily_allowance=150,
            )
        )
        self.db.commit()

    def start_day_with_origin(self):
        workday = self.start_workday()
        self.db.add(
            DoctorTravelWaypoint(
                doctor_id=self.doctor.id,
                workday_id=workday.id,
                waypoint_type="START",
                sequence_number=1,
                address="Home",
                latitude=12.95,
                longitude=79.95,
            )
        )
        self.db.commit()
        return workday

    def complete_task(self, **assign_overrides):
        task_id = self.assign(**assign_overrides).json()["id"]
        self.as_doctor()
        with patch(
            "app.services.doctor_attendance_service.calculate_distance_km",
            return_value=4.0,
        ):
            punched = self.client.post(
                f"/doctor-tasks/{task_id}/punch-in",
                json=self.punch_body(),
            )
        self.assertEqual(punched.status_code, 200, punched.text)
        self.assertEqual(self.punch_out(task_id).status_code, 200)
        return task_id

    def create_expense(self, **fields):
        data = {
            "expense_date": india_now().date().isoformat(),
            "transport_mode": "car",
            "expense_category": "mileage",
        }
        data.update(fields)
        return self.client.post("/doctor-expenses/", data=data)

    def test_task_expense_uses_the_task_route_and_joins_the_claim(self):
        self.start_day_with_origin()
        task_id = self.complete_task()

        options = self.client.get("/doctor-tasks/today/completed")
        self.assertEqual(options.status_code, 200, options.text)
        self.assertEqual([item["id"] for item in options.json()], [task_id])

        before = self.client.get("/doctor-tasks/day-summary").json()
        self.assertEqual(before["completed"], 1)
        self.assertEqual(before["completed_without_expense"], 1)

        expense = self.create_expense(task_id=str(task_id))
        self.assertEqual(expense.status_code, 201, expense.text)
        body = expense.json()
        self.assertEqual(body["task_id"], task_id)
        self.assertIsNone(body["visit_id"])
        self.assertEqual(body["distance_km"], 4.0)
        self.assertEqual(body["fare"], 32.0)
        self.assertIsNone(body["manual_review_status"])
        self.assertEqual(body["available_actions"], [])

        duplicate = self.create_expense(task_id=str(task_id))
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(
            self.client.get("/doctor-tasks/today/completed").json(),
            [],
        )
        after = self.client.get("/doctor-tasks/day-summary").json()
        self.assertEqual(after["completed_without_expense"], 0)
        self.assertTrue(after["tasks"][0]["has_proof"])
        self.assertTrue(after["tasks"][0]["has_expense"])

        preview = self.client.get("/doctor-claims/preview")
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["state"], "ready")
        self.assertEqual(preview.json()["expense_total"], 32.0)

        submitted = self.client.post("/doctor-claims/submit")
        self.assertEqual(submitted.status_code, 201, submitted.text)
        self.assertEqual(submitted.json()["expense_count"], 1)
        self.assertIsNotNone(self.db.query(DoctorExpense).one().claim_id)

    def test_task_expense_rejects_unfinished_tasks_and_ambiguous_links(self):
        self.start_day_with_origin()
        unfinished = self.assign().json()["id"]
        self.as_doctor()

        not_done = self.create_expense(task_id=str(unfinished))
        self.assertEqual(not_done.status_code, 400)

        both = self.create_expense(task_id=str(unfinished), visit_id="1")
        self.assertEqual(both.status_code, 422)

        summary = self.client.get("/doctor-tasks/day-summary").json()
        self.assertEqual(summary["unfinished"], 1)
        self.assertEqual(summary["completed"], 0)

    def test_other_doctors_cannot_expense_a_task(self):
        self.start_day_with_origin()
        task_id = self.complete_task()
        self.current_user = self.other_user

        response = self.create_expense(task_id=str(task_id))

        self.assertEqual(response.status_code, 400)

    def test_clinical_activity_register_lists_tasks_but_not_visit_wrappers(self):
        self.assign()
        self.assign(
            task_type="patient_visit",
            place_id=None,
            title="Pre-therapy visit",
            patient_name="Patient Alpha",
            patient_phone="9000000000",
            patient_address="Anna Nagar",
            visit_time="10:00:00",
        )
        today = india_now().date()

        rows = get_clinical_activity_rows(
            self.db,
            from_date=today,
            to_date=today + timedelta(days=1),
            status="all",
            role="doctor",
            row_limit=50,
        )

        task_rows = [row for row in rows if row[2] == "Doctor task"]
        self.assertEqual(len(task_rows), 1)
        self.assertEqual(task_rows[0][5], "scheduled")
        self.assertEqual(task_rows[0][10], "No proof")
        self.assertEqual(sum(1 for row in rows if row[2] == "Doctor visit"), 1)
        self.assertEqual(summarize_clinical_activity(rows)["doctor_tasks"], 1)

        completed_only = get_clinical_activity_rows(
            self.db,
            from_date=today,
            to_date=today,
            status="completed",
            role="doctor",
            row_limit=50,
        )
        self.assertEqual([r for r in completed_only if r[2] == "Doctor task"], [])
