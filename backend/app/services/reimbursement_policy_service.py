from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.reimbursement_policy import ReimbursementPolicy


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


def get_reimbursement_policy(
    db: Session,
    business_date: date,
) -> ReimbursementPolicy:
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
