from hashlib import sha256
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal, get_db
from app.config import (
    REPORT_ARTIFACT_S3_BUCKET,
    REPORT_ARTIFACT_STORAGE,
    REPORT_ASYNC_ROW_THRESHOLD,
)
from app.models.doctor import Doctor
from app.models.report_export_audit import ReportExportAudit
from app.models.report_export_event import ReportExportEvent
from app.models.report_export_job import ReportExportJob
from app.models.report_snapshot import ReportSnapshot
from app.models.user import User
from app.routers.admin_reports import (
    EXPORT_ROW_LIMIT,
    PDF_EXPORT_ROW_LIMIT,
    build_claim_export_response,
    export_claim_register,
    get_claim_export_rows,
    serialize_claim_export_rows,
)
from app.schemas.report_center import (
    ReportDefinition,
    ReportExportHistoryItem,
    ReportExportEventResponse,
    ReportExportJobRequest,
    ReportExportJobResponse,
    ReportOperationsHealth,
    ReportPreviewRequest,
    ReportPreviewResponse,
)
from app.schemas.travel_expense_report import TravelExpenseReportResponse
from app.services.reimbursement_policy_service import decimal_value, money
from app.services.attendance_report_service import (
    ATTENDANCE_STATUSES,
    build_attendance_export_response,
    get_attendance_export_rows,
    serialize_attendance_rows,
    summarize_attendance,
)
from app.services.expense_report_service import (
    EXPENSE_STATUSES,
    build_expense_export_response,
    get_expense_export_rows,
    serialize_expense_rows,
    summarize_expenses,
)
from app.services.clinical_activity_report_service import (
    CLINICAL_ACTIVITY_STATUSES,
    build_clinical_activity_response,
    get_clinical_activity_rows,
    serialize_clinical_activity_rows,
    summarize_clinical_activity,
)
from app.services.exception_report_service import (
    EXCEPTION_STATUSES,
    build_exception_export_response,
    get_exception_rows,
    serialize_exception_rows,
    summarize_exceptions,
)
from app.services.performance_report_service import (
    build_performance_export_response,
    get_performance_rows,
    serialize_performance_rows,
    summarize_performance,
)
from app.services.report_retention_service import (
    cleanup_expired_report_artifacts,
)
from app.services.travel_expense_report_service import (
    build_travel_expense_export_response,
    build_travel_expense_report,
    resolve_report_period,
)
from app.services.report_artifact_storage import (
    delete_stored_report_artifact,
    read_report_artifact,
    report_artifact_exists,
    store_report_artifact,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.auth import get_current_user
from app.utils.permissions import role_has_permission
from app.utils.timezone import india_now


router = APIRouter(prefix="/reports", tags=["Report Center"])
REPORT_FORMATS = ["pdf", "xlsx", "csv"]


def _remove_expired_snapshots(db: Session) -> None:
    cleanup_expired_report_artifacts(db, commit=False)


def _catalog_for_role(role: str) -> list[ReportDefinition]:
    privacy_note = (
        "Patient-identifying columns are excluded. Access is checked again "
        "when previewing and downloading."
    )
    if role_has_permission(role, "dashboards.view"):
        return [
            ReportDefinition(
                report_type="consolidated_claims",
                title="Consolidated claim register",
                description=(
                    "Therapist and doctor reimbursement claims in one "
                    "privacy-safe register."
                ),
                scope="organization",
                formats=REPORT_FORMATS,
                filters=[
                    "from_date",
                    "to_date",
                    "status",
                    "role",
                    "therapist_id",
                    "doctor_id",
                ],
                privacy_note=privacy_note,
            ),
            ReportDefinition(
                report_type="organization_attendance",
                title="Attendance and workday register",
                description=(
                    "Therapist and doctor workdays, durations, activity "
                    "counts, and early-closure reasons."
                ),
                scope="organization",
                formats=REPORT_FORMATS,
                filters=[
                    "from_date",
                    "to_date",
                    "status",
                    "role",
                    "therapist_id",
                    "doctor_id",
                ],
                privacy_note=(
                    "Patient identity and precise workday locations are "
                    "excluded. Access is rechecked for every artifact."
                ),
            ),
            ReportDefinition(
                report_type="organization_expenses",
                title="Travel and expense detail register",
                description=(
                    "Therapist travel and doctor expenses with status, "
                    "distance, reimbursement, source, and proof presence."
                ),
                scope="organization",
                formats=REPORT_FORMATS,
                filters=[
                    "from_date",
                    "to_date",
                    "status",
                    "role",
                    "therapist_id",
                    "doctor_id",
                ],
                privacy_note=(
                    "Addresses, coordinates, patient data, remarks, and "
                    "proof paths are excluded."
                ),
            ),
            ReportDefinition(
                report_type="organization_clinical_activity",
                title="Clinical activity register",
                description=(
                    "Therapist treatment sessions plus doctor consultations, "
                    "visits, and treatment plans in one activity register."
                ),
                scope="organization",
                formats=REPORT_FORMATS,
                filters=[
                    "from_date",
                    "to_date",
                    "status",
                    "role",
                    "therapist_id",
                    "doctor_id",
                ],
                privacy_note=(
                    "Patients, diagnoses, notes, phone numbers, and locations "
                    "are excluded."
                ),
            ),
            ReportDefinition(
                report_type="organization_exceptions",
                title="Operational exception register",
                description=(
                    "Open and early-ended workdays, active or missed sessions, "
                    "rejected submissions, and manual financial entries."
                ),
                scope="organization",
                formats=REPORT_FORMATS,
                filters=[
                    "from_date",
                    "to_date",
                    "status",
                    "role",
                    "therapist_id",
                    "doctor_id",
                ],
                privacy_note=(
                    "Patients, locations, clinical text, and free-text reasons "
                    "are excluded."
                ),
            ),
            ReportDefinition(
                report_type="organization_performance",
                title="Staff operational performance summary",
                description=(
                    "Objective attendance, clinical activity, travel, expense, "
                    "and claim totals per therapist or doctor."
                ),
                scope="organization",
                formats=REPORT_FORMATS,
                filters=["from_date", "to_date", "role", "therapist_id", "doctor_id"],
                privacy_note=(
                    "No ranking or composite score. Patients, locations, notes, "
                    "and proof files are excluded."
                ),
            ),
        ]
    if role in {"doctor", "therapist"}:
        return [
            ReportDefinition(
                report_type="my_claims",
                title="My claim register",
                description=(
                    "Your own reimbursement claims for a selected period."
                ),
                scope="self",
                formats=REPORT_FORMATS,
                filters=["from_date", "to_date", "status"],
                privacy_note=privacy_note,
            ),
            ReportDefinition(
                report_type="my_attendance",
                title="My attendance and workdays",
                description=(
                    "Your own workdays, durations, activity counts, and "
                    "recorded early closures."
                ),
                scope="self",
                formats=REPORT_FORMATS,
                filters=["from_date", "to_date", "status"],
                privacy_note=(
                    "Precise locations and patient identity are excluded."
                ),
            ),
            ReportDefinition(
                report_type="my_expenses",
                title="My travel and expenses",
                description=(
                    "Your travel or expense entries, claim linkage, "
                    "distance, and reimbursable totals."
                ),
                scope="self",
                formats=REPORT_FORMATS,
                filters=["from_date", "to_date", "status"],
                privacy_note=(
                    "Addresses, coordinates, patient data, remarks, and "
                    "proof paths are excluded."
                ),
            ),
            ReportDefinition(
                report_type="my_clinical_activity",
                title="My clinical activity",
                description=(
                    "Your treatment sessions or consultations, visits, and "
                    "treatment plans for the selected period."
                ),
                scope="self",
                formats=REPORT_FORMATS,
                filters=["from_date", "to_date", "status"],
                privacy_note=(
                    "Patients, diagnoses, notes, phone numbers, and locations "
                    "are excluded."
                ),
            ),
            ReportDefinition(
                report_type="my_performance",
                title="My operational summary",
                description=(
                    "Your objective workday, clinical activity, travel or expense, "
                    "and claim totals for the selected period."
                ),
                scope="self",
                formats=REPORT_FORMATS,
                filters=["from_date", "to_date"],
                privacy_note=(
                    "No ranking or composite score. Patients, locations, notes, "
                    "and proof files are excluded."
                ),
            ),
        ]
    return []


def _self_scope(
    db: Session,
    current_user: User,
) -> tuple[str, int | None, int | None]:
    if current_user.role == "therapist":
        return "therapist", current_user.id, None
    if current_user.role == "doctor":
        doctor = (
            db.query(Doctor)
            .filter(Doctor.user_id == current_user.id)
            .first()
        )
        if doctor is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctor profile is not linked to this user.",
            )
        return "doctor", None, doctor.id
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Self-service reports are available to doctors and therapists.",
    )


