from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401
from app.config import AUTO_CREATE_SCHEMA, CORS_ORIGINS
from app.database import Base, engine
from app.services.admin_seed import ensure_admin_user
from app.utils.domain_errors import (
    DomainHTTPException,
    domain_exception_handler,
)
from app.utils.request_context import (
    reset_client_operation_id,
    set_client_operation_id,
)
from app.routers import (
    admin_dashboard,
    admin_claim_review,
    admin_reports,
    admin_schedules,
    auth,
    claims,
    dashboard,
    doctor_claim,
    doctor_consultation,
    domain_audit,
    doctor_expense,
    doctor_visit_sessions,
    doctor_workday,
    doctors,
    maps,
    location_exceptions,
    workday_exceptions,
    notifications,
    operational_follow_ups,
    reports,
    settings,
    staff_overrides,
    therapist_workday,
    treatment_sessions,
    travel,
    treatment_plan,
    treatment_schedule,
    user,
    doctor_visit,
)

if AUTO_CREATE_SCHEMA:
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not ensure_admin_user():
        raise RuntimeError("Admin seed failed; review the sanitized server log")
    yield


app = FastAPI(
    title="Travel Allowance API",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def attach_client_operation_context(request: Request, call_next):
    token = set_client_operation_id(
        request.headers.get("X-Idempotency-Key")
    )
    try:
        return await call_next(request)
    finally:
        reset_client_operation_id(token)


app.add_exception_handler(
    DomainHTTPException,
    domain_exception_handler,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-Error-Code",
        "X-Idempotent-Replay",
        "X-Report-Job-Id",
        "X-Report-Row-Count",
        "X-Report-Snapshot-Id",
    ],
)

app.include_router(settings.router)
app.include_router(staff_overrides.router)
app.include_router(auth.router)
app.include_router(travel.router)
app.include_router(claims.router)
app.include_router(maps.router)
app.include_router(location_exceptions.router)
app.include_router(workday_exceptions.router)
app.include_router(dashboard.router)
app.include_router(admin_dashboard.router)
app.include_router(admin_claim_review.router)
app.include_router(admin_reports.router)
app.include_router(admin_schedules.router)
app.include_router(doctor_claim.router)
app.include_router(doctor_consultation.router)
app.include_router(domain_audit.router)
app.include_router(doctor_expense.router)
app.include_router(doctor_workday.router)
app.include_router(doctor_visit_sessions.router)
app.include_router(doctors.router)
app.include_router(treatment_plan.router)
app.include_router(treatment_schedule.router)
app.include_router(user.router)
app.include_router(therapist_workday.router)
app.include_router(treatment_sessions.router)
app.include_router(notifications.router)
app.include_router(operational_follow_ups.router)
app.include_router(reports.router)
app.include_router(doctor_visit.router)

@app.get("/", tags=["Health"])
def home():
    return {"message": "Welcome to the Travel Allowance App!"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
