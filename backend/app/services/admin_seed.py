"""Idempotent administrator seeding for application startup and manual use."""

import logging
import os

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.database import SessionLocal
from app.models.user import User
from app.utils.auth import hash_password


logger = logging.getLogger("uvicorn.error")

TRUE_VALUES = {"1", "true", "yes", "on"}
ADMIN_ROLE = "admin"


def _is_enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in TRUE_VALUES


def _required_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is not configured")
    return value


def _find_user_by_email(db, email: str) -> User | None:
    return (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )


def _update_existing_user(
    user: User,
    *,
    password: str,
    role: str,
    promote: bool,
    reset_password: bool,
) -> tuple[bool, bool]:
    promoted = False
    password_updated = False

    if promote:
        promoted = user.role != role or not user.is_active
        user.role = role
        user.is_active = True

    if reset_password:
        user.password_hash = hash_password(password)
        password_updated = True

    return promoted, password_updated


def ensure_admin_user() -> bool:
    """Create or verify the configured admin account.

    Returns ``True`` when seeding is disabled or completes successfully. Returns
    ``False`` after logging a sanitized configuration or database failure.
    """
    if not _is_enabled("SEED_ADMIN_ON_STARTUP"):
        logger.info("Admin seed disabled.")
        return True

    try:
        username = _required_setting("ADMIN_USERNAME")
        email = _required_setting("ADMIN_EMAIL").lower()
        password = _required_setting("ADMIN_PASSWORD")
        role = _required_setting("ADMIN_ROLE").lower()
        if role != ADMIN_ROLE:
            raise ValueError("ADMIN_ROLE must be 'admin'")
    except ValueError as exc:
        logger.error("Admin seed failed: %s.", exc)
        return False

    promote = _is_enabled("PROMOTE_EXISTING_ADMIN")
    reset_password = _is_enabled("RESET_ADMIN_PASSWORD")
    db = None

    try:
        db = SessionLocal()
        existing_user = _find_user_by_email(db, email)

        if existing_user is None:
            db.add(
                User(
                    username=username,
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                )
            )
            db.commit()
            logger.info("Admin account created successfully.")
            return True

        promoted, password_updated = _update_existing_user(
            existing_user,
            password=password,
            role=role,
            promote=promote,
            reset_password=reset_password,
        )
        db.commit()

        if promoted:
            logger.info("Existing account promoted to admin.")
        if password_updated:
            logger.info("Existing admin password updated.")
        if not promoted and not password_updated:
            if existing_user.role == ADMIN_ROLE and existing_user.is_active:
                logger.info("Admin account already exists.")
            else:
                logger.warning(
                    "Account exists but is not an active admin; "
                    "promotion is disabled."
                )
        return True
    except IntegrityError:
        if db is None:
            logger.error("Admin seed failed: IntegrityError.")
            return False
        db.rollback()
        try:
            existing_user = _find_user_by_email(db, email)
            if existing_user is not None:
                promoted, password_updated = _update_existing_user(
                    existing_user,
                    password=password,
                    role=role,
                    promote=promote,
                    reset_password=reset_password,
                )
                db.commit()
                if promoted:
                    logger.info("Existing account promoted to admin.")
                if password_updated:
                    logger.info("Existing admin password updated.")
                if not promoted and not password_updated:
                    if (
                        existing_user.role == ADMIN_ROLE
                        and existing_user.is_active
                    ):
                        logger.info("Admin account already exists.")
                    else:
                        logger.warning(
                            "Account exists but is not an active admin; "
                            "promotion is disabled."
                        )
                return True
        except SQLAlchemyError as exc:
            db.rollback()
            logger.error(
                "Admin seed failed: %s.",
                exc.__class__.__name__,
            )
            return False

        logger.error("Admin seed failed: database integrity error.")
        return False
    except SQLAlchemyError as exc:
        if db is not None:
            db.rollback()
        logger.error(
            "Admin seed failed: %s.",
            exc.__class__.__name__,
        )
        return False
    finally:
        if db is not None:
            db.close()
