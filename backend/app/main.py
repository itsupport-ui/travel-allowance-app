from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401
from app.config import AUTO_CREATE_SCHEMA, CORS_ORIGINS
from app.database import Base, engine
from app.routers import (
    admin_dashboard,
    auth,
    claims,
    dashboard,
    doctor_claim,
    doctor_consultation,
    doctor_expense,
    doctors,
    maps,
    notifications,
    settings,
    therapist_workday,
    travel,
    treatment_plan,
    treatment_schedule,
    user,
    doctor_visit,
)

if AUTO_CREATE_SCHEMA:
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Travel Allowance API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings.router)
app.include_router(auth.router)
app.include_router(travel.router)
app.include_router(claims.router)
app.include_router(maps.router)
app.include_router(dashboard.router)
app.include_router(admin_dashboard.router)
app.include_router(doctor_claim.router)
app.include_router(doctor_consultation.router)
app.include_router(doctor_expense.router)
app.include_router(doctors.router)
app.include_router(treatment_plan.router)
app.include_router(treatment_schedule.router)
app.include_router(user.router)
app.include_router(therapist_workday.router)
app.include_router(notifications.router)
app.include_router(doctor_visit.router)

@app.get("/", tags=["Health"])
def home():
    return {"message": "Welcome to the Travel Allowance App!"}
