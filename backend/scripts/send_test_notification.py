import argparse
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.push_notification_service import (  # noqa: E402
    send_user_notification,
)


SUPPORTED_TYPES = {
    "schedule_assigned",
    "schedule_updated",
    "claim_approved",
    "claim_rejected",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a test Expo push notification by user email."
    )
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--type",
        required=True,
        choices=sorted(SUPPORTED_TYPES),
    )
    parser.add_argument("--schedule-id", type=int)
    parser.add_argument("--claim-id", type=int)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()

    if arguments.type.startswith("schedule_") and not arguments.schedule_id:
        raise SystemExit("--schedule-id is required for schedule notifications.")
    if arguments.type.startswith("claim_") and not arguments.claim_id:
        raise SystemExit("--claim-id is required for claim notifications.")

    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.email == arguments.email.strip().lower())
            .first()
        )
        if user is None:
            raise SystemExit("No user was found for that email address.")
        user_id = user.id
    finally:
        db.close()

    entity_status = arguments.type.split("_", maxsplit=1)[1]
    entity_name = (
        "Schedule"
        if arguments.type.startswith("schedule_")
        else "Claim"
    )
    payload = {"type": arguments.type}
    if arguments.schedule_id:
        payload["schedule_id"] = arguments.schedule_id
    if arguments.claim_id:
        payload["claim_id"] = arguments.claim_id

    sent_count = send_user_notification(
        user_id,
        title=f"Test {entity_name} Notification",
        body=f"Test notification: {entity_name.lower()} {entity_status}.",
        data=payload,
    )
    print(f"Accepted notification deliveries: {sent_count}")
    return 0 if sent_count > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
