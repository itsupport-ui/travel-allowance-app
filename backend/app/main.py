from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base

# Import models
from app import models
from app.models.user import User
from app.models.claim import Claim
from app.models.travel import TravelEntry
from app.models.settings import Settings
from app.models.doctor import Doctor
from app.models.treatment_schedule import TreatmentSchedule
from app.models.push_token import PushToken

# Create tables
Base.metadata.create_all(bind=engine)

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