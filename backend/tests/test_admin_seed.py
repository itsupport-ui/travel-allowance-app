import os
import unittest
from unittest.mock import patch

from sqlalchemy.exc import SQLAlchemyError

from app.models.user import User
from app.services import admin_seed


class FakeQuery:
    def __init__(self, user=None, error=None):
        self.user = user
        self.error = error

    def filter(self, *_args):
        return self

    def first(self):
        if self.error is not None:
            raise self.error
        return self.user


class FakeSession:
    def __init__(self, user=None, query_error=None):
        self.user = user
        self.query_error = query_error
        self.added = None
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def query(self, _model):
        return FakeQuery(self.user, self.query_error)

    def add(self, user):
        self.added = user

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class AdminSeedTests(unittest.TestCase):
    def enabled_environment(self, **overrides):
        values = {
            "SEED_ADMIN_ON_STARTUP": "true",
            "ADMIN_USERNAME": "Test Admin",
            "ADMIN_EMAIL": " ADMIN@EXAMPLE.COM ",
            "ADMIN_PASSWORD": "test-password",
            "ADMIN_ROLE": "admin",
            "RESET_ADMIN_PASSWORD": "false",
            "PROMOTE_EXISTING_ADMIN": "false",
        }
        values.update(overrides)
        return patch.dict(os.environ, values)

    def test_disabled_seed_does_not_open_a_session(self):
        with patch.dict(os.environ, {"SEED_ADMIN_ON_STARTUP": "false"}):
            with patch.object(admin_seed, "SessionLocal") as session_factory:
                self.assertTrue(admin_seed.ensure_admin_user())
                session_factory.assert_not_called()

    def test_creates_active_admin_with_normalized_email_and_hash(self):
        session = FakeSession()
        with self.enabled_environment():
            with patch.object(admin_seed, "SessionLocal", return_value=session):
                with patch.object(
                    admin_seed,
                    "hash_password",
                    return_value="generated-hash",
                ) as hasher:
                    self.assertTrue(admin_seed.ensure_admin_user())

        self.assertIsInstance(session.added, User)
        self.assertEqual(session.added.email, "admin@example.com")
        self.assertEqual(session.added.password_hash, "generated-hash")
        self.assertEqual(session.added.role, "admin")
        self.assertTrue(session.added.is_active)
        self.assertTrue(session.committed)
        self.assertTrue(session.closed)
        hasher.assert_called_once_with("test-password")

    def test_existing_user_is_unchanged_without_explicit_flags(self):
        user = User(
            username="Existing",
            email="admin@example.com",
            password_hash="old-hash",
            role="therapist",
            is_active=False,
        )
        session = FakeSession(user=user)
        with self.enabled_environment():
            with patch.object(admin_seed, "SessionLocal", return_value=session):
                with patch.object(admin_seed, "hash_password") as hasher:
                    self.assertTrue(admin_seed.ensure_admin_user())

        self.assertEqual(user.password_hash, "old-hash")
        self.assertEqual(user.role, "therapist")
        self.assertFalse(user.is_active)
        hasher.assert_not_called()

    def test_explicit_flags_promote_activate_and_reset_password(self):
        user = User(
            username="Existing",
            email="admin@example.com",
            password_hash="old-hash",
            role="therapist",
            is_active=False,
        )
        session = FakeSession(user=user)
        with self.enabled_environment(
            PROMOTE_EXISTING_ADMIN="true",
            RESET_ADMIN_PASSWORD="true",
        ):
            with patch.object(admin_seed, "SessionLocal", return_value=session):
                with patch.object(
                    admin_seed,
                    "hash_password",
                    return_value="new-hash",
                ):
                    self.assertTrue(admin_seed.ensure_admin_user())

        self.assertEqual(user.password_hash, "new-hash")
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.is_active)

    def test_database_error_rolls_back_and_closes_session(self):
        session = FakeSession(query_error=SQLAlchemyError("unavailable"))
        with self.enabled_environment():
            with patch.object(admin_seed, "SessionLocal", return_value=session):
                self.assertFalse(admin_seed.ensure_admin_user())

        self.assertTrue(session.rolled_back)
        self.assertTrue(session.closed)

    def test_session_creation_error_is_sanitized(self):
        with self.enabled_environment():
            with patch.object(
                admin_seed,
                "SessionLocal",
                side_effect=SQLAlchemyError("unavailable"),
            ):
                self.assertFalse(admin_seed.ensure_admin_user())


if __name__ == "__main__":
    unittest.main()
