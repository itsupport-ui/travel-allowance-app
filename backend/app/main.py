from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.travel import TravelEntry
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers import (
    admin_dashboard,
    auth,
    claims,
    dashboard,
    doctors,
    maps,
    notifications,
    settings,
    therapist_workday,
    travel,
    treatment_schedule,
    user,
)


Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Travel Allowance API",
    version="1.0.0",
)

origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
app.include_router(doctors.router)
app.include_router(treatment_schedule.router)
app.include_router(user.router)
app.include_router(therapist_workday.router)
app.include_router(notifications.router)


@app.get("/", tags=["Health"])
def home():
    return {"message": "Welcome to the Travel Allowance App!"}
