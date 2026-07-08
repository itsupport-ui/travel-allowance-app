import os
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


JWT_SECRET_KEY = _required_env("JWT_SECRET_KEY")
GOOGLE_MAPS_API_KEY = _required_env("GOOGLE_MAPS_API_KEY")
CORS_ORIGINS = tuple(
    origin.strip()
    for origin in _required_env("CORS_ORIGINS").split(",")
    if origin.strip()
)
UPLOAD_ROOT = Path(_required_env("UPLOAD_ROOT")).expanduser().resolve()
AUTO_CREATE_SCHEMA = _optional_bool_env("AUTO_CREATE_SCHEMA", default=False)
