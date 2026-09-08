from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.claim import Claim
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_expense import DoctorExpense
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.travel import TravelEntry
from app.schemas.claim_readiness import (
    ClaimReadinessBlocker,
    DoctorClaimReadinessResponse,
    TherapistClaimReadinessResponse,
)
from app.services.reimbursement_policy_service import (
    CALCULATION_VERSION,
    ROUNDING_MODE,
    distance,
    get_reimbursement_policy,
    money,
)
from app.utils.domain_errors import DomainHTTPException


@dataclass(frozen=True)
class ReadinessBlocker:
    status_code: int
    code: str
    message: str
    recoverable: bool
    suggested_action: str | None = None
    affected_count: int = 0
    blocking_fields: tuple[str, ...] = ()

    def response(self) -> ClaimReadinessBlocker:
        return ClaimReadinessBlocker(
            code=self.code,
            message=self.message,
            recoverable=self.recoverable,
            suggested_action=self.suggested_action,
            affected_count=self.affected_count,
            blocking_fields=list(self.blocking_fields),
        )


@dataclass
class TherapistClaimReadiness:
    business_date: date
    existing_claim: Claim | None
    eligible_records: list[TravelEntry] = field(default_factory=list)
    pending_review_count: int = 0
    policy: ReimbursementPolicy | None = None
    total_km: Decimal = Decimal("0.00")
    travel_total: Decimal = Decimal("0.00")
    daily_allowance: Decimal = Decimal("0.00")
    grand_total: Decimal = Decimal("0.00")
    patient_visited_today: bool = False
    blockers: list[ReadinessBlocker] = field(default_factory=list)
    state: str = "blocked"
    submission_mode: str | None = None
    available_actions: list[str] = field(default_factory=list)
    next_action: str | None = None
    total_source: str = "none"

    @property
    def can_submit(self) -> bool:
        return self.state == "ready" and not self.blockers

    def response(self) -> TherapistClaimReadinessResponse:
        existing = self.existing_claim
        per_km_rate = (
            money(self.policy.per_km_rate)
            if self.policy is not None
            else (
                money(existing.per_km_rate)
                if existing is not None
                else None
            )
        )
        return TherapistClaimReadinessResponse(
            business_date=self.business_date,
            state=self.state,
            can_submit=self.can_submit,
            submission_mode=self.submission_mode,
            eligible_record_count=len(self.eligible_records),
            eligible_record_ids=[item.id for item in self.eligible_records],
            pending_review_count=self.pending_review_count,
            existing_claim_id=existing.id if existing is not None else None,
            existing_claim_status=(
                existing.status if existing is not None else None
            ),
            existing_claim_revision=(
                int(existing.revision or 1) if existing is not None else None
            ),
            rejection_reason=(
                existing.rejection_reason if existing is not None else None
            ),
            total_amount=float(self.grand_total),
            total_source=self.total_source,
            calculation_version=CALCULATION_VERSION,
            rounding_mode=ROUNDING_MODE,
            available_actions=self.available_actions,
            blocking_reasons=[item.response() for item in self.blockers],
            next_action=self.next_action,
            total_km=float(self.total_km),
            per_km_rate=(
                float(per_km_rate) if per_km_rate is not None else None
            ),
            travel_total=float(self.travel_total),
            daily_allowance=float(self.daily_allowance),
            patient_visited_today=self.patient_visited_today,
            policy_id=self.policy.id if self.policy is not None else None,
            policy_version=(
                self.policy.version if self.policy is not None else None
            ),
            policy_effective_from=(
                self.policy.effective_from
                if self.policy is not None
                else None
            ),
        )


@dataclass
class DoctorClaimReadiness:
    business_date: date
    existing_claim: DoctorClaim | None
    eligible_records: list[DoctorExpense] = field(default_factory=list)
    pending_review_count: int = 0
    expense_total: Decimal = Decimal("0.00")
    blockers: list[ReadinessBlocker] = field(default_factory=list)
    state: str = "blocked"
    submission_mode: str | None = None
    available_actions: list[str] = field(default_factory=list)
    next_action: str | None = None
    total_source: str = "none"

    @property
    def can_submit(self) -> bool:
        return self.state == "ready" and not self.blockers

    def response(self) -> DoctorClaimReadinessResponse:
        existing = self.existing_claim
        return DoctorClaimReadinessResponse(
            business_date=self.business_date,
            state=self.state,
            can_submit=self.can_submit,
            submission_mode=self.submission_mode,
            eligible_record_count=len(self.eligible_records),
            eligible_record_ids=[item.id for item in self.eligible_records],
            pending_review_count=self.pending_review_count,
            existing_claim_id=existing.id if existing is not None else None,
            existing_claim_status=(
                existing.status if existing is not None else None
            ),
            existing_claim_revision=(
                int(existing.revision or 1) if existing is not None else None
            ),
            rejection_reason=(
                existing.rejection_reason if existing is not None else None
            ),
            total_amount=float(self.expense_total),
            total_source=self.total_source,
            calculation_version=CALCULATION_VERSION,
            rounding_mode=ROUNDING_MODE,
            available_actions=self.available_actions,
            blocking_reasons=[item.response() for item in self.blockers],
            next_action=self.next_action,
            expense_total=float(self.expense_total),
        )


