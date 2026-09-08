import os
from datetime import time
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


def _optional_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _optional_time_env(name: str, default: str) -> time:
    value = os.getenv(name, default).strip()
    try:
        return time.fromisoformat(value)
    except ValueError as error:
        raise RuntimeError(f"{name} must use HH:MM format") from error


def _optional_int_env(name: str, default: int) -> int:
    value = os.getenv(name, str(default)).strip()
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error
    if parsed < 0:
        raise RuntimeError(f"{name} cannot be negative")
    return parsed


JWT_SECRET_KEY = _required_env("JWT_SECRET_KEY")
ACCESS_TOKEN_EXPIRE_MINUTES = _optional_int_env(
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    480,
)
if not 15 <= ACCESS_TOKEN_EXPIRE_MINUTES <= 1440:
    raise RuntimeError(
        "ACCESS_TOKEN_EXPIRE_MINUTES must be between 15 and 1440"
    )
GOOGLE_MAPS_API_KEY = _required_env("GOOGLE_MAPS_API_KEY")
CORS_ORIGINS = tuple(
    origin.strip()
    for origin in _required_env("CORS_ORIGINS").split(",")
    if origin.strip()
)
UPLOAD_ROOT = Path(_required_env("UPLOAD_ROOT")).expanduser().resolve()
AUTO_CREATE_SCHEMA = _optional_bool_env("AUTO_CREATE_SCHEMA", default=False)
WORKDAY_END_TIME = _optional_time_env("WORKDAY_END_TIME", "18:00")
WORKDAY_AUTO_LOGOUT_ENABLED = _optional_bool_env(
    "WORKDAY_AUTO_LOGOUT_ENABLED",
    default=False,
)
WORKDAY_AUTO_LOGOUT_GRACE_MINUTES = _optional_int_env(
    "WORKDAY_AUTO_LOGOUT_GRACE_MINUTES",
    15,
)
REPORT_ASYNC_ROW_THRESHOLD = _optional_int_env(
    "REPORT_ASYNC_ROW_THRESHOLD",
    1000,
)
REPORT_ARTIFACT_STORAGE = os.getenv(
    "REPORT_ARTIFACT_STORAGE", "database"
).strip().lower()
if REPORT_ARTIFACT_STORAGE not in {"database", "s3"}:
    raise RuntimeError("REPORT_ARTIFACT_STORAGE must be 'database' or 's3'")
REPORT_ARTIFACT_S3_BUCKET = os.getenv("REPORT_ARTIFACT_S3_BUCKET", "").strip()
REPORT_ARTIFACT_S3_PREFIX = os.getenv(
    "REPORT_ARTIFACT_S3_PREFIX", "private/report-exports"
).strip().strip("/")
REPORT_ARTIFACT_S3_ENDPOINT_URL = (
    os.getenv("REPORT_ARTIFACT_S3_ENDPOINT_URL", "").strip() or None
)
REPORT_ARTIFACT_S3_REGION = os.getenv(
    "REPORT_ARTIFACT_S3_REGION", "ap-south-1"
).strip()
