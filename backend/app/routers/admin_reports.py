from collections.abc import Sequence
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.travel import TravelEntry
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.schemas.admin_report import AdminReportOverview
from app.services.report_export_service import (
    TabularReportSpec,
    build_tabular_report_response,
    serialize_rows,
)
from app.utils.auth import require_permission
from app.utils.timezone import india_now

router = APIRouter(
    prefix="/admin-reports",
    tags=["Admin Reports"],
)

CLAIM_STATUSES = ("pending", "approved", "rejected")
TREND_DAYS = 14
RECENT_ACTIVITY_LIMIT = 8
TOP_THERAPIST_LIMIT = 5
EXPORT_ROW_LIMIT = 25_000
PDF_EXPORT_ROW_LIMIT = 2_000
CLAIM_EXPORT_HEADERS = [
    "Staff role",
    "Staff name",
    "Claim ID",
    "Business date (Asia/Kolkata)",
    "Revision",
    "Status",
    "Expense count",
    "Distance (km)",
    "Travel amount (INR)",
    "Daily allowance (INR)",
    "Claim total (INR)",
    "Submitted at (UTC)",
    "Reviewed at (UTC)",
    "Correction/rejection reason",
]
CLAIM_REPORT_SPEC = TabularReportSpec(
    title="Consolidated claim register",
    filename_prefix="claim-register",
    sheet_name="Claims",
    headers=tuple(CLAIM_EXPORT_HEADERS),
    pdf_columns=(0, 1, 2, 3, 4, 5, 10),
    pdf_widths_mm=(28, 48, 22, 44, 20, 28, 38),
    currency_columns=(9, 10, 11),
)


def _round_metric(value: float | None) -> float:
    return round(float(value or 0), 2)


def _period_label(from_date: date | None, to_date: date | None) -> str:
    if from_date and to_date:
        return f"{from_date:%d %b %Y} - {to_date:%d %b %Y}"
    if from_date:
        return f"From {from_date:%d %b %Y}"
    if to_date:
        return f"Through {to_date:%d %b %Y}"
    return "All available data"


def _trend_window(
    from_date: date | None,
    to_date: date | None,
) -> tuple[date, date]:
    today = india_now().date()
    end = to_date or max(today, from_date or today)
    start = max(
        from_date or end - timedelta(days=TREND_DAYS - 1),
        end - timedelta(days=TREND_DAYS - 1),
    )
    return start, end


def _change_insight(
    current: float,
    previous: float,
) -> tuple[str, float | None]:
    if previous == 0:
        return ("up" if current > 0 else "neutral"), None

    change = round(((current - previous) / previous) * 100, 1)
    if change > 0:
        return "up", change
    if change < 0:
        return "down", change
    return "neutral", 0


def _activity_sort_key(activity: dict) -> datetime:
    occurred_at = activity["occurred_at"]
    if occurred_at.tzinfo is not None:
        return occurred_at.astimezone(timezone.utc).replace(tzinfo=None)
    return occurred_at


def _with_date_range(
    conditions: list,
    date_expression,
    from_date: date | None,
    to_date: date | None,
) -> list:
    if from_date:
        conditions.append(date_expression >= from_date)
    if to_date:
        conditions.append(date_expression <= to_date)
    return conditions