def _apply_lock(query, lock: bool):
    return query.with_for_update() if lock else query


def _already_submitted_blocker(
    *,
    record_name: str,
    record_count: int,
) -> ReadinessBlocker:
    return ReadinessBlocker(
        status_code=409,
        code="CLAIM_ALREADY_SUBMITTED_WITH_NEW_DRAFTS",
        message=(
            "Today's claim already exists, but new draft "
            f"{record_name} is not included. Ask an administrator to "
            "review it."
        ),
        recoverable=True,
        suggested_action="contact_claim_reviewer",
        affected_count=record_count,
        blocking_fields=("claim_id", f"{record_name}_ids"),
    )


def build_therapist_claim_readiness(
    db: Session,
    *,
    therapist_id: int,
    business_date: date,
    lock: bool = False,
) -> TherapistClaimReadiness:
    existing_claim = _apply_lock(
        db.query(Claim).filter(
            Claim.therapist_id == therapist_id,
            Claim.claim_date == business_date,
        ),
        lock,
    ).first()
    draft_records = _apply_lock(
        db.query(TravelEntry).filter(
            TravelEntry.therapist_id == therapist_id,
            func.date(TravelEntry.travel_date) == business_date,
            TravelEntry.claim_id.is_(None),
            TravelEntry.status == "draft",
        ),
        lock,
    ).all()
    pending_records = [
        record
        for record in draft_records
        if record.schedule_id is None
        and record.manual_review_status in {"pending", "changes_requested"}
    ]
    eligible_records = [
        record
        for record in draft_records
        if record.schedule_id is not None
        or record.manual_review_status in {None, "approved"}
    ]
    readiness = TherapistClaimReadiness(
        business_date=business_date,
        existing_claim=existing_claim,
        eligible_records=eligible_records,
        pending_review_count=len(pending_records),
    )

    if existing_claim is not None and existing_claim.status != "rejected":
        readiness.total_km = distance(existing_claim.total_km)
        readiness.travel_total = money(existing_claim.travel_total)
        readiness.daily_allowance = money(existing_claim.daily_allowance)
        readiness.grand_total = money(existing_claim.grand_total)
        readiness.patient_visited_today = bool(
            existing_claim.patient_visited_today
        )
        readiness.total_source = "existing_claim"
        if draft_records:
            readiness.blockers.append(
                _already_submitted_blocker(
                    record_name="travel",
                    record_count=len(draft_records),
                )
            )
            readiness.available_actions = [
                "view_claim",
                "contact_claim_reviewer",
            ]
            readiness.next_action = "contact_claim_reviewer"
        else:
            readiness.state = "already_submitted"
            readiness.available_actions = ["view_claim"]
            readiness.next_action = "view_claim"
        return readiness

    readiness.submission_mode = (
        "resubmit" if existing_claim is not None else "submit"
    )
    if pending_records:
        readiness.blockers.append(
            ReadinessBlocker(
                status_code=409,
                code="MANUAL_TRAVEL_REVIEW_REQUIRED",
                message=(
                    "Resolve all manual travel reviews before submitting "
                    "today's claim so no travel is stranded outside it."
                ),
                recoverable=True,
                suggested_action="open_manual_travel",
                affected_count=len(pending_records),
                blocking_fields=("manual_review_status",),
            )
        )
    if not eligible_records and not pending_records:
        readiness.blockers.append(
            ReadinessBlocker(
                status_code=400,
                code="NO_ELIGIBLE_TRAVEL",
                message="No eligible travel entries were found for today.",
                recoverable=True,
                suggested_action="complete_treatment_or_add_travel",
                blocking_fields=("travel_ids",),
            )
        )
    else:
        try:
            readiness.policy = get_reimbursement_policy(db, business_date)
        except HTTPException:
            readiness.blockers.append(
                ReadinessBlocker(
                    status_code=409,
                    code="REIMBURSEMENT_POLICY_UNAVAILABLE",
                    message=(
                        "No reimbursement policy is effective for this "
                        "business date. Ask an administrator to configure it."
                    ),
                    recoverable=True,
                    suggested_action="contact_administrator",
                    blocking_fields=("policy_id",),
                )
            )

    readiness.total_km = distance(
        sum(record.total_km for record in eligible_records)
    )
    readiness.patient_visited_today = any(
        bool(record.patient_visited) for record in eligible_records
    )
    readiness.travel_total = money(
        sum(record.travel_fare for record in eligible_records)
    )
    if readiness.policy is not None:
        readiness.daily_allowance = (
            money(readiness.policy.daily_allowance)
            if readiness.patient_visited_today
            else money(0)
        )
    readiness.grand_total = money(
        readiness.travel_total + readiness.daily_allowance
    )
    readiness.total_source = (
        "eligible_records" if eligible_records else "none"
    )
    if readiness.blockers:
        readiness.available_actions = list(
            dict.fromkeys(
                blocker.suggested_action
                for blocker in readiness.blockers
                if blocker.suggested_action
            )
        )
        readiness.next_action = readiness.available_actions[0]
    else:
        readiness.state = "ready"
        readiness.available_actions = [
            "resubmit_claim"
            if readiness.submission_mode == "resubmit"
            else "submit_claim"
        ]
        readiness.next_action = readiness.available_actions[0]
    return readiness


