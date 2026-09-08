import re
from contextvars import ContextVar, Token


_SAFE_OPERATION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
_client_operation_id: ContextVar[str | None] = ContextVar(
    "client_operation_id",
    default=None,
)


def normalize_client_operation_id(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized if _SAFE_OPERATION_ID.fullmatch(normalized) else None


def set_client_operation_id(value: str | None) -> Token[str | None]:
    return _client_operation_id.set(normalize_client_operation_id(value))


def reset_client_operation_id(token: Token[str | None]) -> None:
    _client_operation_id.reset(token)


def get_client_operation_id() -> str | None:
    return _client_operation_id.get()
