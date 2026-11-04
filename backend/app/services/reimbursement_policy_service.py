from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.settings import Settings


MONEY_QUANTUM = Decimal("0.01")
DISTANCE_QUANTUM = Decimal("0.01")
CALCULATION_VERSION = "decimal-v1"
ROUNDING_MODE = "ROUND_HALF_UP"


def decimal_value(value) -> Decimal:
    return Decimal(str(value or 0))


def money(value) -> Decimal:
    return decimal_value(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def distance(value) -> Decimal:
    return decimal_value(value).quantize(
        DISTANCE_QUANTUM,
        rounding=ROUND_HALF_UP,
    )


def doctor_receipt_is_required(
    *,
    amount,
    threshold,
    expense_category: str,
    is_manual: bool,
) -> bool:
    """Return the snapshot evidence rule for a doctor expense."""
    if is_manual or expense_category in {"toll_parking", "authorized_other"}:
        return True
    if expense_category == "mileage":
        return False
    return money(amount) >= money(threshold)


def ensure_default_policy(db: Session) -> None:
    """Create version 1 when the policy table is completely empty.

    Databases built by AUTO_CREATE_SCHEMA never ran the migration that seeds
    the first policy, so every punch-out / claim failed until an admin happened
    to open Settings. Seeding here makes the lookup self-healing.
    """
    if db.query(ReimbursementPolicy.id).first() is not None:
        return
    legacy = db.query(Settings).first()
    try:
        # Savepoint, so a race with another request never rolls back the
        # caller's own pending work; the caller's commit persists the seed.
        with db.begin_nested():
            db.add(
                ReimbursementPolicy(
                    version=1,
                    effective_from=date(1970, 1, 1),
                    per_km_rate=money(legacy.per_km_rate if legacy else 8),
                    daily_allowance=money(
                        legacy.daily_allowance if legacy else 150
                    ),
                    doctor_receipt_threshold=money(500),
                )
            )
    except IntegrityError:
        pass  # another request seeded it first


def get_reimbursement_policy(
    db: Session,
    business_date: date,
) -> ReimbursementPolicy:
    ensure_default_policy(db)
    policy = (
        db.query(ReimbursementPolicy)
        .filter(
            ReimbursementPolicy.effective_from <= business_date,
            (
                ReimbursementPolicy.effective_to.is_(None)
                | (ReimbursementPolicy.effective_to > business_date)
            ),
        )
        .order_by(
            ReimbursementPolicy.effective_from.desc(),
            ReimbursementPolicy.version.desc(),
        )
        .first()
    )
    if policy is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "No reimbursement policy is effective for this business date."
            ),
        )
    return policy