def build_doctor_claim_readiness(
    db: Session,
    *,
    doctor_id: int,
    business_date: date,
    lock: bool = False,
) -> DoctorClaimReadiness:
    existing_claim = _apply_lock(
        db.query(DoctorClaim).filter(
            DoctorClaim.doctor_id == doctor_id,
            DoctorClaim.claim_date == business_date,
        ),
        lock,
    ).first()
    draft_records = _apply_lock(
        db.query(DoctorExpense).filter(
            DoctorExpense.doctor_id == doctor_id,
            DoctorExpense.expense_date == business_date,
            DoctorExpense.status == "draft",
            DoctorExpense.claim_id.is_(None),
        ),
        lock,
    ).all()
    pending_records = [
        record
        for record in draft_records
        if record.visit_id is None
        and record.manual_review_status in {"pending", "changes_requested"}
    ]
    eligible_records = [
        record
        for record in draft_records
        if record.visit_id is not None
        or record.manual_review_status in {None, "approved"}
    ]
    readiness = DoctorClaimReadiness(
        business_date=business_date,
        existing_claim=existing_claim,
        eligible_records=eligible_records,
        pending_review_count=len(pending_records),
    )

    if existing_claim is not None and existing_claim.status != "rejected":
        readiness.expense_total = money(existing_claim.total_amount)
        readiness.total_source = "existing_claim"
        if draft_records:
            readiness.blockers.append(
                _already_submitted_blocker(
                    record_name="expense",
                    record_count=len(draft_records),
                )
            )
            readiness.available_actions = [
                "view_claim",
                "contact_claim_reviewer",
            ]
            readiness.next_action = "contact_claim_reviewer"
        else:
            readiness.state = "already_submitted"
            readiness.available_actions = ["view_claim"]
            readiness.next_action = "view_claim"
        return readiness

    readiness.submission_mode = (
        "resubmit" if existing_claim is not None else "submit"
    )
    if pending_records:
        readiness.blockers.append(
            ReadinessBlocker(
                status_code=409,
                code="MANUAL_DOCTOR_EXPENSE_REVIEW_REQUIRED",
                message=(
                    "Resolve all manual expense reviews before submitting "
                    "today's claim so no expense is stranded outside it."
                ),
                recoverable=True,
                suggested_action="open_manual_expense",
                affected_count=len(pending_records),
                blocking_fields=("manual_review_status",),
            )
        )
    if not eligible_records and not pending_records:
        readiness.blockers.append(
            ReadinessBlocker(
                status_code=400,
                code="NO_ELIGIBLE_DOCTOR_EXPENSE",
                message="No eligible draft expenses were found for today.",
                recoverable=True,
                suggested_action="add_expense",
                blocking_fields=("expense_ids",),
            )
        )
    readiness.expense_total = money(
        sum(
            record.approved_amount
            if record.approved_amount is not None
            else record.fare
            for record in eligible_records
        )
    )
    readiness.total_source = (
        "eligible_records" if eligible_records else "none"
    )
    if readiness.blockers:
        readiness.available_actions = list(
            dict.fromkeys(
                blocker.suggested_action
                for blocker in readiness.blockers
                if blocker.suggested_action
            )
        )
        readiness.next_action = readiness.available_actions[0]
    else:
        readiness.state = "ready"
        readiness.available_actions = [
            "resubmit_claim"
            if readiness.submission_mode == "resubmit"
            else "submit_claim"
        ]
        readiness.next_action = readiness.available_actions[0]
    return readiness


def raise_for_claim_readiness(
    readiness: TherapistClaimReadiness | DoctorClaimReadiness,
) -> None:
    if not readiness.blockers:
        return
    blocker = readiness.blockers[0]
    raise DomainHTTPException(
        status_code=blocker.status_code,
        code=blocker.code,
        message=blocker.message,
        recoverable=blocker.recoverable,
        suggested_action=blocker.suggested_action,
        blocking_fields=blocker.blocking_fields,
    )
