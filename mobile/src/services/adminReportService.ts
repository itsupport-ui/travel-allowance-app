import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import { waitForReportExportJob } from "./reportExportJob";
import type {
  AdminReportFilters,
  AdminReportSummary,
  ReportActivityType,
  ReportClaimStatus,
  ReportInsightDirection,
} from "../types/adminReport";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === "object" && value !== null && "detail" in value;

interface AdminReportOverviewResponse {
  generated_at: string;
  period_label: string;
  trend_period_label: string;
  has_data: boolean;
  kpis: {
    todays_treatments: number;
    completed_treatments: number;
    cancelled_treatments: number;
    patients_visited: number;
    total_claims: number;
    pending_claims: number;
    approved_claims: number;
    rejected_claims: number;
    total_km: number;
    total_travel_amount: number;
    average_km_per_therapist: number;
    active_therapists: number;
    top_performing_therapist: string | null;
  };
  trends: {
    date: string;
    completed_treatments: number;
    total_km: number;
    travel_amount: number;
  }[];
  claims_by_status: {
    status: Exclude<ReportClaimStatus, "all">;
    count: number;
  }[];
  top_therapists: {
    therapist_id: number;
    therapist_name: string;
    completed_treatments: number;
    total_km: number;
    claims_submitted: number;
  }[];
  recent_activity: {
    id: string;
    activity_type: ReportActivityType;
    therapist_name: string;
    occurred_at: string;
    status: string;
    amount: number | null;
    description: string;
  }[];
  insights: {
    key: string;
    title: string;
    value: string;
    detail: string;
    direction: ReportInsightDirection;
    change_percent: number | null;
  }[];
}

export class AdminReportServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AdminReportServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new AdminReportServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const normalizeError = (error: unknown): AdminReportServiceError => {
  if (error instanceof AdminReportServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new AdminReportServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = isApiErrorBody(error.response.data)
      ? error.response.data
      : undefined;

    if (error.response.status === 401) {
      return new AdminReportServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new AdminReportServiceError(
        "You do not have permission to view reports.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new AdminReportServiceError(
        body.detail,
        error.response.status
      );
    }

    return new AdminReportServiceError(
      "Unable to load report metrics.",
      error.response.status
    );
  }

  if (error instanceof Error) {
    return new AdminReportServiceError(error.message);
  }

  return new AdminReportServiceError("Unable to load report metrics.");
};

const normalizeOverview = (
  response: AdminReportOverviewResponse
): AdminReportSummary => ({
  todaysTreatments: response.kpis.todays_treatments,
  completedTreatments: response.kpis.completed_treatments,
  cancelledTreatments: response.kpis.cancelled_treatments,
  patientsVisited: response.kpis.patients_visited,
  totalClaims: response.kpis.total_claims,
  pendingClaims: response.kpis.pending_claims,
  approvedClaims: response.kpis.approved_claims,
  rejectedClaims: response.kpis.rejected_claims,
  totalKm: response.kpis.total_km,
  totalTravelAmount: response.kpis.total_travel_amount,
  averageKmPerTherapist:
    response.kpis.average_km_per_therapist,
  activeTherapists: response.kpis.active_therapists,
  topPerformingTherapist:
    response.kpis.top_performing_therapist,
  generatedAt: response.generated_at,
  periodLabel: response.period_label,
  trendPeriodLabel: response.trend_period_label,
  hasData: response.has_data,
  trends: response.trends.map((point) => ({
    date: point.date,
    completedTreatments: point.completed_treatments,
    totalKm: point.total_km,
    travelAmount: point.travel_amount,
  })),
  claimsByStatus: response.claims_by_status,
  topTherapists: response.top_therapists.map((therapist) => ({
    therapistId: therapist.therapist_id,
    therapistName: therapist.therapist_name,
    completedTreatments: therapist.completed_treatments,
    totalKm: therapist.total_km,
    claimsSubmitted: therapist.claims_submitted,
  })),
  recentActivity: response.recent_activity.map((activity) => ({
    id: activity.id,
    activityType: activity.activity_type,
    therapistName: activity.therapist_name,
    occurredAt: activity.occurred_at,
    status: activity.status,
    amount: activity.amount,
    description: activity.description,
  })),
  insights: response.insights.map((insight) => ({
    key: insight.key,
    title: insight.title,
    value: insight.value,
    detail: insight.detail,
    direction: insight.direction,
    changePercent: insight.change_percent,
  })),
});

export const getAdminReportSummary = async (
  filters: AdminReportFilters = {
    fromDate: null,
    status: "all",
    therapistId: null,
    therapistName: null,
    toDate: null,
  }
): Promise<AdminReportSummary> => {
  try {
    const headers = await getAuthHeaders();
    const response = await api.get<AdminReportOverviewResponse>(
      "/admin-reports/overview",
      {
        headers,
        params: {
          from_date: filters.fromDate ?? undefined,
          status:
            filters.status === "all" ? undefined : filters.status,
          therapist_id: filters.therapistId ?? undefined,
          to_date: filters.toDate ?? undefined,
        },
      }
    );

    return normalizeOverview(response.data);
  } catch (error) {
    throw normalizeError(error);
  }
};

export interface AdminClaimRegisterDownload {
  content: Uint8Array;
  fileName: string;
  mimeType: string;
  rowCount: number;
}

interface AdminClaimRegisterPreviewResponse {
  expires_at: string;
  row_count: number;
  snapshot_id: string;
  total_amount: number;
  summary: Record<string, number | string>;
  warnings: string[];
}

