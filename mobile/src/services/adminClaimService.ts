import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type { ClaimResponse } from "../types/claim";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

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

    const body = error.response.data as ApiErrorBody | undefined;

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