def _validate_date_range(
    from_date: date | None,
    to_date: date | None,
) -> None:
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="To date cannot be before from date.",
        )


def _owned_snapshot(
    db: Session,
    snapshot_id: str,
    current_user: User,
) -> ReportSnapshot:
    snapshot = (
        db.query(ReportSnapshot)
        .filter(ReportSnapshot.id == snapshot_id)
        .first()
    )
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report snapshot not found.",
        )
    expires_at = snapshot.expires_at
    now_utc = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=None)
    if expires_at <= now_utc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Report snapshot has expired. Preview the report again.",
        )
    organization_access = (
        snapshot.scope == "organization"
        and role_has_permission(current_user.role, "dashboards.view")
    )
    if (
        snapshot.requested_by != current_user.id
        and not organization_access
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report snapshot not found.",
        )
    if snapshot.scope == "organization" and not organization_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization report permission is required.",
        )
    if snapshot.scope == "self" and current_user.role not in {
        "doctor",
        "therapist",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This self-service report is no longer available.",
        )
    return snapshot


def _snapshot_response(
    snapshot: ReportSnapshot,
    export_format: Literal["csv", "xlsx", "pdf"],
) -> Response:
    stored_filters = snapshot.filters or {}
    stored_from = stored_filters.get("from_date")
    stored_to = stored_filters.get("to_date")
    from_date = date.fromisoformat(stored_from) if stored_from else None
    to_date = date.fromisoformat(stored_to) if stored_to else None
    role = str(stored_filters.get("role") or "all")
    report_status = str(stored_filters.get("status") or "all")
    if snapshot.report_type == "organization_exceptions":
        response = build_exception_export_response(
            snapshot.rows or [],
            from_date=from_date,
            to_date=to_date,
            status=report_status,
            role=role,
            export_format=export_format,
            snapshot=snapshot.snapshot_at,
            filename_prefix="operational-exception-register",
            row_limit=EXPORT_ROW_LIMIT,
            pdf_row_limit=PDF_EXPORT_ROW_LIMIT,
        )
    elif snapshot.report_type in {
        "organization_performance",
        "my_performance",
    }:
        filename_prefix = (
            "staff-performance-summary"
            if snapshot.scope == "organization"
            else f"my-operational-summary-{role}"
        )
        response = build_performance_export_response(
            snapshot.rows or [],
            from_date=from_date,
            to_date=to_date,
            role=role,
            export_format=export_format,
            snapshot=snapshot.snapshot_at,
            filename_prefix=filename_prefix,
            row_limit=EXPORT_ROW_LIMIT,
            pdf_row_limit=PDF_EXPORT_ROW_LIMIT,
        )
    elif snapshot.report_type in {
        "organization_clinical_activity",
        "my_clinical_activity",
    }:
        filename_prefix = (
            "clinical-activity-register"
            if snapshot.scope == "organization"
            else f"my-clinical-activity-{role}"
        )
        response = build_clinical_activity_response(
            snapshot.rows or [],
            from_date=from_date,
            to_date=to_date,
            status=report_status,
            role=role,
            export_format=export_format,
            snapshot=snapshot.snapshot_at,
            filename_prefix=filename_prefix,
            row_limit=EXPORT_ROW_LIMIT,
            pdf_row_limit=PDF_EXPORT_ROW_LIMIT,
        )
    elif snapshot.report_type in {
        "organization_expenses",
        "my_expenses",
    }:
        filename_prefix = (
            "travel-expense-register"
            if snapshot.scope == "organization"
            else f"my-travel-expenses-{role}"
        )
        response = build_expense_export_response(
            snapshot.rows or [],
            from_date=from_date,
            to_date=to_date,
            status=report_status,
            role=role,
            export_format=export_format,
            snapshot=snapshot.snapshot_at,
            filename_prefix=filename_prefix,
            row_limit=EXPORT_ROW_LIMIT,
            pdf_row_limit=PDF_EXPORT_ROW_LIMIT,
        )
    elif snapshot.report_type in {
        "organization_attendance",
        "my_attendance",
    }:
        filename_prefix = (
            "attendance-register"
            if snapshot.scope == "organization"
            else f"my-attendance-{role}"
        )
        response = build_attendance_export_response(
            snapshot.rows or [],
            from_date=from_date,
            to_date=to_date,
            status=report_status,
            role=role,
            export_format=export_format,
            snapshot=snapshot.snapshot_at,
            filename_prefix=filename_prefix,
            row_limit=EXPORT_ROW_LIMIT,
            pdf_row_limit=PDF_EXPORT_ROW_LIMIT,
        )
    else:
        filename_prefix = (
            "claim-register"
            if snapshot.scope == "organization"
            else f"my-claims-{role}"
        )
        response = build_claim_export_response(
            snapshot.rows or [],
            from_date=from_date,
            to_date=to_date,
            status=report_status,
            role=role,
            export_format=export_format,
            snapshot=snapshot.snapshot_at,
            filename_prefix=filename_prefix,
        )
    response.headers["X-Report-Scope"] = snapshot.scope
    response.headers["X-Report-Snapshot-Id"] = snapshot.id
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def _response_filename(response: Response) -> str:
    disposition = response.headers.get("content-disposition", "")
    marker = 'filename="'
    if marker in disposition:
        return disposition.split(marker, 1)[1].split('"', 1)[0]
    return "report-export"


