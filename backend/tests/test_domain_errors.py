from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.utils.domain_errors import (
    DomainHTTPException,
    domain_exception_handler,
)


def test_domain_error_preserves_message_and_adds_action_metadata():
    app = FastAPI()
    app.add_exception_handler(
        DomainHTTPException,
        domain_exception_handler,
    )

    @app.get("/blocked")
    def blocked():
        raise DomainHTTPException(
            status_code=409,
            code="ACTIVE_SESSION",
            message="Finish the active session first.",
            recoverable=True,
            suggested_action="punch_out_active_session",
            blocking_fields=["active_session_id"],
        )

    response = TestClient(app).get("/blocked")

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "ACTIVE_SESSION"
    assert response.json() == {
        "detail": "Finish the active session first.",
        "code": "ACTIVE_SESSION",
        "recoverable": True,
        "suggested_action": "punch_out_active_session",
        "blocking_fields": ["active_session_id"],
    }
