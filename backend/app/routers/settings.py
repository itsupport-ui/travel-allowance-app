from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from sqlalchemy.orm import (
    Session
)

from app.database import (
    get_db
)

from app.models.settings import (
    Settings
)

from app.schemas.settings import (
    SettingsBase,
    SettingsResponse
)

from app.models.user import (
    User
)

from app.utils.auth import (
    get_current_user,
    require_role,
)

router = APIRouter(
    prefix="/settings",
    tags=["Settings"]
)


@router.get(
    "/",
    response_model=
    SettingsResponse
)
def get_settings(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        get_current_user
    )
):

    settings = (
        db.query(Settings)
        .first()
    )

    if not settings:

        settings = Settings(
            per_km_rate=8,
            daily_allowance=150
        )

        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


@router.put(
    "/",
    response_model=
    SettingsResponse
)
def update_settings(

    request:
    SettingsBase,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(["admin"])
    )
):

    settings = (
        db.query(Settings)
        .first()
    )

    if not settings:

        settings = Settings(
            per_km_rate=
            request.per_km_rate,

            daily_allowance=
            request.daily_allowance
        )

        db.add(settings)

    else:

        settings.per_km_rate = (
            request.per_km_rate
        )

        settings.daily_allowance = (
            request.daily_allowance
        )

    db.commit()
    db.refresh(settings)

    return settings