def _record_export_event(
    db: Session,
    *,
    current_user: User,
    event_type: str,
    outcome: str,
    snapshot: ReportSnapshot | None = None,
    job: ReportExportJob | None = None,
    requested_snapshot_id: str | None = None,
    export_format: str | None = None,
    error_code: str | None = None,
    details: dict[str, int | float | str] | None = None,
) -> None:
    db.add(
        ReportExportEvent(
            id=str(uuid4()),
            requested_by=current_user.id,
            snapshot_id=(
                snapshot.id if snapshot is not None else requested_snapshot_id
            ),
            export_job_id=job.id if job is not None else None,
            report_type=(
                snapshot.report_type
                if snapshot is not None
                else job.report_type if job is not None else None
            ),
            scope=(
                snapshot.scope
                if snapshot is not None
                else job.scope if job is not None else None
            ),
            format=export_format or (job.format if job is not None else None),
            event_type=event_type,
            outcome=outcome,
            error_code=error_code,
            details=details or {},
        )
    )
    audit_entity_id = (
        job.id
        if job is not None
        else snapshot.id
        if snapshot is not None
        else requested_snapshot_id or f"requester-{current_user.id}"
    )
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="reporting",
        entity_type="report_export",
        entity_id=audit_entity_id,
        action=event_type,
        outcome=outcome,
        to_state=job.status if job is not None else outcome,
        reason_code=error_code,
        related_entity_type="report_snapshot" if snapshot is not None else None,
        related_entity_id=snapshot.id if snapshot is not None else None,
        correlation_id=job.id if job is not None else requested_snapshot_id,
        details={
            **(details or {}),
            "report_type": (
                snapshot.report_type
                if snapshot is not None
                else job.report_type if job is not None else None
            ),
            "scope": (
                snapshot.scope
                if snapshot is not None
                else job.scope if job is not None else None
            ),
            "format": export_format or (job.format if job is not None else None),
        },
    )
    db.commit()


def _record_export_download(
    db: Session,
    snapshot: ReportSnapshot,
    export_format: str,
    response: Response,
    current_user: User,
) -> None:
    content = bytes(response.body)
    downloaded_at = datetime.now(timezone.utc)
    existing = (
        db.query(ReportExportAudit)
        .filter(
            ReportExportAudit.snapshot_id == snapshot.id,
            ReportExportAudit.requested_by == current_user.id,
            ReportExportAudit.format == export_format,
        )
        .with_for_update()
        .first()
    )
    if existing is None:
        existing = ReportExportAudit(
            id=str(uuid4()),
            snapshot_id=snapshot.id,
            requested_by=current_user.id,
            report_type=snapshot.report_type,
            scope=snapshot.scope,
            format=export_format,
            filters=snapshot.filters or {},
            row_count=snapshot.row_count,
            total_amount=snapshot.total_amount,
            summary=snapshot.summary or {},
            snapshot_at=snapshot.snapshot_at,
            snapshot_expires_at=snapshot.expires_at,
            filename=_response_filename(response),
            mime_type=response.headers.get(
                "content-type",
                "application/octet-stream",
            ),
            size_bytes=len(content),
            checksum_sha256=sha256(content).hexdigest(),
            download_count=1,
            first_generated_at=downloaded_at,
            last_downloaded_at=downloaded_at,
        )
        db.add(existing)
    else:
        existing.download_count += 1
        existing.last_downloaded_at = downloaded_at
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(ReportExportAudit)
            .filter(
                ReportExportAudit.snapshot_id == snapshot.id,
                ReportExportAudit.requested_by == current_user.id,
                ReportExportAudit.format == export_format,
            )
            .with_for_update()
            .one()
        )
        existing.download_count += 1
        existing.last_downloaded_at = downloaded_at
        db.commit()


