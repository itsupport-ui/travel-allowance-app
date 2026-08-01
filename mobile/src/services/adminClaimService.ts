import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type {
  AdminClaimReviewFilters,
  AdminClaimReviewPage,
  AdminClaimSort,
  AdminClaimStatus,
} from "../types/adminClaimReview";
import type { ClaimResponse } from "../types/claim";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

interface AdminClaimReviewResponse {
  items: {
    id: number;
    therapist_id: number;
    therapist_name: string;
    therapist_role: string;
    claim_date: string;
    submitted_at: string | null;
    status: string;
    patient_name: string | null;
    patient_count: number;
    visited_count: number;
    travel_date: string | null;
    from_address: string | null;
    to_address: string | null;
    total_km: number;
    per_km_rate: number;
    travel_total: number;
    daily_allowance: number;
    grand_total: number;
    notes: string | null;
    is_high_value: boolean;
    is_urgent: boolean;
    age_days: number;
  }[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  high_value_threshold: number;
  summary: {
    pending_claims: number;
    todays_claims: number;
    pending_amount: number;
    high_value_claims: number;
    average_claim_amount: number;
    average_distance: number;
  };
}

const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === "object" && value !== null && "detail" in value;

export class AdminClaimServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AdminClaimServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new AdminClaimServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const normalizeError = (
  error: unknown,
  fallback: string
): AdminClaimServiceError => {
  if (error instanceof AdminClaimServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new AdminClaimServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = isApiErrorBody(error.response.data)
      ? error.response.data
      : undefined;

    if (error.response.status === 401) {
      return new AdminClaimServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new AdminClaimServiceError(
        "You do not have permission to manage claims.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new AdminClaimServiceError(
        body.detail,
        error.response.status
      );
    }

    return new AdminClaimServiceError(fallback, error.response.status);
  }

  if (error instanceof Error) {
    return new AdminClaimServiceError(error.message);
  }

  return new AdminClaimServiceError(fallback);
};

const executeRequest = async <T>(
  request: () => Promise<{ data: T }>,
  fallback: string
): Promise<T> => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    throw normalizeError(error, fallback);
  }
};

export const getPendingAdminClaims = async (): Promise<ClaimResponse[]> => {
  const claims = await executeRequest(
    async () =>
      api.get<ClaimResponse[]>("/claims/pending", {
        headers: await getAuthHeaders(),
      }),
    "Unable to load pending claims."
  );

  return [...claims].sort((first, second) => {
    const dateComparison = second.claim_date.localeCompare(
      first.claim_date
    );
    return dateComparison || second.id - first.id;
  });
};

export const createEmptyAdminClaimFilters =
  (): AdminClaimReviewFilters => ({
    status: "pending",
    therapistId: null,
    therapistName: null,
    fromDate: null,
    toDate: null,
    minimumAmount: null,
    maximumAmount: null,
    minimumDistance: null,
    maximumDistance: null,
    search: "",
    sort: "newest",
  });

export const getAdminClaimReview = async (
  filters: AdminClaimReviewFilters,
  page: number,
  pageSize = 20
): Promise<AdminClaimReviewPage> => {
  const response = await executeRequest(
    async () =>
      api.get<AdminClaimReviewResponse>("/admin-claims/review", {
        headers: await getAuthHeaders(),
        params: {
          from_date: filters.fromDate ?? undefined,
          maximum_amount: filters.maximumAmount ?? undefined,
          maximum_distance: filters.maximumDistance ?? undefined,
          minimum_amount: filters.minimumAmount ?? undefined,
          minimum_distance: filters.minimumDistance ?? undefined,
          page,
          page_size: pageSize,
          search: filters.search.trim() || undefined,
          sort: filters.sort,
          status: filters.status,
          therapist_id: filters.therapistId ?? undefined,
          to_date: filters.toDate ?? undefined,
        },
      }),
    "Unable to load claims for review."
  );

  return {
    items: response.items.map((item) => ({
      id: item.id,
      therapistId: item.therapist_id,
      therapistName: item.therapist_name,
      therapistRole: item.therapist_role,
      claimDate: item.claim_date,
      submittedAt: item.submitted_at,
      status: item.status,
      patientName: item.patient_name,
      patientCount: item.patient_count,
      visitedCount: item.visited_count,
      travelDate: item.travel_date,
      fromAddress: item.from_address,
      toAddress: item.to_address,
      totalKm: item.total_km,
      perKmRate: item.per_km_rate,
      travelTotal: item.travel_total,
      dailyAllowance: item.daily_allowance,
      grandTotal: item.grand_total,
      notes: item.notes,
      isHighValue: item.is_high_value,
      isUrgent: item.is_urgent,
      ageDays: item.age_days,
    })),
    page: response.page,
    pageSize: response.page_size,
    total: response.total,
    totalPages: response.total_pages,
    highValueThreshold: response.high_value_threshold,
    summary: {
      pendingClaims: response.summary.pending_claims,
      todaysClaims: response.summary.todays_claims,
      pendingAmount: response.summary.pending_amount,
      highValueClaims: response.summary.high_value_claims,
      averageClaimAmount: response.summary.average_claim_amount,
      averageDistance: response.summary.average_distance,
    },
  };
};

export const adminClaimStatusOptions: {
  label: string;
  value: AdminClaimStatus;
}[] = [
  { label: "Pending", value: "pending" },
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export const adminClaimSortOptions: {
  label: string;
  value: AdminClaimSort;
}[] = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Highest Amount", value: "highest_amount" },
  { label: "Lowest Amount", value: "lowest_amount" },
  { label: "Longest Distance", value: "longest_distance" },
  { label: "Therapist Name", value: "therapist_name" },
];

export const approveAdminClaim = async (
  claimId: number
): Promise<ClaimResponse> =>
  executeRequest(
    async () =>
      api.put<ClaimResponse>(
        `/claims/${claimId}/approve`,
        undefined,
        {
          headers: await getAuthHeaders(),
        }
      ),
    "Unable to approve the claim."
  );

export const rejectAdminClaim = async (
  claimId: number
): Promise<ClaimResponse> =>
  executeRequest(
    async () =>
      api.put<ClaimResponse>(
        `/claims/${claimId}/reject`,
        undefined,
        {
          headers: await getAuthHeaders(),
        }
      ),
    "Unable to reject the claim."
  );
