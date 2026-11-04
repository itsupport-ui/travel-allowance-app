from __future__ import annotations

import hashlib
import re
import secrets
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import quote

from app.config import FREELANCE_LINK_GRACE_DAYS, PUBLIC_WEB_BASE_URL
from app.utils.timezone import INDIA_TIMEZONE


def normalize_phone(raw: str) -> str:
    """Return the 10-digit Indian mobile number or raise ValueError."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise ValueError("Enter a valid 10-digit mobile number.")
    return digits


def new_token() -> tuple[str, str]:
    """Return (token to put in the link, hash to store)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_expiry(visit_date: date) -> datetime:
    """End of the visit date plus the grace period, in India time."""
    end_of_day = datetime.combine(visit_date, time(23, 59, 59), tzinfo=INDIA_TIMEZONE)
    return (end_of_day + timedelta(days=FREELANCE_LINK_GRACE_DAYS)).astimezone(
        timezone.utc
    )


def as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def link_is_live(visit) -> bool:
    return visit.status in {"assigned", "in_progress"} and as_utc(
        visit.token_expires_at
    ) > datetime.now(timezone.utc)


def visit_link(token: str) -> str:
    return f"{PUBLIC_WEB_BASE_URL}/v/{token}"


def whatsapp_message(
    *,
    freelancer_name: str,
    visit_date: date,
    start_time: time | None,
    treatment_name: str,
    fee_amount,
    link: str,
) -> str:
    when = visit_date.strftime("%d %b %Y")
    if start_time is not None:
        when += f", {start_time.strftime('%I:%M %p').lstrip('0')}"
    fee = f"{float(fee_amount):.0f}"
    return (
        f"Hello {freelancer_name}, you have a home visit assigned.\n"
        f"{treatment_name} on {when}.\n"
        f"Fee: Rs {fee}\n"
        f"Open this link for the address and to start and finish the visit "
        f"(allow location when asked):\n{link}"
    )


def whatsapp_url(phone: str, message: str) -> str:
    return f"https://wa.me/91{phone}?text={quote(message)}"
