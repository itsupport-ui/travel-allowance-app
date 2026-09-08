from datetime import date, datetime

from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_expense import DoctorExpense
from app.models.claim import Claim
from app.models.travel import TravelEntry
from app.models.user import User
from app.services.report_export_service import (
    ReportFormat,
    TabularReportSpec,
    build_tabular_report_response,
    period_label,
    serialize_rows,
)
from app.services.reimbursement_policy_service import decimal_value, money


EXPENSE_STATUSES = ("draft", "submitted")
EXPENSE_HEADERS = (
    "Staff role",
    "Staff name",
    "Entry type",
    "Entry ID",
    "Business date (Asia/Kolkata)",
    "Entry status",
    "Claim status",
    "Transport mode",
    "Distance (km)",
    "Reimbursable amount (INR)",
    "Bill amount (INR)",
    "Claim ID",
    "Source",
    "Expense category",
    "Exception review status",
    "Proof attached",
    "Created at (UTC)",
)
EXPENSE_REPORT_SPEC = TabularReportSpec(
    title="Travel and expense detail register",
    filename_prefix="travel-expense-register",
    sheet_name="Travel and expenses",
    headers=EXPENSE_HEADERS,
    pdf_columns=(0, 1, 2, 4, 5, 6, 9, 13, 14),
    pdf_widths_mm=(23, 38, 24, 32, 23, 27, 32, 34, 34),
    currency_columns=(9, 10),
)


def get_expense_export_rows(
    db: Session,
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    therapist_id: int | None = None,
    doctor_id: int | None = None,
    row_limit: int,
) -> list[list[object]]:
    """Return financial detail without addresses, coordinates, or proof paths."""
    rows: list[list[object]] = []
    if role in ("all", "therapist"):
        query = (
            db.query(TravelEntry, User.username, Claim.status)
            .join(User, User.id == TravelEntry.therapist_id)
            .outerjoin(Claim, Claim.id == TravelEntry.claim_id)
        )
        if from_date is not None:
            query = query.filter(func.date(TravelEntry.travel_date) >= from_date)
        if to_date is not None:
            query = query.filter(func.date(TravelEntry.travel_date) <= to_date)
        if therapist_id is not None:
            query = query.filter(TravelEntry.therapist_id == therapist_id)
        if status != "all":
            query = query.filter(func.lower(TravelEntry.status) == status)
        travels = (
            query.order_by(TravelEntry.travel_date.desc(), TravelEntry.id.desc())
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Therapist",
                staff_name,
                "Travel",
                travel.id,
                (
                    travel.travel_date.date()
                    if isinstance(travel.travel_date, datetime)
                    else travel.travel_date
                ),
                travel.status,
                claim_status or "unclaimed",
                travel.transport_mode,
                float(travel.total_km or 0),
                float(travel.travel_fare or 0),
                (
                    ""
                    if travel.bill_amount is None
                    else float(travel.bill_amount)
                ),
                travel.claim_id,
                (
                    "Verified schedule"
                    if travel.schedule_id is not None
                    else "Manual exception"
                ),
                (
                    "Mileage"
                    if travel.transport_mode.lower() == "vehicle"
                    else "Actual fare"
                ),
                (
                    travel.manual_review_status or "legacy"
                    if travel.schedule_id is None
                    else "not_required"
                ),
                "Yes" if travel.invoice_file else "No",
                travel.created_at,
            ]
            for travel, staff_name, claim_status in travels
        )

    if role in ("all", "doctor"):
        query = (
            db.query(DoctorExpense, Doctor.name, DoctorClaim.status)
            .join(Doctor, Doctor.id == DoctorExpense.doctor_id)
            .outerjoin(DoctorClaim, DoctorClaim.id == DoctorExpense.claim_id)
        )
        if from_date is not None:
            query = query.filter(DoctorExpense.expense_date >= from_date)
        if to_date is not None:
            query = query.filter(DoctorExpense.expense_date <= to_date)
        if doctor_id is not None:
            query = query.filter(DoctorExpense.doctor_id == doctor_id)
        if status != "all":
            query = query.filter(func.lower(DoctorExpense.status) == status)
        expenses = (
            query.order_by(
                DoctorExpense.expense_date.desc(),
                DoctorExpense.id.desc(),
            )
            .limit(row_limit + 1)
            .all()
        )
        rows.extend(
            [
                "Doctor",
                staff_name,
                "Expense",
                expense.id,
                expense.expense_date,
                expense.status,
                claim_status or "unclaimed",
                expense.transport_mode,
                (
                    ""
                    if expense.distance_km is None
                    else round(float(expense.distance_km), 2)
                ),
                float(
                    expense.approved_amount
                    if expense.approved_amount is not None
                    else expense.fare or 0
                ),
                float(expense.fare or 0),
                expense.claim_id,
                "Visit route" if expense.visit_id is not None else "Manual",
                expense.expense_category.replace("_", " ").title(),
                (
                    expense.manual_review_status or "legacy"
                    if expense.visit_id is None
                    else "not_required"
                ),
                "Yes" if expense.proof_file else "No",
                expense.created_at,
            ]
            for expense, staff_name, claim_status in expenses
        )

    rows.sort(
        key=lambda row: (str(row[4]), str(row[0]), int(row[3])),
        reverse=True,
    )
    return rows


