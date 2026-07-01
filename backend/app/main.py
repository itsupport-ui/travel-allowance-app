from fastapi import FastAPI

from app.database import engine, Base
from app.models.user import User
from app.models.push_token import PushToken
from app.models.claim import Claim
from app.models.travel import TravelEntry
from app.models.settings import Settings
from app.routers.settings import router as settings_router
from app.routers.auth import router as auth_router
from app.routers.travel import router as travel_router
from app.routers.claims import router as claims_router
from app.routers.maps import router as maps_router
from fastapi.middleware.cors import CORSMiddleware
from app.routers import dashboard
from app.routers import admin_dashboard
from app.models.doctor import Doctor
from app.routers.doctors import router as doctors_router
from app.models.treatment_schedule import TreatmentSchedule
from app.routers.treatment_schedule import router as treatment_schedule_router
from app.routers.user import router as user_router
from app.routers.therapist_workday import router as therapist_workday_router
from app.routers.notifications import router as notifications_router

Base.metadata.create_all(bind=engine)

def ensure_sqlite_schema_updates():
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        travel_columns = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(travel_entries)"
            )
        }

        if "arrival_latitude" not in travel_columns:
            connection.exec_driver_sql(
                "ALTER TABLE travel_entries ADD COLUMN arrival_latitude FLOAT"
            )

        if "arrival_longitude" not in travel_columns:
            connection.exec_driver_sql(
                "ALTER TABLE travel_entries ADD COLUMN arrival_longitude FLOAT"
            )


ensure_sqlite_schema_updates()

app = FastAPI()

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

app.include_router(settings_router)
app.include_router(auth_router)
app.include_router(travel_router)
app.include_router(claims_router)
app.include_router(maps_router)
app.include_router(dashboard.router)
app.include_router(admin_dashboard.router)
app.include_router(doctors_router)
app.include_router(treatment_schedule_router)
app.include_router(user_router)
app.include_router(therapist_workday_router)
app.include_router(notifications_router)

@app.get("/")
def home():
    return {"message": "Welcome to the Travel Allowance App!"}
