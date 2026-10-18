from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PlaceType = Literal["clinic", "other"]


class PlaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    place_type: PlaceType = "clinic"
    address: str = Field(min_length=3, max_length=500)
    # When omitted, the address is geocoded server-side.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_m: float | None = Field(default=None, ge=25, le=5000)


class PlaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    place_type: PlaceType | None = None
    address: str | None = Field(default=None, min_length=3, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_m: float | None = Field(default=None, ge=25, le=5000)
    active: bool | None = None


class PlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    place_type: str
    address: str
    latitude: float
    longitude: float
    radius_m: float | None = None
    active: bool
    created_at: datetime