def _job_access_allowed(job: ReportExportJob, current_user: User) -> bool:
    if job.scope == "organization":
        return role_has_permission(current_user.role, "dashboards.view")
    return (
        job.scope == "self"
        and job.requested_by == current_user.id
        and current_user.role in {"doctor", "therapist"}
    )


def _job_response(job: ReportExportJob) -> ReportExportJobResponse:
    expires_at = job.expires_at
    now_utc = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=None)
    expired = expires_at <= now_utc
    return ReportExportJobResponse(
        id=job.id,
        snapshot_id=job.snapshot_id,
        report_type=job.report_type,
        scope=job.scope,
        format=job.format,
        status="expired" if expired else job.status,
        filename=job.filename,
        mime_type=job.mime_type,
        size_bytes=job.size_bytes,
        checksum_sha256=job.checksum_sha256,
        row_count=job.row_count,
        total_amount=float(job.total_amount),
        summary=job.summary or {},
        created_at=job.created_at,
        completed_at=job.completed_at,
        attempt_count=int(job.attempt_count or 0),
        error_code=job.error_code,
        expires_at=job.expires_at,
        download_url=(
            f"/reports/exports/{job.id}/download"
            if not expired and job.status == "completed"
            else None
        ),
    )


def _process_queued_export_job_in_session(db: Session, export_id: str) -> None:
    """Render one persisted job in a caller-owned database session."""
    job = (
        db.query(ReportExportJob)
        .filter(ReportExportJob.id == export_id)
        .with_for_update()
        .first()
    )
    if job is None:
        return
    stale_before = datetime.now(timezone.utc) - timedelta(minutes=10)
    started_at = job.started_at
    if started_at is not None and started_at.tzinfo is None:
        stale_before = stale_before.replace(tzinfo=None)
    retryable_processing = (
        job.status == "processing"
        and (started_at is None or started_at <= stale_before)
    )
    if job.status != "queued" and not retryable_processing:
        return
    snapshot = db.get(ReportSnapshot, job.snapshot_id)
    requester = db.get(User, job.requested_by)
    if snapshot is None or requester is None:
        job.status = "failed"
        job.error_code = "source_unavailable"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        return
    job.status = "processing"
    job.started_at = datetime.now(timezone.utc)
    job.attempt_count = int(job.attempt_count or 0) + 1
    job.error_code = None
    db.commit()
    stored = None
    artifact_committed = False
    try:
        rendered = _snapshot_response(snapshot, job.format)
        content = bytes(rendered.body)
        job.filename = _response_filename(rendered)
        job.mime_type = rendered.headers.get(
            "content-type", "application/octet-stream"
        )
        job.size_bytes = len(content)
        job.checksum_sha256 = sha256(content).hexdigest()
        stored = store_report_artifact(
            export_id=job.id,
            content=content,
            content_type=job.mime_type,
            filename=job.filename,
        )
        job.artifact_storage = stored.backend
        job.artifact_container = stored.container
        job.artifact_key = stored.object_key
        job.artifact = stored.inline_content
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        artifact_committed = True
        db.refresh(job)
        _record_export_event(
            db,
            current_user=requester,
            event_type="generation_completed",
            outcome="success",
            snapshot=snapshot,
            job=job,
            details={"row_count": job.row_count, "size_bytes": job.size_bytes},
        )
    except Exception:
        db.rollback()
        if artifact_committed:
            # Artifact delivery remains valid even if non-critical event logging fails.
            return
        if stored is not None and not artifact_committed:
            try:
                delete_stored_report_artifact(stored)
            except Exception:
                pass
        job = db.get(ReportExportJob, export_id)
        if job is not None:
            job.status = "failed"
            job.error_code = "render_failed"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            _record_export_event(
                db,
                current_user=requester,
                event_type="generation_failed",
                outcome="failure",
                snapshot=snapshot,
                job=job,
                error_code="render_failed",
            )


def _process_queued_export_job(export_id: str) -> None:
    """Open an independent worker session for a durable queued job."""
    with SessionLocal() as db:
        _process_queued_export_job_in_session(db, export_id)


@router.get("/catalog", response_model=list[ReportDefinition])
def get_report_catalog(
    current_user: User = Depends(get_current_user),
):
    return _catalog_for_role(current_user.role)


