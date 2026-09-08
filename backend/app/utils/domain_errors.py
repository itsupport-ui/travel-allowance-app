from collections.abc import Sequence

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class DomainHTTPException(HTTPException):
    """A backward-compatible HTTP error with machine-readable guidance."""

    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        recoverable: bool,
        suggested_action: str | None = None,
        blocking_fields: Sequence[str] = (),
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail=message,
            headers={"X-Error-Code": code},
        )
        self.code = code
        self.recoverable = recoverable
        self.suggested_action = suggested_action
        self.blocking_fields = list(blocking_fields)


async def domain_exception_handler(
    _request: Request,
    exception: DomainHTTPException,
) -> JSONResponse:
    return JSONResponse(
        status_code=exception.status_code,
        headers=exception.headers,
        content={
            "detail": exception.detail,
            "code": exception.code,
            "recoverable": exception.recoverable,
            "suggested_action": exception.suggested_action,
            "blocking_fields": exception.blocking_fields,
        },
    )
