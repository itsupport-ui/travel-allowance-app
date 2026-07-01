import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type { AdminDashboardSummary } from "../types/adminDashboard";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

export class AdminDashboardServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AdminDashboardServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new AdminDashboardServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const normalizeError = (error: unknown): AdminDashboardServiceError => {
  if (error instanceof AdminDashboardServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new AdminDashboardServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;

    if (error.response.status === 401) {
      return new AdminDashboardServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new AdminDashboardServiceError(
        "You do not have permission to view the admin dashboard.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new AdminDashboardServiceError(
        body.detail,
        error.response.status
      );
    }

    return new AdminDashboardServiceError(
      "Unable to load the admin dashboard.",
      error.response.status
    );
  }

  if (error instanceof Error) {
    return new AdminDashboardServiceError(error.message);
  }

  return new AdminDashboardServiceError(
    "Unable to load the admin dashboard."
  );
};

export const getAdminDashboardSummary =
  async (): Promise<AdminDashboardSummary> => {
    try {
      const response = await api.get<AdminDashboardSummary>(
        "/admin-dashboard/summary",
        {
          headers: await getAuthHeaders(),
        }
      );

      return response.data;
    } catch (error) {
      throw normalizeError(error);
    }
  };