@router.get("/operations/health", response_model=ReportOperationsHealth)
def get_report_operations_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not role_has_permission(current_user.role, "dashboards.view"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Report operations permission is required.",
        )
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(minutes=10)
    recent_failure_cutoff = now - timedelta(hours=24)
    queued_jobs = db.query(ReportExportJob).filter(
        ReportExportJob.status == "queued",
        ReportExportJob.expires_at > now,
    ).count()
    processing_jobs = db.query(ReportExportJob).filter(
        ReportExportJob.status == "processing",
        ReportExportJob.expires_at > now,
    ).count()
    stale_processing_jobs = db.query(ReportExportJob).filter(
        ReportExportJob.status == "processing",
        ReportExportJob.started_at <= stale_before,
        ReportExportJob.expires_at > now,
    ).count()
    failed_jobs = db.query(ReportExportJob).filter(
        ReportExportJob.status == "failed",
        ReportExportJob.completed_at >= recent_failure_cutoff,
    ).count()
    expired_jobs = db.query(ReportExportJob).filter(
        ReportExportJob.expires_at <= now,
    ).count()
    oldest_pending = db.query(func.min(ReportExportJob.created_at)).filter(
        ReportExportJob.status.in_(("queued", "processing")),
        ReportExportJob.expires_at > now,
    ).scalar()
    if oldest_pending is not None:
        comparable_now = now
        if oldest_pending.tzinfo is None:
            comparable_now = now.replace(tzinfo=None)
        oldest_pending_seconds = max(
            0, int((comparable_now - oldest_pending).total_seconds())
        )
    else:
        oldest_pending_seconds = None
    storage_configured = (
        REPORT_ARTIFACT_STORAGE == "database"
        or bool(REPORT_ARTIFACT_S3_BUCKET)
    )
    degraded = (
        not storage_configured
        or stale_processing_jobs > 0
        or failed_jobs > 0
        or expired_jobs > 0
    )
    return ReportOperationsHealth(
        status="degraded" if degraded else "healthy",
        storage_backend=REPORT_ARTIFACT_STORAGE,
        external_storage_configured=storage_configured,
        queued_jobs=queued_jobs,
        processing_jobs=processing_jobs,
        stale_processing_jobs=stale_processing_jobs,
        failed_jobs_last_24h=failed_jobs,
        expired_artifacts_pending_cleanup=expired_jobs,
        oldest_pending_seconds=oldest_pending_seconds,
        checked_at=now,
    )


@router.post("/preview", response_model=ReportPreviewResponse)
def preview_report(
    request: ReportPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_date_range(request.from_date, request.to_date)
    _remove_expired_snapshots(db)
    organization_reports = {
        "consolidated_claims",
        "organization_attendance",
        "organization_expenses",
        "organization_clinical_activity",
        "organization_exceptions",
        "organization_performance",
    }
    attendance_report = request.report_type in {
        "organization_attendance",
        "my_attendance",
    }
    expense_report = request.report_type in {
        "organization_expenses",
        "my_expenses",
    }
    clinical_activity_report = request.report_type in {
        "organization_clinical_activity",
        "my_clinical_activity",
    }
    exception_report = request.report_type == "organization_exceptions"
    performance_report = request.report_type in {
        "organization_performance",
        "my_performance",
    }
    if request.report_type in organization_reports:
        if not role_has_permission(current_user.role, "dashboards.view"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization report permission is required.",
            )
        scope = "organization"
        role = request.role
        therapist_id = request.therapist_id
        doctor_id = request.doctor_id
    else:
        scope = "self"
        role, therapist_id, doctor_id = _self_scope(db, current_user)

    if performance_report:
        if request.status != "all":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Performance summaries do not support a status filter.",
            )
        rows = get_performance_rows(
            db,
            from_date=request.from_date,
            to_date=request.to_date,
            role=role,
            therapist_id=therapist_id,
            doctor_id=doctor_id,
            row_limit=EXPORT_ROW_LIMIT,
        )
        report_summary = summarize_performance(rows)
        total_amount = money(report_summary["total_claim_amount"])
        status_keys = ()
        status_index = None
        serialized_rows = serialize_performance_rows(rows)
    elif exception_report:
        if request.status not in (*EXCEPTION_STATUSES, "all"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Exception status is not supported for this report.",
            )
        rows = get_exception_rows(
            db,
            from_date=request.from_date,
            to_date=request.to_date,
            status=request.status,
            role=role,
            therapist_id=therapist_id,
            doctor_id=doctor_id,
            row_limit=EXPORT_ROW_LIMIT,
        )
        report_summary = summarize_exceptions(rows)
        total_amount = money(0)
        status_keys = EXCEPTION_STATUSES
        status_index = 5
        serialized_rows = serialize_exception_rows(rows)
    elif clinical_activity_report:
        if request.status not in (*CLINICAL_ACTIVITY_STATUSES, "all"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Clinical activity status is not supported for this "
                    "report."
                ),
            )
        rows = get_clinical_activity_rows(
            db,
            from_date=request.from_date,
            to_date=request.to_date,
            status=request.status,
            role=role,
            therapist_id=therapist_id,
            doctor_id=doctor_id,
            row_limit=EXPORT_ROW_LIMIT,
        )
        report_summary = summarize_clinical_activity(rows)
        total_amount = money(0)
        status_keys = CLINICAL_ACTIVITY_STATUSES
        status_index = 5
        serialized_rows = serialize_clinical_activity_rows(rows)
    elif expense_report:
        if request.status not in (*EXPENSE_STATUSES, "all"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Expense status must be all, draft, or submitted.",
            )
        rows = get_expense_export_rows(
            db,
            from_date=request.from_date,
            to_date=request.to_date,
            status=request.status,
            role=role,
            therapist_id=therapist_id,
            doctor_id=doctor_id,
            row_limit=EXPORT_ROW_LIMIT,
        )
        report_summary = summarize_expenses(rows)
        total_amount = money(report_summary["total_reimbursable_amount"])
        status_keys = EXPENSE_STATUSES
        status_index = 5
        serialized_rows = serialize_expense_rows(rows)
    elif attendance_report:
        if request.status not in (*ATTENDANCE_STATUSES, "all"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Attendance status must be all, active, completed, "
                    "or ended_early."
                ),
            )
        rows = get_attendance_export_rows(
            db,
            from_date=request.from_date,
            to_date=request.to_date,
            status=request.status,
            role=role,
            therapist_id=therapist_id,
            doctor_id=doctor_id,
            row_limit=EXPORT_ROW_LIMIT,
        )
        report_summary = summarize_attendance(rows)
        total_amount = money(0)
        status_keys = ATTENDANCE_STATUSES
        status_index = 4
        serialized_rows = serialize_attendance_rows(rows)
    else:
        if request.status not in ("all", "pending", "approved", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Claim status must be all, pending, approved, or rejected."
                ),
            )
        rows = get_claim_export_rows(
            db,
            from_date=request.from_date,
            to_date=request.to_date,
            status=request.status,
            role=role,
            therapist_id=therapist_id,
            doctor_id=doctor_id,
        )
        total_amount = money(sum(decimal_value(row[10]) for row in rows))
        status_keys = ("pending", "approved", "rejected")
        status_index = 5
        serialized_rows = serialize_claim_export_rows(rows)
        report_summary = {"total_claim_amount": float(total_amount)}
    if len(rows) > EXPORT_ROW_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"The preview exceeds {EXPORT_ROW_LIMIT:,} rows. "
                "Use a smaller date range."
            ),
        )
    warnings = []
    if not rows:
        warnings.append("No records match the selected filters.")
    status_counts = {key: 0 for key in status_keys}
    if status_index is not None:
        for row in rows[:EXPORT_ROW_LIMIT]:
            normalized_status = str(row[status_index]).lower()
            status_counts[normalized_status] = (
                status_counts.get(normalized_status, 0) + 1
            )

    snapshot_at = india_now()
    expires_at = snapshot_at + timedelta(hours=24)
    report_summary.update(status_counts)
    applied_filters = {
        "from_date": (
            request.from_date.isoformat() if request.from_date else None
        ),
        "to_date": request.to_date.isoformat() if request.to_date else None,
        "status": request.status,
        "role": role,
        "therapist_id": therapist_id,
        "doctor_id": doctor_id,
    }
    snapshot_id = str(uuid4())
    db.add(
        ReportSnapshot(
            id=snapshot_id,
            requested_by=current_user.id,
            report_type=request.report_type,
            scope=scope,
            filters=applied_filters,
            rows=serialized_rows,
            row_count=len(rows),
            total_amount=total_amount,
            summary=report_summary,
            snapshot_at=snapshot_at,
            expires_at=expires_at,
        )
    )
    db.commit()

    return ReportPreviewResponse(
        report_type=request.report_type,
        scope=scope,
        snapshot_at=snapshot_at,
        snapshot_id=snapshot_id,
        expires_at=expires_at,
        row_count=len(rows),
        total_amount=float(total_amount),
        summary=report_summary,
        status_counts=status_counts,
        supported_formats=REPORT_FORMATS,
        applied_filters=applied_filters,
        warnings=warnings,
    )


