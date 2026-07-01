import { api } from "../api/apiClient";
import type { TherapistDashboardSummary } from "../types/dashboard";

export const getTherapistDashboardSummary =
  async (): Promise<TherapistDashboardSummary> => {
    const response = await api.get<TherapistDashboardSummary>(
      "/dashboard/summary"
    );

    return response.data;
  };
