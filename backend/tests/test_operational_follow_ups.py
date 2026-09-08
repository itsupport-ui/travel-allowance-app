from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.domain_audit_event import DomainAuditEvent
from app.models.operational_follow_up import OperationalFollowUp
from app.models.user import User
from app.routers import operational_follow_ups
from app.utils.auth import get_current_user
from app.utils.domain_errors import DomainHTTPException, domain_exception_handler
from app.utils.timezone import india_now


def _client_and_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    admin = User(
        username="Queue Reviewer",
        email="queue-reviewer@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    second_admin = User(
        username="Queue Owner",
        email="queue-owner@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Field User",
        email="queue-field@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    db.add_all([admin, second_admin, therapist])
    db.commit()
    for item in (admin, second_admin, therapist):
        db.refresh(item)

    current = {"user": admin}
    app = FastAPI()
    app.add_exception_handler(DomainHTTPException, domain_exception_handler)
    app.include_router(operational_follow_ups.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    return TestClient(app), db, engine, current, admin, second_admin, therapist


def test_follow_up_assignment_resolution_and_audit_history():
    client, db, engine, _current, admin, owner, _therapist = _client_and_db()
    try:
        due_date = (india_now().date() + timedelta(days=2)).isoformat()
        created = client.post(
            "/operational-follow-ups",
            json={
                "source_domain": "attendance",
                "source_entity_type": "therapist_workday",
                "source_entity_id": "42",
                "title": "Review early closure",
                "priority": "high",
                "assignee_id": owner.id,
                "due_date": due_date,
                "reason": "Confirm that the handover was completed.",
            },
        )
        assert created.status_code == 201, created.text
        row = created.json()
        assert row["status"] == "in_progress"
        assert row["assignee_name"] == "Queue Owner"
        assert "resolve" in row["available_actions"]

        listed = client.get(
            "/operational-follow-ups",
            params={"status": "in_progress", "domain": "attendance"},
        )
        assert listed.status_code == 200, listed.text
        assert listed.json()["total"] == 1

        resolved = client.put(
            f"/operational-follow-ups/{row['id']}",
            json={
                "status": "resolved",
                "version": row["version"],
                "reason": "The reviewer confirmed the handover evidence.",
            },
        )
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["status"] == "resolved"
        assert resolved.json()["resolver_name"] == admin.username
        assert resolved.json()["available_actions"] == []

        events = db.query(DomainAuditEvent).order_by(DomainAuditEvent.id).all()
        assert [event.action for event in events] == [
            "follow_up_created",
            "follow_up_resolved",
        ]
        assert all(event.related_entity_id == "42" for event in events)
    finally:
        db.close()
        engine.dispose()


def test_follow_up_guards_duplicate_permissions_and_stale_updates():
    client, db, engine, current, _admin, _owner, therapist = _client_and_db()
    try:
        payload = {
            "source_domain": "claims",
            "source_entity_type": "doctor_claim",
            "source_entity_id": "9",
            "title": "Resolve claim evidence",
            "reason": "Review the missing reimbursement evidence.",
        }
        created = client.post("/operational-follow-ups", json=payload)
        assert created.status_code == 201, created.text
        row = created.json()

        duplicate = client.post("/operational-follow-ups", json=payload)
        assert duplicate.status_code == 409
        assert duplicate.json()["code"] == "FOLLOW_UP_ALREADY_OPEN"

        db.add(OperationalFollowUp(
            source_domain="claims",
            source_entity_type="doctor_claim",
            source_entity_id="9",
            title="Concurrent duplicate",
            priority="medium",
            status="open",
            created_by=row["created_by"],
            created_reason="Simulate a request racing the API pre-check.",
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        unassigned_start = client.put(
            f"/operational-follow-ups/{row['id']}",
            json={
                "status": "in_progress",
                "version": row["version"],
                "reason": "Begin investigation of the missing evidence.",
            },
        )
        assert unassigned_start.status_code == 422
        assert unassigned_start.json()["code"] == "FOLLOW_UP_ASSIGNEE_REQUIRED"

        stale = client.put(
            f"/operational-follow-ups/{row['id']}",
            json={
                "status": "cancelled",
                "version": row["version"] + 1,
                "reason": "This request is no longer applicable.",
            },
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "FOLLOW_UP_VERSION_CONFLICT"

        current["user"] = therapist
        forbidden = client.get("/operational-follow-ups")
        assert forbidden.status_code == 403
        assert db.query(OperationalFollowUp).count() == 1
    finally:
        db.close()
        engine.dispose()