@router.get(
    "/exports/history",
    response_model=list[ReportExportHistoryItem],
)
def get_export_history(
    history_scope: Literal["mine", "organization"] = Query(
        default="mine",
        alias="scope",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ReportExportAudit, User.username).join(
        User,
        User.id == ReportExportAudit.requested_by,
    )
    if history_scope == "organization":
        if not role_has_permission(current_user.role, "dashboards.view"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization report permission is required.",
            )
        query = query.filter(ReportExportAudit.scope == "organization")
    else:
        query = query.filter(
            ReportExportAudit.requested_by == current_user.id
        )
    records = (
        query.order_by(ReportExportAudit.last_downloaded_at.desc())
        .limit(limit)
        .all()
    )
    return [
        ReportExportHistoryItem(
            id=record.id,
            snapshot_id=record.snapshot_id,
            requester_id=record.requested_by,
            requester_name=requester_name,
            report_type=record.report_type,
            scope=record.scope,
            format=record.format,
            filters=record.filters or {},
            row_count=record.row_count,
            total_amount=float(record.total_amount),
            summary=record.summary or {},
            snapshot_at=record.snapshot_at,
            snapshot_expires_at=record.snapshot_expires_at,
            filename=record.filename,
            mime_type=record.mime_type,
            size_bytes=record.size_bytes,
            checksum_sha256=record.checksum_sha256,
            download_count=record.download_count,
            first_generated_at=record.first_generated_at,
            last_downloaded_at=record.last_downloaded_at,
        )
        for record, requester_name in records
    ]


@router.get(
    "/exports/events",
    response_model=list[ReportExportEventResponse],
)
def get_export_events(
    history_scope: Literal["mine", "organization"] = Query(
        default="mine",
        alias="scope",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ReportExportEvent, User.username).join(
        User,
        User.id == ReportExportEvent.requested_by,
    )
    if history_scope == "organization":
        if not role_has_permission(current_user.role, "dashboards.view"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization report permission is required.",
            )
        query = query.filter(ReportExportEvent.scope == "organization")
    else:
        query = query.filter(
            ReportExportEvent.requested_by == current_user.id
        )
    records = (
        query.order_by(ReportExportEvent.occurred_at.desc())
        .limit(limit)
        .all()
    )
    return [
        ReportExportEventResponse(
            id=record.id,
            requester_id=record.requested_by,
            requester_name=requester_name,
            snapshot_id=record.snapshot_id,
            export_job_id=record.export_job_id,
            report_type=record.report_type,
            scope=record.scope,
            format=record.format,
            event_type=record.event_type,
            outcome=record.outcome,
            error_code=record.error_code,
            details=record.details or {},
            occurred_at=record.occurred_at,
        )
        for record, requester_name in records
    ]


@router.post("/exports", response_model=ReportExportJobResponse)
def create_export_job(
    request: ReportExportJobRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(ReportExportJob)
        .filter(
            ReportExportJob.requested_by == current_user.id,
            ReportExportJob.idempotency_key == request.idempotency_key,
        )
        .first()
    )
    if existing is not None:
        if not _job_access_allowed(existing, current_user):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Export job not found.",
            )
        if (
            existing.snapshot_id != request.snapshot_id
            or existing.format != request.format
        ):
            _record_export_event(
                db,
                current_user=current_user,
                event_type="generation_failed",
                outcome="failure",
                job=existing,
                requested_snapshot_id=request.snapshot_id,
                export_format=request.format,
                error_code="idempotency_conflict",
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for another export.",
            )
        _record_export_event(
            db,
            current_user=current_user,
            event_type="generation_reused",
            outcome="success",
            job=existing,
            details={"row_count": existing.row_count},
        )
        if existing.status in {"queued", "processing"}:
            background_tasks.add_task(_process_queued_export_job, existing.id)
        return _job_response(existing)

    snapshot = _owned_snapshot(db, request.snapshot_id, current_user)
    if snapshot.row_count > REPORT_ASYNC_ROW_THRESHOLD:
        job = ReportExportJob(
            id=str(uuid4()),
            snapshot_id=snapshot.id,
            requested_by=current_user.id,
            report_type=snapshot.report_type,
            scope=snapshot.scope,
            format=request.format,
            status="queued",
            idempotency_key=request.idempotency_key,
            row_count=snapshot.row_count,
            total_amount=snapshot.total_amount,
            summary=snapshot.summary or {},
            expires_at=snapshot.expires_at,
        )
        db.add(job)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            job = (
                db.query(ReportExportJob)
                .filter(
                    ReportExportJob.requested_by == current_user.id,
                    ReportExportJob.idempotency_key == request.idempotency_key,
                )
                .one()
            )
            if job.snapshot_id != request.snapshot_id or job.format != request.format:
                _record_export_event(
                    db,
                    current_user=current_user,
                    event_type="generation_failed",
                    outcome="failure",
                    job=job,
                    requested_snapshot_id=request.snapshot_id,
                    export_format=request.format,
                    error_code="idempotency_conflict",
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key was already used for another export.",
                )
        db.refresh(job)
        _record_export_event(
            db,
            current_user=current_user,
            event_type="generation_queued",
            outcome="success",
            snapshot=snapshot,
            job=job,
            details={"row_count": job.row_count},
        )
        background_tasks.add_task(_process_queued_export_job, job.id)
        return _job_response(job)
    try:
        rendered = _snapshot_response(snapshot, request.format)
    except Exception:
        _record_export_event(
            db,
            current_user=current_user,
            event_type="generation_failed",
            outcome="failure",
            snapshot=snapshot,
            export_format=request.format,
            error_code="render_failed",
        )
        raise
    content = bytes(rendered.body)
    completed_at = datetime.now(timezone.utc)
    job = ReportExportJob(
        id=str(uuid4()),
        snapshot_id=snapshot.id,
        requested_by=current_user.id,
        report_type=snapshot.report_type,
        scope=snapshot.scope,
        format=request.format,
        status="completed",
        idempotency_key=request.idempotency_key,
        filename=_response_filename(rendered),
        mime_type=rendered.headers.get(
            "content-type",
            "application/octet-stream",
        ),
        size_bytes=len(content),
        checksum_sha256=sha256(content).hexdigest(),
        row_count=snapshot.row_count,
        total_amount=snapshot.total_amount,
        summary=snapshot.summary or {},
        artifact=content,
        completed_at=completed_at,
        expires_at=snapshot.expires_at,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        job = (
            db.query(ReportExportJob)
            .filter(
                ReportExportJob.requested_by == current_user.id,
                ReportExportJob.idempotency_key == request.idempotency_key,
            )
            .one()
        )
        if job.snapshot_id != request.snapshot_id or job.format != request.format:
            _record_export_event(
                db,
                current_user=current_user,
                event_type="generation_failed",
                outcome="failure",
                job=job,
                requested_snapshot_id=request.snapshot_id,
                export_format=request.format,
                error_code="idempotency_conflict",
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for another export.",
            )
    db.refresh(job)
    _record_export_event(
        db,
        current_user=current_user,
        event_type="generation_completed",
        outcome="success",
        snapshot=snapshot,
        job=job,
        details={
            "row_count": job.row_count,
            "size_bytes": job.size_bytes,
        },
    )
    return _job_response(job)


@router.get("/exports/{export_id}", response_model=ReportExportJobResponse)
def get_export_job(
    export_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.get(ReportExportJob, export_id)
    if job is None or not _job_access_allowed(job, current_user):
        raise HTTPException(status_code=404, detail="Export job not found.")
    if job.status in {"queued", "processing"}:
        background_tasks.add_task(_process_queued_export_job, job.id)
    return _job_response(job)


@router.get("/exports/{export_id}/download")
def download_report_snapshot(
    export_id: str,
    export_format: Literal["csv", "xlsx", "pdf"] = Query(
        default="pdf",
        alias="format",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    job = db.get(ReportExportJob, export_id)
    if job is not None:
        if not _job_access_allowed(job, current_user):
            raise HTTPException(status_code=404, detail="Export job not found.")
        job_state = _job_response(job)
        if job_state.status == "expired":
            _record_export_event(
                db,
                current_user=current_user,
                event_type="download_failed",
                outcome="failure",
                job=job,
                error_code="artifact_expired",
            )
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Export artifact has expired. Generate it again.",
            )
        if job.status != "completed" or not report_artifact_exists(job):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Export is not ready for download. Check its status and "
                    "retry when processing is complete."
                ),
            )
        try:
            artifact_content = read_report_artifact(job)
        except Exception:
            _record_export_event(
                db,
                current_user=current_user,
                event_type="download_failed",
                outcome="failure",
                job=job,
                error_code="artifact_unavailable",
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The report file is temporarily unavailable. Retry shortly.",
            )
        response = Response(
            content=artifact_content,
            headers={
                "Content-Type": job.mime_type,
                "Content-Disposition": f'attachment; filename="{job.filename}"',
                "X-Report-Snapshot-Id": job.snapshot_id,
                "X-Report-Row-Count": str(job.row_count),
                "X-Report-Job-Id": job.id,
                "Cache-Control": "private, no-store",
                "Pragma": "no-cache",
                "X-Content-Type-Options": "nosniff",
            },
        )
        snapshot = db.get(ReportSnapshot, job.snapshot_id)
        if snapshot is not None:
            _record_export_download(
                db,
                snapshot,
                job.format,
                response,
                current_user,
            )
        _record_export_event(
            db,
            current_user=current_user,
            event_type="download_succeeded",
            outcome="success",
            snapshot=snapshot,
            job=job,
            details={"size_bytes": job.size_bytes},
        )
        return response

    snapshot = _owned_snapshot(db, export_id, current_user)
    response = _snapshot_response(snapshot, export_format)
    _record_export_download(
        db,
        snapshot,
        export_format,
        response,
        current_user,
    )
    _record_export_event(
        db,
        current_user=current_user,
        event_type="download_succeeded",
        outcome="success",
        snapshot=snapshot,
        export_format=export_format,
        details={"size_bytes": len(bytes(response.body))},
    )
    return response


@router.get("/my-claims/export")
def export_my_claims(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    claim_status: Literal["all", "pending", "approved", "rejected"] = Query(
        default="all",
        alias="status",
    ),
    export_format: Literal["csv", "xlsx", "pdf"] = Query(
        default="pdf",
        alias="format",
    ),
    snapshot_id: str | None = Query(default=None, min_length=36, max_length=36),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    _validate_date_range(from_date, to_date)
    role, therapist_id, doctor_id = _self_scope(db, current_user)
    if snapshot_id is not None:
        snapshot = _owned_snapshot(db, snapshot_id, current_user)
        if snapshot.report_type != "my_claims" or snapshot.scope != "self":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report snapshot not found.",
            )
        response = _snapshot_response(snapshot, export_format)
        _record_export_download(
            db,
            snapshot,
            export_format,
            response,
            current_user,
        )
        return response

    response = export_claim_register(
        from_date=from_date,
        to_date=to_date,
        status=claim_status,
        role=role,
        therapist_id=therapist_id,
        doctor_id=doctor_id,
        export_format=export_format,
        db=db,
        current_user=current_user,
    )
    filename = f"my-claims-{role}-{india_now():%Y-%m-%d-%H%M%S}-IST.{export_format}"
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{filename}"'
    )
    response.headers["X-Report-Scope"] = "self"
    return response


def _resolve_travel_expense_scope(
    db: Session,
    current_user: User,
    person_type: str | None,
    person_id: str | None,
) -> tuple[str, int | None, Literal["individual", "all"], str | None]:
    """Authorization for the travel expense report: admins may pick anyone,
    a therapist/doctor may only ever see their own data regardless of what
    person_type/person_id they pass."""
    if role_has_permission(current_user.role, "dashboards.view"):
        if person_type not in ("therapist", "doctor"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="person_type must be 'therapist' or 'doctor'.",
            )
        if not person_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="person_id is required (an id, or 'all').",
            )
        if person_id == "all":
            return person_type, None, "all", None
        try:
            numeric_id = int(person_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="person_id must be an integer or 'all'.",
            )
        if person_type == "therapist":
            person = (
                db.query(User)
                .filter(User.id == numeric_id, User.role == "therapist")
                .first()
            )
            name = person.username if person else None
        else:
            person = db.query(Doctor).filter(Doctor.id == numeric_id).first()
            name = person.name if person else None
        if person is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Person not found.",
            )
        return person_type, numeric_id, "individual", name

    if current_user.role == "therapist":
        return "therapist", current_user.id, "individual", current_user.username
    if current_user.role == "doctor":
        doctor = (
            db.query(Doctor)
            .filter(Doctor.user_id == current_user.id)
            .first()
        )
        if doctor is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctor profile is not linked to this user.",
            )
        return "doctor", doctor.id, "individual", doctor.name

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Travel expense reports are not available for this role.",
    )


