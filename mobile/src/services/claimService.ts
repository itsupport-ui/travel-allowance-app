import { AxiosError, type AxiosResponse } from "axios";

import { api } from "../api/apiClient";
import type {
  ClaimDetailsResponse,
  ClaimResponse,
} from "../types/claim";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

export class ClaimServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ClaimServiceError";
  }
}

const normalizeClaimError = (
  error: unknown,
  fallback: string
): ClaimServiceError => {
  if (error instanceof ClaimServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new ClaimServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;

    if (typeof body?.detail === "string") {
      return new ClaimServiceError(body.detail, error.response.status);
    }

    if (error.response.status === 401) {
      return new ClaimServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    return new ClaimServiceError(fallback, error.response.status);
  }

  if (error instanceof Error) {
    return new ClaimServiceError(error.message);
  }

  return new ClaimServiceError(fallback);
};

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new ClaimServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const executeClaimRequest = async <T>(
  request: () => Promise<AxiosResponse<T>>,
  fallback: string
): Promise<T> => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    throw normalizeClaimError(error, fallback);
  }
};

export const submitTodayClaim = async (): Promise<ClaimResponse> =>
  executeClaimRequest(
    async () =>
      api.post<ClaimResponse>("/claims/submit", undefined, {
        headers: await getAuthHeaders(),
      }),
    "Unable to submit today's claim."
  );

export const getMyClaims = async (): Promise<ClaimResponse[]> =>
  executeClaimRequest(
    async () =>
      api.get<ClaimResponse[]>("/claims/my", {
        headers: await getAuthHeaders(),
      }),
    "Unable to load claims."
  );

export const getClaimDetails = async (
  claimId: number
): Promise<ClaimDetailsResponse> =>
  executeClaimRequest(
    async () =>
      api.get<ClaimDetailsResponse>(`/claims/${claimId}/details`, {
        headers: await getAuthHeaders(),
      }),
    "Unable to load claim details."
  );
