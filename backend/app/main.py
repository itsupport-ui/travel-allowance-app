from fastapi import FastAPI

from app.database import engine, Base
from app.models.user import User
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
from app.routers import maps
from fastapi.staticfiles import StaticFiles

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

app.include_router(settings_router)
app.include_router(auth_router)
app.include_router(travel_router)
app.include_router(claims_router)
app.include_router(maps_router)
app.include_router(dashboard.router)
app.include_router(admin_dashboard.router)
app.include_router(maps.router)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/")
def home():
    return {"message": "Welcome to the Travel Allowance App!"}
