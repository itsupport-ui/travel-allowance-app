from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


ReportFormat = Literal["pdf", "xlsx", "csv"]
ReportType = Literal[
    "consolidated_claims",
    "my_claims",
    "organization_attendance",
    "my_attendance",
    "organization_expenses",
    "my_expenses",
    "organization_clinical_activity",
    "my_clinical_activity",
    "organization_exceptions",
    "organization_performance",
    "my_performance",
]


class ReportDefinition(BaseModel):
    report_type: ReportType
    title: str
    description: str
    scope: Literal["organization", "self"]
    formats: list[ReportFormat]
    filters: list[str]
    privacy_note: str


class ReportPreviewRequest(BaseModel):
    report_type: ReportType
    from_date: date | None = None
    to_date: date | None = None
    status: Literal[
        "all",
        "pending",
        "approved",
        "rejected",
        "active",
        "completed",
        "ended_early",
        "draft",
        "submitted",
        "scheduled",
        "in_progress",
        "missed",
        "cancelled",
        "open",
        "needs_review",
        "needs_correction",
        "manual",
    ] = "all"
    role: Literal["all", "therapist", "doctor"] = "all"
    therapist_id: int | None = Field(default=None, ge=1)
    doctor_id: int | None = Field(default=None, ge=1)


class ReportPreviewResponse(BaseModel):
    report_type: ReportType
    scope: Literal["organization", "self"]
    snapshot_at: datetime
    snapshot_id: str
    expires_at: datetime
    timezone: str = "Asia/Kolkata"
    row_count: int
    total_amount: float
    summary: dict[str, int | float | str] = Field(default_factory=dict)
    status_counts: dict[str, int]
    supported_formats: list[ReportFormat]
    applied_filters: dict[str, str | int | None]
    warnings: list[str] = Field(default_factory=list)


class ReportExportHistoryItem(BaseModel):
    id: str
    snapshot_id: str
    requester_id: int
    requester_name: str
    report_type: ReportType
    scope: Literal["organization", "self"]
    format: ReportFormat
    filters: dict[str, str | int | None]
    row_count: int
    total_amount: float
    summary: dict[str, int | float | str] = Field(default_factory=dict)
    snapshot_at: datetime
    snapshot_expires_at: datetime
    filename: str
    mime_type: str
    size_bytes: int
    checksum_sha256: str
    download_count: int
    first_generated_at: datetime
    last_downloaded_at: datetime


class ReportExportJobRequest(BaseModel):
    snapshot_id: str = Field(min_length=36, max_length=36)
    format: ReportFormat
    idempotency_key: str = Field(min_length=8, max_length=128)


class ReportExportJobResponse(BaseModel):
    id: str
    snapshot_id: str
    report_type: ReportType
    scope: Literal["organization", "self"]
    format: ReportFormat
    status: Literal["completed", "expired", "failed", "processing", "queued"]
    filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    checksum_sha256: str | None = None
    row_count: int
    total_amount: float
    summary: dict[str, int | float | str] = Field(default_factory=dict)
    created_at: datetime
    completed_at: datetime | None = None
    attempt_count: int = 0
    error_code: str | None = None
    expires_at: datetime
    download_url: str | None = None


class ReportExportEventResponse(BaseModel):
    id: str
    requester_id: int
    requester_name: str
    snapshot_id: str | None = None
    export_job_id: str | None = None
    report_type: ReportType | None = None
    scope: Literal["organization", "self"] | None = None
    format: ReportFormat | None = None
    event_type: Literal[
        "generation_completed",
        "generation_queued",
        "generation_reused",
        "generation_failed",
        "download_succeeded",
        "download_failed",
    ]
    outcome: Literal["success", "failure"]
    error_code: str | None = None
    details: dict[str, int | float | str] = Field(default_factory=dict)
    occurred_at: datetime


class ReportOperationsHealth(BaseModel):
    status: Literal["healthy", "degraded"]
    storage_backend: Literal["database", "s3"]
    external_storage_configured: bool
    queued_jobs: int
    processing_jobs: int
    stale_processing_jobs: int
    failed_jobs_last_24h: int
    expired_artifacts_pending_cleanup: int
    oldest_pending_seconds: int | None = None
    checked_at: datetime
