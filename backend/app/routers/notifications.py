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
from app.services.domain_audit_service import record_domain_audit_event


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

    prior_user_id = push_token.user_id if push_token is not None else None
    prior_state = (
        "enabled"
        if push_token is not None and push_token.is_active
        else "disabled"
        if push_token is not None
        else None
    )
    is_idempotent = bool(
        push_token is not None
        and push_token.user_id == current_user.id
        and push_token.installation_id == payload.installation_id
        and push_token.expo_push_token == payload.push_token
        and push_token.platform == payload.platform
        and push_token.is_active
    )
    if push_token is None:
        push_token = PushToken()
        db.add(push_token)

    push_token.user_id = current_user.id
    push_token.installation_id = payload.installation_id
    push_token.expo_push_token = payload.push_token
    push_token.platform = payload.platform
    push_token.is_active = True

    db.flush()
    if not is_idempotent:
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="notification",
            entity_type="push_registration",
            entity_id=push_token.id,
            action=(
                "ownership_transferred"
                if prior_user_id is not None
                and prior_user_id != current_user.id
                else "enabled"
                if prior_state in {None, "disabled"}
                else "refreshed"
            ),
            from_state=prior_state,
            to_state="enabled",
            related_entity_type="staff_user",
            related_entity_id=current_user.id,
            details={
                "platform": payload.platform,
                "ownership_changed": (
                    prior_user_id is not None
                    and prior_user_id != current_user.id
                ),
            },
        )
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

    was_active = bool(push_token.is_active)
    push_token.is_active = False
    if was_active:
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="notification",
            entity_type="push_registration",
            entity_id=push_token.id,
            action="disabled",
            from_state="enabled",
            to_state="disabled",
            related_entity_type="staff_user",
            related_entity_id=current_user.id,
            details={"platform": push_token.platform},
        )
    db.commit()
    return PushTokenDeactivateResponse(deactivated=True)