def _load_travel_expense_report(
    db: Session,
    current_user: User,
    *,
    person_type: str | None,
    person_id: str | None,
    month: str | None,
    from_date: date | None,
    to_date: date | None,
) -> dict:
    resolved_type, resolved_id, scope, person_name = _resolve_travel_expense_scope(
        db, current_user, person_type, person_id
    )
    period_start, period_end = resolve_report_period(month, from_date, to_date)
    return build_travel_expense_report(
        db,
        person_type=resolved_type,
        scope=scope,
        person_id=resolved_id,
        person_name=person_name,
        start_date=period_start,
        end_date=period_end,
    )


@router.get("/travel-expense", response_model=TravelExpenseReportResponse)
def get_travel_expense_report(
    person_type: str | None = Query(default=None),
    person_id: str | None = Query(default=None),
    month: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _load_travel_expense_report(
        db,
        current_user,
        person_type=person_type,
        person_id=person_id,
        month=month,
        from_date=start_date,
        to_date=end_date,
    )


def _travel_expense_export(
    export_format: Literal["csv", "xlsx", "pdf"],
    person_type: str | None,
    person_id: str | None,
    month: str | None,
    start_date: date | None,
    end_date: date | None,
    db: Session,
    current_user: User,
) -> Response:
    report = _load_travel_expense_report(
        db,
        current_user,
        person_type=person_type,
        person_id=person_id,
        month=month,
        from_date=start_date,
        to_date=end_date,
    )
    return build_travel_expense_export_response(report, export_format)


@router.get("/travel-expense/pdf")
def export_travel_expense_pdf(
    person_type: str | None = Query(default=None),
    person_id: str | None = Query(default=None),
    month: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    return _travel_expense_export(
        "pdf", person_type, person_id, month, start_date, end_date, db, current_user
    )


@router.get("/travel-expense/excel")
def export_travel_expense_excel(
    person_type: str | None = Query(default=None),
    person_id: str | None = Query(default=None),
    month: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    return _travel_expense_export(
        "xlsx", person_type, person_id, month, start_date, end_date, db, current_user
    )


@router.get("/travel-expense/csv")
def export_travel_expense_csv(
    person_type: str | None = Query(default=None),
    person_id: str | None = Query(default=None),
    month: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    return _travel_expense_export(
        "csv", person_type, person_id, month, start_date, end_date, db, current_user
    )
