from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.push_token import PushToken
from app.models.user import User
from app.schemas.notification import (
    PushTokenDeactivateRequest,
    PushTokenDeactivateResponse,
    PushTokenRegisterRequest,
    PushTokenResponse,
)
from app.utils.auth import get_current_user


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.post("/push-token", response_model=PushTokenResponse)
def register_push_token(
    payload: PushTokenRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    installation_record = (
        db.query(PushToken)
        .filter(PushToken.installation_id == payload.installation_id)
        .first()
    )
    token_record = (
        db.query(PushToken)
        .filter(PushToken.expo_push_token == payload.push_token)
        .first()
    )

    if (
        installation_record is not None
        and token_record is not None
        and installation_record.id != token_record.id
    ):
        db.delete(installation_record)
        db.flush()
        push_token = token_record
    else:
        push_token = installation_record or token_record

    if push_token is None:
        push_token = PushToken()
        db.add(push_token)

    push_token.user_id = current_user.id
    push_token.installation_id = payload.installation_id
    push_token.expo_push_token = payload.push_token
    push_token.platform = payload.platform
    push_token.is_active = True

    db.commit()
    db.refresh(push_token)
    return push_token


@router.delete(
    "/push-token",
    response_model=PushTokenDeactivateResponse,
)
def deactivate_push_token(
    payload: PushTokenDeactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    push_token = (
        db.query(PushToken)
        .filter(
            PushToken.user_id == current_user.id,
            PushToken.installation_id == payload.installation_id,
        )
        .first()
    )

    if push_token is None:
        return PushTokenDeactivateResponse(deactivated=False)

    push_token.is_active = False
    db.commit()
    return PushTokenDeactivateResponse(deactivated=True)
