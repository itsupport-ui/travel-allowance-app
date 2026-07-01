import logging
import os
import time
from collections.abc import Iterable
from typing import Any

import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.push_token import PushToken


load_dotenv()

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH_SIZE = 100
MAX_ATTEMPTS = 3
REQUEST_TIMEOUT_SECONDS = 10
RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


class PushNotificationError(RuntimeError):
    pass


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
    }
    access_token = os.getenv("EXPO_ACCESS_TOKEN", "").strip()
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _post_batch(
    messages: list[dict[str, Any]],
    session: requests.Session,
) -> list[dict[str, Any]]:
    last_error: Exception | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = session.post(
                EXPO_PUSH_URL,
                headers=_headers(),
                json=messages,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )

            if (
                response.status_code in RETRYABLE_STATUS_CODES
                and attempt < MAX_ATTEMPTS
            ):
                time.sleep(0.5 * (2 ** (attempt - 1)))
                continue

            response.raise_for_status()
            payload = response.json()
            tickets = payload.get("data")
            if not isinstance(tickets, list):
                raise PushNotificationError(
                    "Expo returned a malformed push response."
                )
            if len(tickets) != len(messages):
                raise PushNotificationError(
                    "Expo returned an incomplete push response."
                )
            return tickets
        except (
            requests.Timeout,
            requests.ConnectionError,
        ) as error:
            last_error = error
            if attempt < MAX_ATTEMPTS:
                time.sleep(0.5 * (2 ** (attempt - 1)))
                continue
        except (requests.RequestException, ValueError) as error:
            raise PushNotificationError(
                "Expo rejected the push notification request."
            ) from error

    raise PushNotificationError(
        "Expo Push Service is temporarily unavailable."
    ) from last_error


def send_user_notification(
    user_id: int,
    *,
    title: str,
    body: str,
    data: dict[str, Any],
    session_factory=SessionLocal,
    http_session: requests.Session | None = None,
) -> int:
    db: Session = session_factory()
    owns_http_session = http_session is None
    client = http_session or requests.Session()

    try:
        token_records = (
            db.query(PushToken)
            .filter(
                PushToken.user_id == user_id,
                PushToken.is_active.is_(True),
            )
            .all()
        )
        if not token_records:
            return 0

        records_by_token = {
            record.expo_push_token: record
            for record in token_records
        }
        sent_count = 0

        for token_batch in _chunks(list(records_by_token), MAX_BATCH_SIZE):
            messages = [
                {
                    "to": token,
                    "sound": "default",
                    "title": title,
                    "body": body,
                    "data": data,
                    "priority": "high",
                    "channelId": "general",
                }
                for token in token_batch
            ]
            tickets = _post_batch(messages, client)

            for token, ticket in zip(token_batch, tickets):
                if not isinstance(ticket, dict):
                    logger.warning(
                        "Malformed Expo ticket for user_id=%s.",
                        user_id,
                    )
                    continue

                if ticket.get("status") == "ok":
                    sent_count += 1
                    continue

                details = ticket.get("details")
                error_code = (
                    details.get("error")
                    if isinstance(details, dict)
                    else None
                )
                if error_code == "DeviceNotRegistered":
                    records_by_token[token].is_active = False
                logger.warning(
                    "Expo rejected a notification for user_id=%s code=%s.",
                    user_id,
                    error_code or "unknown",
                )

        if db.dirty:
            db.commit()
        return sent_count
    except PushNotificationError as error:
        db.rollback()
        logger.warning(
            "Unable to send push notification to user_id=%s: %s",
            user_id,
            error,
        )
        return 0
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected push notification failure for user_id=%s.",
            user_id,
        )
        return 0
    finally:
        if owns_http_session:
            client.close()
        db.close()


def notify_schedule_assigned(user_id: int, schedule_id: int) -> int:
    return send_user_notification(
        user_id,
        title="New Schedule Assigned",
        body="A new treatment schedule has been assigned to you.",
        data={
            "type": "schedule_assigned",
            "schedule_id": schedule_id,
        },
    )


def notify_schedule_updated(user_id: int, schedule_id: int) -> int:
    return send_user_notification(
        user_id,
        title="Schedule Updated",
        body="One of your treatment schedules has been updated.",
        data={
            "type": "schedule_updated",
            "schedule_id": schedule_id,
        },
    )


def notify_claim_status(
    user_id: int,
    claim_id: int,
    status: str,
) -> int:
    normalized_status = status.lower()
    return send_user_notification(
        user_id,
        title=f"Claim {normalized_status.title()}",
        body=f"Your travel claim has been {normalized_status}.",
        data={
            "type": f"claim_{normalized_status}",
            "claim_id": claim_id,
        },
    )
