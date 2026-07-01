from datetime import datetime
from zoneinfo import ZoneInfo


INDIA_TIMEZONE = ZoneInfo("Asia/Kolkata")


def india_now() -> datetime:
    return datetime.now(INDIA_TIMEZONE)