def get_claim_export_rows(
    db: Session,
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    therapist_id: int | None = None,
    doctor_id: int | None = None,
) -> list[list]:
    """Return one privacy-safe, consistently filtered claim snapshot."""
    rows: list[list] = []
    if role in ("all", "therapist"):
        therapist_conditions = _with_date_range(
            [], Claim.claim_date, from_date, to_date
        )
        if status != "all":
            therapist_conditions.append(func.lower(Claim.status) == status)
        if therapist_id is not None:
            therapist_conditions.append(Claim.therapist_id == therapist_id)
        therapist_claims = (
            db.query(Claim, User.username)
            .join(User, User.id == Claim.therapist_id)
            .filter(*therapist_conditions)
            .order_by(Claim.claim_date.desc(), Claim.id.desc())
            .limit(EXPORT_ROW_LIMIT + 1)
            .all()
        )
        rows.extend(
            [
                "Therapist",
                staff_name,
                claim.id,
                claim.claim_date,
                claim.revision,
                claim.status,
                "",
                _round_metric(claim.total_km),
                _round_metric(claim.travel_total),
                _round_metric(claim.daily_allowance),
                _round_metric(claim.grand_total),
                claim.submitted_at,
                claim.reviewed_at,
                claim.rejection_reason,
            ]
            for claim, staff_name in therapist_claims
        )

    if role in ("all", "doctor"):
        doctor_conditions = _with_date_range(
            [], DoctorClaim.claim_date, from_date, to_date
        )
        if status != "all":
            doctor_conditions.append(func.lower(DoctorClaim.status) == status)
        if doctor_id is not None:
            doctor_conditions.append(DoctorClaim.doctor_id == doctor_id)
        doctor_claims = (
            db.query(DoctorClaim, Doctor.name)
            .join(Doctor, Doctor.id == DoctorClaim.doctor_id)
            .filter(*doctor_conditions)
            .order_by(DoctorClaim.claim_date.desc(), DoctorClaim.id.desc())
            .limit(EXPORT_ROW_LIMIT + 1)
            .all()
        )
        rows.extend(
            [
                "Doctor",
                staff_name,
                claim.id,
                claim.claim_date,
                claim.revision,
                claim.status,
                claim.expense_count,
                "",
                "",
                "",
                _round_metric(claim.total_amount),
                claim.submitted_at,
                claim.approved_at,
                claim.rejection_reason,
            ]
            for claim, staff_name in doctor_claims
        )

    rows.sort(
        key=lambda row: (str(row[3]), str(row[0]), int(row[2])),
        reverse=True,
    )
    return rows


def serialize_claim_export_rows(rows: list[list]) -> list[list]:
    return serialize_rows(rows)


def build_claim_export_response(
    rows: list[list],
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    export_format: Literal["csv", "xlsx", "pdf"],
    snapshot: datetime | None = None,
    filename_prefix: str = "claim-register",
) -> Response:
    snapshot = snapshot or india_now()
    metadata = [
        ("Snapshot (Asia/Kolkata)", snapshot.isoformat()),
        ("Period", _period_label(from_date, to_date)),
        ("Staff role", role.title()),
        ("Claim status", status.title()),
        ("Row count", str(len(rows))),
        ("Privacy", "Patient-identifying columns excluded"),
    ]
    spec = TabularReportSpec(
        title=CLAIM_REPORT_SPEC.title,
        filename_prefix=filename_prefix,
        sheet_name=CLAIM_REPORT_SPEC.sheet_name,
        headers=CLAIM_REPORT_SPEC.headers,
        pdf_columns=CLAIM_REPORT_SPEC.pdf_columns,
        pdf_widths_mm=CLAIM_REPORT_SPEC.pdf_widths_mm,
        currency_columns=CLAIM_REPORT_SPEC.currency_columns,
    )
    return build_tabular_report_response(
        rows,
        metadata=metadata,
        export_format=export_format,
        snapshot=snapshot,
        spec=spec,
        row_limit=EXPORT_ROW_LIMIT,
        pdf_row_limit=PDF_EXPORT_ROW_LIMIT,
    )


