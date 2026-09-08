from datetime import datetime, timezone

from jose import jwt

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_SECRET_KEY
from app.utils.auth import algorithm, create_access_token


def test_access_token_uses_configured_bounded_utc_lifetime():
    token = create_access_token({"sub": "123"})
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[algorithm])

    issued_at = datetime.fromtimestamp(payload["iat"], timezone.utc)
    expires_at = datetime.fromtimestamp(payload["exp"], timezone.utc)
    lifetime_minutes = (expires_at - issued_at).total_seconds() / 60

    assert lifetime_minutes == ACCESS_TOKEN_EXPIRE_MINUTES
    assert 15 <= lifetime_minutes <= 1440
