import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type {
  AdminReportFilters,
  AdminReportSummary,
  ReportActivityType,
  ReportClaimStatus,
  ReportInsightDirection,
} from "../types/adminReport";
import type { ClaimResponse } from "../types/claim";
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

const dateMatchesFilters = (
  date: string,
  filters: AdminReportFilters
): boolean =>
  (!filters.fromDate || date >= filters.fromDate) &&
  (!filters.toDate || date <= filters.toDate);

const filterClaims = (
  claims: ClaimResponse[],
  filters: AdminReportFilters
): ClaimResponse[] =>
  claims.filter((claim) => {
    const matchesDate = dateMatchesFilters(
      claim.claim_date,
      filters
    );
    const matchesStatus =
      filters.status === "all" ||
      claim.status.toLocaleLowerCase() === filters.status;
    const matchesTherapist =
      filters.therapistName === null ||
      claim.therapist_name?.toLocaleLowerCase() ===
        filters.therapistName.toLocaleLowerCase();

    return matchesDate && matchesStatus && matchesTherapist;
  });

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

export const getAdminReportClaims = async (
  filters: AdminReportFilters
): Promise<ClaimResponse[]> => {
  try {
    const headers = await getAuthHeaders();
    const response = await api.get<ClaimResponse[]>("/claims/all", {
      headers,
    });

    return filterClaims(response.data, filters);
  } catch (error) {
    throw normalizeError(error);
  }
};