@router.get("/claims/export")
def export_claim_register(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    status: str = Query(default="all"),
    role: str = Query(default="all"),
    therapist_id: int | None = Query(default=None, ge=1),
    doctor_id: int | None = Query(default=None, ge=1),
    export_format: Literal["csv", "xlsx", "pdf"] = Query(
        default="csv",
        alias="format",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    """Export one privacy-safe claim register for both staff professions."""
    del current_user
    normalized_status = status.strip().lower()
    normalized_role = role.strip().lower()
    if normalized_status not in (*CLAIM_STATUSES, "all"):
        raise HTTPException(status_code=422, detail="Invalid claim status.")
    if normalized_role not in ("all", "therapist", "doctor"):
        raise HTTPException(status_code=422, detail="Invalid staff role.")
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=422,
            detail="To date cannot be before from date.",
        )

    rows = get_claim_export_rows(
        db,
        from_date=from_date,
        to_date=to_date,
        status=normalized_status,
        role=normalized_role,
        therapist_id=therapist_id,
        doctor_id=doctor_id,
    )

    return build_claim_export_response(
        rows,
        from_date=from_date,
        to_date=to_date,
        status=normalized_status,
        role=normalized_role,
        export_format=export_format,
    )


@router.get("/overview", response_model=AdminReportOverview)
def get_admin_report_overview(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    therapist_id: int | None = Query(default=None, ge=1),
    status: str = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("dashboards.view")
    ),
):
    del current_user

    normalized_status = status.lower()
    if normalized_status not in (*CLAIM_STATUSES, "all"):
        raise HTTPException(
            status_code=422,
            detail="Claim status must be all, pending, approved, or rejected.",
        )
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=422,
            detail="To date cannot be before from date.",
        )

    schedule_date = func.coalesce(
        func.date(TreatmentSchedule.completed_at),
        TreatmentSchedule.treatment_date,
        TreatmentSchedule.start_date,
    )
    schedule_conditions = _with_date_range(
        [],
        schedule_date,
        from_date,
        to_date,
    )
    travel_conditions = _with_date_range(
        [],
        func.date(TravelEntry.travel_date),
        from_date,
        to_date,
    )
    claim_conditions = _with_date_range(
        [],
        Claim.claim_date,
        from_date,
        to_date,
    )
    doctor_claim_conditions = _with_date_range(
        [],
        DoctorClaim.claim_date,
        from_date,
        to_date,
    )

    if therapist_id is not None:
        schedule_conditions.append(
            TreatmentSchedule.therapist_id == therapist_id
        )
        travel_conditions.append(TravelEntry.therapist_id == therapist_id)
        claim_conditions.append(Claim.therapist_id == therapist_id)
    if normalized_status != "all":
        claim_conditions.append(
            func.lower(Claim.status) == normalized_status
        )
        doctor_claim_conditions.append(
            func.lower(DoctorClaim.status) == normalized_status
        )

    today = india_now().date()
    today_in_period = (
        (from_date is None or today >= from_date)
        and (to_date is None or today <= to_date)
    )
    today_conditions = [
        TreatmentSchedule.status == "scheduled",
        or_(
            (
                (TreatmentSchedule.schedule_type == "one_time")
                & (TreatmentSchedule.treatment_date == today)
            ),
            (
                (TreatmentSchedule.schedule_type != "one_time")
                & (TreatmentSchedule.start_date <= today)
                & (TreatmentSchedule.end_date >= today)
            ),
        ),
    ]
    if therapist_id is not None:
        today_conditions.append(
            TreatmentSchedule.therapist_id == therapist_id
        )
    todays_treatments = (
        db.query(TreatmentSchedule)
        .filter(*today_conditions)
        .count()
        if today_in_period
        else 0
    )

    schedule_status_counts = dict(
        db.query(
            func.lower(TreatmentSchedule.status),
            func.count(TreatmentSchedule.id),
        )
        .filter(*schedule_conditions)
        .group_by(func.lower(TreatmentSchedule.status))
        .all()
    )
    claim_status_counts = dict(
        db.query(
            func.lower(Claim.status),
            func.count(Claim.id),
        )
        .filter(*claim_conditions)
        .group_by(func.lower(Claim.status))
        .all()
    )
    if therapist_id is None:
        doctor_claim_status_counts = dict(
            db.query(
                func.lower(DoctorClaim.status),
                func.count(DoctorClaim.id),
            )
            .filter(*doctor_claim_conditions)
            .group_by(func.lower(DoctorClaim.status))
            .all()
        )
        for claim_status, count in doctor_claim_status_counts.items():
            claim_status_counts[claim_status] = (
                int(claim_status_counts.get(claim_status, 0)) + int(count)
            )

    total_km, total_travel_amount, patients_visited = (
        db.query(
            func.coalesce(func.sum(TravelEntry.total_km), 0),
            func.coalesce(func.sum(TravelEntry.travel_fare), 0),
            func.coalesce(
                func.sum(
                    case((TravelEntry.patient_visited.is_(True), 1), else_=0)
                ),
                0,
            ),
        )
        .filter(*travel_conditions)
        .one()
    )
    travelling_therapists = (
        db.query(func.count(func.distinct(TravelEntry.therapist_id)))
        .filter(*travel_conditions)
        .scalar()
        or 0
    )
    total_claims = sum(claim_status_counts.values())

    active_therapist_query = db.query(User).filter(
        User.role == "therapist",
        User.is_active.is_(True),
    )
    if therapist_id is not None:
        active_therapist_query = active_therapist_query.filter(
            User.id == therapist_id
        )
    active_therapists = active_therapist_query.count()

    completed_subquery = (
        db.query(
            TreatmentSchedule.therapist_id.label("therapist_id"),
            func.count(TreatmentSchedule.id).label("completed_treatments"),
        )
        .filter(
            *schedule_conditions,
            func.lower(TreatmentSchedule.status) == "completed",
        )
        .group_by(TreatmentSchedule.therapist_id)
        .subquery()
    )
    travel_subquery = (
        db.query(
            TravelEntry.therapist_id.label("therapist_id"),
            func.coalesce(func.sum(TravelEntry.total_km), 0).label(
                "total_km"
            ),
        )
        .filter(*travel_conditions)
        .group_by(TravelEntry.therapist_id)
        .subquery()
    )
    claims_subquery = (
        db.query(
            Claim.therapist_id.label("therapist_id"),
            func.count(Claim.id).label("claims_submitted"),
        )
        .filter(*claim_conditions)
        .group_by(Claim.therapist_id)
        .subquery()
    )

    therapist_rows = (
        db.query(
            User.id,
            User.username,
            func.coalesce(completed_subquery.c.completed_treatments, 0),
            func.coalesce(travel_subquery.c.total_km, 0),
            func.coalesce(claims_subquery.c.claims_submitted, 0),
        )
        .outerjoin(
            completed_subquery,
            completed_subquery.c.therapist_id == User.id,
        )
        .outerjoin(
            travel_subquery,
            travel_subquery.c.therapist_id == User.id,
        )
        .outerjoin(
            claims_subquery,
            claims_subquery.c.therapist_id == User.id,
        )
        .filter(
            User.role == "therapist",
            *([User.id == therapist_id] if therapist_id else []),
        )
        .order_by(
            func.coalesce(
                completed_subquery.c.completed_treatments,
                0,
            ).desc(),
            func.coalesce(travel_subquery.c.total_km, 0).desc(),
            User.username.asc(),
        )
        .limit(TOP_THERAPIST_LIMIT)
        .all()
    )
    top_therapists = [
        {
            "therapist_id": row[0],
            "therapist_name": row[1],
            "completed_treatments": int(row[2]),
            "total_km": _round_metric(row[3]),
            "claims_submitted": int(row[4]),
        }
        for row in therapist_rows
        if int(row[2]) > 0 or float(row[3]) > 0 or int(row[4]) > 0
    ]

    trend_start, trend_end = _trend_window(from_date, to_date)
    trend_schedule_conditions = [
        TreatmentSchedule.status == "completed",
        func.date(TreatmentSchedule.completed_at) >= trend_start,
        func.date(TreatmentSchedule.completed_at) <= trend_end,
    ]
    trend_travel_conditions = [
        func.date(TravelEntry.travel_date) >= trend_start,
        func.date(TravelEntry.travel_date) <= trend_end,
    ]
    if therapist_id is not None:
        trend_schedule_conditions.append(
            TreatmentSchedule.therapist_id == therapist_id
        )
        trend_travel_conditions.append(
            TravelEntry.therapist_id == therapist_id
        )

    completed_by_date = {
        str(row[0]): int(row[1])
        for row in (
            db.query(
                func.date(TreatmentSchedule.completed_at),
                func.count(TreatmentSchedule.id),
            )
            .filter(*trend_schedule_conditions)
            .group_by(func.date(TreatmentSchedule.completed_at))
            .all()
        )
    }
    travel_by_date = {
        str(row[0]): (_round_metric(row[1]), _round_metric(row[2]))
        for row in (
            db.query(
                func.date(TravelEntry.travel_date),
                func.coalesce(func.sum(TravelEntry.total_km), 0),
                func.coalesce(func.sum(TravelEntry.travel_fare), 0),
            )
            .filter(*trend_travel_conditions)
            .group_by(func.date(TravelEntry.travel_date))
            .all()
        )
    }
    trend_dates: Sequence[date] = tuple(
        trend_start + timedelta(days=offset)
        for offset in range((trend_end - trend_start).days + 1)
    )
    trends = [
        {
            "date": trend_date,
            "completed_treatments": completed_by_date.get(
                trend_date.isoformat(),
                0,
            ),
            "total_km": travel_by_date.get(
                trend_date.isoformat(),
                (0, 0),
            )[0],
            "travel_amount": travel_by_date.get(
                trend_date.isoformat(),
                (0, 0),
            )[1],
        }
        for trend_date in trend_dates
    ]

    claim_activities = (
        db.query(Claim, User.username)
        .join(User, User.id == Claim.therapist_id)
        .filter(*claim_conditions)
        .order_by(Claim.submitted_at.desc(), Claim.id.desc())
        .limit(RECENT_ACTIVITY_LIMIT)
        .all()
    )
    treatment_activities = (
        db.query(TreatmentSchedule, User.username)
        .join(User, User.id == TreatmentSchedule.therapist_id)
        .filter(*schedule_conditions)
        .order_by(
            TreatmentSchedule.completed_at.desc(),
            TreatmentSchedule.id.desc(),
        )
        .limit(RECENT_ACTIVITY_LIMIT)
        .all()
    )
    travel_activities = (
        db.query(TravelEntry, User.username)
        .join(User, User.id == TravelEntry.therapist_id)
        .filter(*travel_conditions)
        .order_by(TravelEntry.travel_date.desc(), TravelEntry.id.desc())
        .limit(RECENT_ACTIVITY_LIMIT)
        .all()
    )

    recent_activity = [
        {
            "id": f"claim-{claim.id}",
            "activity_type": "claim",
            "therapist_name": therapist_name,
            "occurred_at": claim.submitted_at
            or datetime.combine(claim.claim_date, time.min),
            "status": claim.status,
            "amount": _round_metric(claim.grand_total),
            "description": "Allowance claim submitted",
        }
        for claim, therapist_name in claim_activities
    ]
    recent_activity.extend(
        {
            "id": f"treatment-{schedule.id}",
            "activity_type": "treatment",
            "therapist_name": therapist_name,
            "occurred_at": schedule.completed_at
            or datetime.combine(
                schedule.treatment_date
                or schedule.start_date
                or india_now().date(),
                time.min,
            ),
            "status": schedule.status,
            "amount": None,
            "description": "Treatment activity recorded",
        }
        for schedule, therapist_name in treatment_activities
    )
    recent_activity.extend(
        {
            "id": f"travel-{travel.id}",
            "activity_type": "travel",
            "therapist_name": therapist_name,
            "occurred_at": travel.travel_date,
            "status": travel.status,
            "amount": _round_metric(travel.travel_fare),
            "description": "Travel entry recorded",
        }
        for travel, therapist_name in travel_activities
    )
    recent_activity = sorted(
        recent_activity,
        key=_activity_sort_key,
        reverse=True,
    )[:RECENT_ACTIVITY_LIMIT]

    midpoint = max(0, len(trends) - 7)
    prior_start = max(0, midpoint - 7)
    current_treatments = sum(
        point["completed_treatments"] for point in trends[midpoint:]
    )
    prior_treatments = sum(
        point["completed_treatments"]
        for point in trends[prior_start:midpoint]
    )
    treatment_direction, treatment_change = _change_insight(
        current_treatments,
        prior_treatments,
    )

    travel_days = sum(1 for point in trends if point["total_km"] > 0)
    average_daily_km = (
        _round_metric(float(total_km) / travel_days)
        if travel_days
        else 0
    )
    pending_count = int(claim_status_counts.get("pending", 0))
    pending_share = (
        round((pending_count / total_claims) * 100, 1)
        if total_claims
        else 0
    )
    highest_therapist_claim = (
        db.query(func.max(Claim.grand_total))
        .filter(*claim_conditions)
        .scalar()
        or 0
    )
    highest_doctor_claim = (
        db.query(func.max(DoctorClaim.total_amount))
        .filter(*doctor_claim_conditions)
        .scalar()
        or 0
        if therapist_id is None
        else 0
    )
    highest_claim = max(
        float(highest_therapist_claim),
        float(highest_doctor_claim),
    )
    top_name = (
        top_therapists[0]["therapist_name"]
        if top_therapists
        else None
    )
    highest_traveller = (
        db.query(User.username, travel_subquery.c.total_km)
        .join(
            travel_subquery,
            travel_subquery.c.therapist_id == User.id,
        )
        .filter(
            User.role == "therapist",
            *([User.id == therapist_id] if therapist_id else []),
        )
        .order_by(
            travel_subquery.c.total_km.desc(),
            User.username.asc(),
        )
        .first()
    )

    kpis = {
        "todays_treatments": todays_treatments,
        "completed_treatments": int(
            schedule_status_counts.get("completed", 0)
        ),
        "cancelled_treatments": int(
            schedule_status_counts.get("cancelled", 0)
            + schedule_status_counts.get("canceled", 0)
        ),
        "patients_visited": int(patients_visited),
        "total_claims": total_claims,
        "pending_claims": pending_count,
        "approved_claims": int(
            claim_status_counts.get("approved", 0)
        ),
        "rejected_claims": int(
            claim_status_counts.get("rejected", 0)
        ),
        "total_km": _round_metric(total_km),
        "total_travel_amount": _round_metric(total_travel_amount),
        "average_km_per_therapist": _round_metric(
            float(total_km) / travelling_therapists
            if travelling_therapists
            else 0
        ),
        "active_therapists": active_therapists,
        "top_performing_therapist": top_name,
    }
    has_data = any(
        (
            kpis["todays_treatments"],
            kpis["completed_treatments"],
            kpis["cancelled_treatments"],
            kpis["patients_visited"],
            kpis["total_claims"],
            kpis["total_km"],
        )
    )

    return {
        "generated_at": datetime.now(timezone.utc),
        "period_label": _period_label(from_date, to_date),
        "trend_period_label": (
            f"{trend_start:%d %b} - {trend_end:%d %b %Y}"
        ),
        "has_data": has_data,
        "kpis": kpis,
        "trends": trends,
        "claims_by_status": [
            {
                "status": claim_status,
                "count": int(claim_status_counts.get(claim_status, 0)),
            }
            for claim_status in CLAIM_STATUSES
        ],
        "top_therapists": top_therapists,
        "recent_activity": recent_activity,
        "insights": [
            {
                "key": "treatment-change",
                "title": "Treatment momentum",
                "value": str(current_treatments),
                "detail": "Completed in the latest 7-day window",
                "direction": treatment_direction,
                "change_percent": treatment_change,
            },
            {
                "key": "pending-share",
                "title": "Claims awaiting review",
                "value": f"{pending_share:g}%",
                "detail": f"{pending_count} of {total_claims} filtered claims",
                "direction": "down" if pending_count else "neutral",
                "change_percent": None,
            },
            {
                "key": "daily-distance",
                "title": "Average active-day travel",
                "value": f"{average_daily_km:g} km",
                "detail": f"Across {travel_days} travel days",
                "direction": "neutral",
                "change_percent": None,
            },
            {
                "key": "highest-traveller",
                "title": "Highest travelling therapist",
                "value": (
                    highest_traveller[0]
                    if highest_traveller
                    else "No activity"
                ),
                "detail": (
                    f"{_round_metric(highest_traveller[1]):g} km recorded"
                    if highest_traveller
                    else "No travel recorded in this period"
                ),
                "direction": "neutral",
                "change_percent": None,
            },
            {
                "key": "highest-claim",
                "title": "Highest reimbursement",
                "value": f"INR {_round_metric(highest_claim):,.2f}",
                "detail": "Largest filtered claim amount",
                "direction": "neutral",
                "change_percent": None,
            },
        ],
    }
