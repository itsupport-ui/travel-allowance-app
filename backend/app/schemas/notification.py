from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PushTokenRegisterRequest(BaseModel):
    push_token: str = Field(min_length=20, max_length=255)
    installation_id: str = Field(min_length=16, max_length=64)
    platform: Literal["android", "ios"]

    @field_validator("push_token")
    @classmethod
    def validate_expo_push_token(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value.startswith(
            ("ExpoPushToken[", "ExponentPushToken[")
        ) or not normalized_value.endswith("]"):
            raise ValueError("A valid Expo push token is required")

        return normalized_value


class PushTokenResponse(BaseModel):
    id: int
    user_id: int
    installation_id: str
    platform: str
    is_active: bool
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PushTokenDeactivateRequest(BaseModel):
    installation_id: str = Field(min_length=16, max_length=64)


class PushTokenDeactivateResponse(BaseModel):
    deactivated: bool