interface ReportExportJobResponse {
  id: string;
  status: "completed" | "expired" | "failed" | "processing" | "queued";
  download_url: string | null;
}

export interface AdminClaimRegisterPreview {
  expiresAt: string;
  rowCount: number;
  snapshotId: string;
  totalAmount: number;
  summary: Record<string, number | string>;
  warnings: string[];
}

export interface AdminReportExportHistoryItem {
  id: string;
  snapshot_id: string;
  report_type:
    | "consolidated_claims"
    | "organization_attendance"
    | "organization_expenses"
    | "organization_clinical_activity"
    | "organization_exceptions"
    | "organization_performance";
  requester_name: string;
  format: "csv" | "xlsx" | "pdf";
  row_count: number;
  total_amount: number;
  summary: Record<string, number | string>;
  snapshot_expires_at: string;
  filename: string;
  size_bytes: number;
  checksum_sha256: string;
  download_count: number;
  last_downloaded_at: string;
}

export interface AdminReportExportEvent {
  id: string;
  requester_name: string;
  snapshot_id: string | null;
  export_job_id: string | null;
  report_type: AdminReportExportHistoryItem["report_type"] | null;
  scope: "organization" | "self" | null;
  format: "csv" | "xlsx" | "pdf" | null;
  event_type:
    | "generation_completed"
    | "generation_queued"
    | "generation_reused"
    | "generation_failed"
    | "download_succeeded"
    | "download_failed";
  outcome: "success" | "failure";
  error_code: string | null;
  occurred_at: string;
}

export interface ReportOperationsHealth {
  status: "healthy" | "degraded";
  storage_backend: "database" | "s3";
  external_storage_configured: boolean;
  queued_jobs: number;
  processing_jobs: number;
  stale_processing_jobs: number;
  failed_jobs_last_24h: number;
  expired_artifacts_pending_cleanup: number;
  oldest_pending_seconds: number | null;
  checked_at: string;
}

export const getReportOperationsHealth = async (): Promise<ReportOperationsHealth> => {
  try {
    const headers = await getAuthHeaders();
    const response = await api.get<ReportOperationsHealth>(
      "/reports/operations/health",
      { headers }
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
};

export const getAdminReportExportHistory = async (): Promise<
  AdminReportExportHistoryItem[]
> => {
  try {
    const headers = await getAuthHeaders();
    const response = await api.get<AdminReportExportHistoryItem[]>(
      "/reports/exports/history",
      { headers, params: { limit: 8, scope: "organization" } }
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
};

export const getAdminReportExportEvents = async (): Promise<
  AdminReportExportEvent[]
> => {
  try {
    const headers = await getAuthHeaders();
    const response = await api.get<AdminReportExportEvent[]>(
      "/reports/exports/events",
      { headers, params: { limit: 20, scope: "organization" } }
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
};

export const previewAdminClaimRegister = async (
  filters: AdminReportFilters,
  reportType:
    | "consolidated_claims"
    | "organization_attendance"
    | "organization_expenses"
    | "organization_clinical_activity"
    | "organization_exceptions"
    | "organization_performance" = "consolidated_claims",
  exportStatus:
    | "all"
    | "pending"
    | "approved"
    | "rejected"
    | "active"
    | "completed"
    | "ended_early"
    | "draft"
    | "submitted"
    | "scheduled"
    | "in_progress"
    | "missed"
    | "cancelled"
    | "open"
    | "needs_review"
    | "needs_correction"
    | "manual" = filters.status,
  exportRole: "all" | "therapist" | "doctor" = "all",
  exportStaffId: number | null = null
): Promise<AdminClaimRegisterPreview> => {
  try {
    const headers = await getAuthHeaders();
    const response = await api.post<AdminClaimRegisterPreviewResponse>(
      "/reports/preview",
      {
        doctor_id: exportRole === "doctor" ? exportStaffId : null,
        from_date: filters.fromDate,
        report_type: reportType,
        role: exportRole,
        status: exportStatus,
        therapist_id:
          exportRole === "therapist" ? exportStaffId : null,
        to_date: filters.toDate,
      },
      { headers }
    );
    return {
      expiresAt: response.data.expires_at,
      rowCount: response.data.row_count,
      snapshotId: response.data.snapshot_id,
      totalAmount: response.data.total_amount,
      summary: response.data.summary,
      warnings: response.data.warnings,
    };
  } catch (error) {
    throw normalizeError(error);
  }
};

export const downloadAdminClaimRegister = async (
  snapshotId: string,
  format: "csv" | "xlsx" | "pdf" = "csv"
): Promise<AdminClaimRegisterDownload> => {
  try {
    const headers = await getAuthHeaders();
    const job = await api.post<ReportExportJobResponse>(
      "/reports/exports",
      {
        format,
        idempotency_key: `${snapshotId}:${format}`,
        snapshot_id: snapshotId,
      },
      { headers }
    );
    const readyJob = await waitForReportExportJob(api, job.data, { headers });
    const response = await api.get<ArrayBuffer>(
      readyJob.download_url,
      {
        headers,
        responseType: "arraybuffer",
      }
    );
    const disposition = String(response.headers["content-disposition"] ?? "");
    const fileName =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
      `claim-register.${format}`;
    return {
      content: new Uint8Array(response.data),
      fileName,
      mimeType: String(response.headers["content-type"] ?? "application/octet-stream"),
      rowCount: Number(response.headers["x-report-row-count"] ?? 0),
    };
  } catch (error) {
    throw normalizeError(error);
  }
};
