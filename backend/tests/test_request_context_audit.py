import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.domain_audit_event import DomainAuditEvent
from app.models.user import User
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.request_context import (
    get_client_operation_id,
    normalize_client_operation_id,
    reset_client_operation_id,
    set_client_operation_id,
)


class RequestContextAuditTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(
            username="Field User",
            email="field-context@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_safe_client_operation_id_flows_into_audit_event(self):
        operation_id = "2dc6c32f-9ed7-451c-bad2-d451d8b01a56"
        token = set_client_operation_id(operation_id)
        try:
            event = record_domain_audit_event(
                self.db,
                actor_id=self.user.id,
                actor_role=self.user.role,
                domain="attendance",
                entity_type="therapist_workday",
                entity_id=11,
                action="started",
            )
            self.db.commit()
        finally:
            reset_client_operation_id(token)

        self.assertEqual(event.correlation_id, operation_id)
        self.assertIsNone(get_client_operation_id())

    def test_unsafe_operation_ids_are_ignored(self):
        self.assertIsNone(normalize_client_operation_id("short"))
        self.assertIsNone(
            normalize_client_operation_id("patient name / private note")
        )
        self.assertEqual(
            normalize_client_operation_id("offline_action:12345678"),
            "offline_action:12345678",
        )


if __name__ == "__main__":
    unittest.main()