def summarize_expenses(rows: list[list[object]]) -> dict[str, int | float]:
    return {
        "draft_entries": sum(str(row[5]).lower() == "draft" for row in rows),
        "submitted_entries": sum(
            str(row[5]).lower() == "submitted" for row in rows
        ),
        "total_distance_km": round(
            sum(float(row[8] or 0) for row in rows),
            2,
        ),
        "total_reimbursable_amount": float(
            money(sum(decimal_value(row[9]) for row in rows))
        ),
        "proof_attached_entries": sum(row[15] == "Yes" for row in rows),
        "manual_entries": sum(
            row[12] in {"Manual", "Manual exception"} for row in rows
        ),
        "pending_claim_entries": sum(row[6] == "pending" for row in rows),
        "approved_claim_entries": sum(row[6] == "approved" for row in rows),
        "unclaimed_entries": sum(row[6] == "unclaimed" for row in rows),
    }


def serialize_expense_rows(
    rows: list[list[object]],
) -> list[list[object]]:
    return serialize_rows(rows)


def build_expense_export_response(
    rows: list[list[object]],
    *,
    from_date: date | None,
    to_date: date | None,
    status: str,
    role: str,
    export_format: ReportFormat,
    snapshot: datetime,
    filename_prefix: str = "travel-expense-register",
    row_limit: int,
    pdf_row_limit: int,
) -> Response:
    summary = summarize_expenses(rows)
    metadata = [
        ("Snapshot (Asia/Kolkata)", snapshot.isoformat()),
        ("Period", period_label(from_date, to_date)),
        ("Staff role", role.title()),
        ("Entry status", status.title()),
        ("Row count", str(len(rows))),
        (
            "Reimbursable amount (INR)",
            f"{summary['total_reimbursable_amount']:.2f}",
        ),
        ("Distance (km)", f"{summary['total_distance_km']:.2f}"),
        (
            "Privacy",
            "Addresses, coordinates, patients, remarks, and proof paths excluded",
        ),
    ]
    spec = TabularReportSpec(
        title=EXPENSE_REPORT_SPEC.title,
        filename_prefix=filename_prefix,
        sheet_name=EXPENSE_REPORT_SPEC.sheet_name,
        headers=EXPENSE_REPORT_SPEC.headers,
        pdf_columns=EXPENSE_REPORT_SPEC.pdf_columns,
        pdf_widths_mm=EXPENSE_REPORT_SPEC.pdf_widths_mm,
        currency_columns=EXPENSE_REPORT_SPEC.currency_columns,
    )
    return build_tabular_report_response(
        rows,
        metadata=metadata,
        export_format=export_format,
        snapshot=snapshot,
        spec=spec,
        row_limit=row_limit,
        pdf_row_limit=pdf_row_limit,
    )
