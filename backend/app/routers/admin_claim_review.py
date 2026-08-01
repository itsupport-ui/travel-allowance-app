from datetime import date
from math import ceil
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, exists, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import Claim
from app.models.travel import TravelEntry
from app.models.user import User
from app.schemas.admin_claim_review import AdminClaimReviewResponse
from app.utils.auth import require_permission

router = APIRouter(
    prefix="/admin-claims",
    tags=["Admin Claims"],
)

HIGH_VALUE_CLAIM_AMOUNT = 2_000.0
URGENT_AGE_DAYS = 2

ClaimReviewStatus = Literal[
    "all",
    "pending",
    "approved",
    "rejected",
]
ClaimReviewSort = Literal[
    "newest",
    "oldest",
    "highest_amount",
    "lowest_amount",
    "longest_distance",
    "therapist_name",
]


def _metric(value: float | None) -> float:
    return round(float(value or 0), 2)


@router.get("/review", response_model=AdminClaimReviewResponse)
def get_admin_claim_review(
    status: ClaimReviewStatus = Query(default="pending"),
    therapist_id: int | None = Query(default=None, ge=1),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    minimum_amount: float | None = Query(default=None, ge=0),
    maximum_amount: float | None = Query(default=None, ge=0),
    minimum_distance: float | None = Query(default=None, ge=0),
    maximum_distance: float | None = Query(default=None, ge=0),
    search: str | None = Query(default=None, max_length=100),
    sort: ClaimReviewSort = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("claims.view")
    ),
):
    del current_user

    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=422,
            detail="To date cannot be before from date.",
        )
    if (
        minimum_amount is not None
        and maximum_amount is not None
        and minimum_amount > maximum_amount
    ):
        raise HTTPException(
            status_code=422,
            detail="Maximum amount cannot be below minimum amount.",
        )
    if (
        minimum_distance is not None
        and maximum_distance is not None
        and minimum_distance > maximum_distance
    ):
        raise HTTPException(
            status_code=422,
            detail="Maximum distance cannot be below minimum distance.",
        )

    ranked_travel = (
        db.query(
            TravelEntry.id.label("travel_id"),
            TravelEntry.claim_id.label("claim_id"),
            TravelEntry.patient_name.label("patient_name"),
            TravelEntry.travel_date.label("travel_date"),
            TravelEntry.from_address.label("from_address"),
            TravelEntry.to_address.label("to_address"),
            TravelEntry.patient_visited.label("patient_visited"),
            func.row_number()
            .over(
                partition_by=TravelEntry.claim_id,
                order_by=(
                    TravelEntry.travel_date.asc(),
                    TravelEntry.id.asc(),
                ),
            )
            .label("row_number"),
        )
        .filter(TravelEntry.claim_id.is_not(None))
        .subquery()
    )
    travel_summary = (
        db.query(
            ranked_travel.c.claim_id.label("claim_id"),
            func.count(ranked_travel.c.travel_id).label("patient_count"),
            func.coalesce(
                func.sum(
                    case(
                        (ranked_travel.c.patient_visited.is_(True), 1),
                        else_=0,
                    )
                ),
                0,
            ).label("visited_count"),
            func.max(
                case(
                    (
                        ranked_travel.c.row_number == 1,
                        ranked_travel.c.patient_name,
                    )
                )
            ).label("patient_name"),
            func.max(
                case(
                    (
                        ranked_travel.c.row_number == 1,
                        ranked_travel.c.travel_date,
                    )
                )
            ).label("travel_date"),
            func.max(
                case(
                    (
                        ranked_travel.c.row_number == 1,
                        ranked_travel.c.from_address,
                    )
                )
            ).label("from_address"),
            func.max(
                case(
                    (
                        ranked_travel.c.row_number == 1,
                        ranked_travel.c.to_address,
                    )
                )
            ).label("to_address"),
        )
        .group_by(ranked_travel.c.claim_id)
        .subquery()
    )

    scope_conditions = []
    if therapist_id is not None:
        scope_conditions.append(Claim.therapist_id == therapist_id)
    if from_date is not None:
        scope_conditions.append(Claim.claim_date >= from_date)
    if to_date is not None:
        scope_conditions.append(Claim.claim_date <= to_date)
    if minimum_amount is not None:
        scope_conditions.append(Claim.grand_total >= minimum_amount)
    if maximum_amount is not None:
        scope_conditions.append(Claim.grand_total <= maximum_amount)
    if minimum_distance is not None:
        scope_conditions.append(Claim.total_km >= minimum_distance)
    if maximum_distance is not None:
        scope_conditions.append(Claim.total_km <= maximum_distance)

    normalized_search = (search or "").strip().lower()
    if normalized_search:
        search_pattern = f"%{normalized_search}%"
        search_conditions = [
            func.lower(User.username).like(search_pattern),
            exists().where(
                TravelEntry.claim_id == Claim.id,
                func.lower(
                    func.coalesce(TravelEntry.patient_name, "")
                ).like(search_pattern),
            ),
        ]
        if normalized_search.isdigit():
            search_conditions.append(Claim.id == int(normalized_search))
        scope_conditions.append(or_(*search_conditions))

    conditions = list(scope_conditions)
    if status != "all":
        conditions.append(func.lower(Claim.status) == status)

    base_query = (
        db.query(
            Claim,
            User.username,
            User.role,
            travel_summary.c.patient_count,
            travel_summary.c.visited_count,
            travel_summary.c.patient_name,
            travel_summary.c.travel_date,
            travel_summary.c.from_address,
            travel_summary.c.to_address,
        )
        .join(User, User.id == Claim.therapist_id)
        .outerjoin(
            travel_summary,
            travel_summary.c.claim_id == Claim.id,
        )
        .filter(*conditions)
    )

    sort_expressions = {
        "newest": (
            Claim.claim_date.desc(),
            Claim.submitted_at.desc(),
            Claim.id.desc(),
        ),
        "oldest": (
            Claim.claim_date.asc(),
            Claim.submitted_at.asc(),
            Claim.id.asc(),
        ),
        "highest_amount": (
            Claim.grand_total.desc(),
            Claim.id.desc(),
        ),
        "lowest_amount": (
            Claim.grand_total.asc(),
            Claim.id.desc(),
        ),
        "longest_distance": (
            Claim.total_km.desc(),
            Claim.id.desc(),
        ),
        "therapist_name": (
            func.lower(User.username).asc(),
            Claim.id.desc(),
        ),
    }
    total = base_query.count()
    rows = (
        base_query.order_by(*sort_expressions[sort])
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    summary_row = (
        db.query(
            func.coalesce(
                func.sum(
                    case(
                        (func.lower(Claim.status) == "pending", 1),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Claim.claim_date == date.today(), 1),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            func.lower(Claim.status) == "pending",
                            Claim.grand_total,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            Claim.grand_total
                            >= HIGH_VALUE_CLAIM_AMOUNT,
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(func.avg(Claim.grand_total), 0),
            func.coalesce(func.avg(Claim.total_km), 0),
        )
        .join(User, User.id == Claim.therapist_id)
        .filter(*scope_conditions)
        .one()
    )

    today = date.today()
    items = []
    for row in rows:
        claim = row[0]
        age_days = max((today - claim.claim_date).days, 0)
        is_high_value = (
            float(claim.grand_total or 0)
            >= HIGH_VALUE_CLAIM_AMOUNT
        )
        items.append(
            {
                "id": claim.id,
                "therapist_id": claim.therapist_id,
                "therapist_name": row[1],
                "therapist_role": row[2],
                "claim_date": claim.claim_date,
                "submitted_at": claim.submitted_at,
                "status": claim.status,
                "patient_name": row[5],
                "patient_count": int(row[3] or 0),
                "visited_count": int(row[4] or 0),
                "travel_date": row[6],
                "from_address": row[7],
                "to_address": row[8],
                "total_km": _metric(claim.total_km),
                "per_km_rate": _metric(claim.per_km_rate),
                "travel_total": _metric(claim.travel_total),
                "daily_allowance": _metric(claim.daily_allowance),
                "grand_total": _metric(claim.grand_total),
                "notes": claim.remarks,
                "is_high_value": is_high_value,
                "is_urgent": (
                    claim.status.lower() == "pending"
                    and (
                        is_high_value
                        or age_days >= URGENT_AGE_DAYS
                    )
                ),
                "age_days": age_days,
            }
        )

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": ceil(total / page_size) if total else 0,
        "high_value_threshold": HIGH_VALUE_CLAIM_AMOUNT,
        "summary": {
            "pending_claims": int(summary_row[0]),
            "todays_claims": int(summary_row[1]),
            "pending_amount": _metric(summary_row[2]),
            "high_value_claims": int(summary_row[3]),
            "average_claim_amount": _metric(summary_row[4]),
            "average_distance": _metric(summary_row[5]),
        },
    }
