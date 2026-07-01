import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type { AdminDashboardSummary } from "../types/adminDashboard";
import type {
  AdminReportFilters,
  AdminReportSummary,
} from "../types/adminReport";
import type { ClaimResponse } from "../types/claim";
import type { ScheduleResponse } from "../types/schedule";
import type { TravelResponse } from "../types/travel";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
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

    const body = error.response.data as ApiErrorBody | undefined;

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

const getLocalDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const scheduleMatchesDateRange = (
  schedule: ScheduleResponse,
  filters: AdminReportFilters
): boolean => {
  if (!filters.fromDate && !filters.toDate) {
    return true;
  }

  if (schedule.schedule_type === "one_time") {
    return Boolean(
      schedule.treatment_date &&
        dateMatchesFilters(schedule.treatment_date, filters)
    );
  }

  if (!schedule.start_date || !schedule.end_date) {
    return false;
  }

  return (
    (!filters.toDate || schedule.start_date <= filters.toDate) &&
    (!filters.fromDate || schedule.end_date >= filters.fromDate)
  );
};

const scheduleOccursOn = (
  schedule: ScheduleResponse,
  date: string
): boolean => {
  if (schedule.schedule_type === "one_time") {
    return schedule.treatment_date === date;
  }

  return Boolean(
    schedule.start_date &&
      schedule.end_date &&
      schedule.start_date <= date &&
      schedule.end_date >= date
  );
};

export const getAdminReportSummary =
  async (
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
      const [
        dashboardResponse,
        travelsResponse,
        claimsResponse,
        schedulesResponse,
      ] = await Promise.all([
          api.get<AdminDashboardSummary>("/admin-dashboard/summary", {
            headers,
          }),
          api.get<TravelResponse[]>("/travel/all", { headers }),
          api.get<ClaimResponse[]>("/claims/all", { headers }),
          api.get<ScheduleResponse[]>("/schedule/all", { headers }),
        ]);

      const filteredSchedules = schedulesResponse.data.filter(
        (schedule) =>
          (filters.therapistId === null ||
            schedule.therapist_id === filters.therapistId) &&
          scheduleMatchesDateRange(schedule, filters)
      );
      const schedulesById = new Map(
        schedulesResponse.data.map((schedule) => [
          schedule.id,
          schedule,
        ])
      );
      const filteredTravels = travelsResponse.data.filter((travel) => {
        const matchesDate = dateMatchesFilters(
          travel.travel_date,
          filters
        );

        if (!matchesDate) {
          return false;
        }

        if (filters.therapistId === null) {
          return true;
        }

        if (travel.schedule_id === null) {
          return false;
        }

        return (
          schedulesById.get(travel.schedule_id)?.therapist_id ===
          filters.therapistId
        );
      });
      const filteredClaims = filterClaims(
        claimsResponse.data,
        filters
      );
      const totalKm = filteredTravels.reduce(
        (total, travel) => total + travel.total_km,
        0
      );
      const hasTreatmentFilters = Boolean(
        filters.fromDate ||
          filters.toDate ||
          filters.therapistId !== null
      );
      const today = getLocalDateKey();

      return {
        todaysTreatments: hasTreatmentFilters
          ? filteredSchedules.filter(
              (schedule) =>
                schedule.status === "scheduled" &&
                scheduleOccursOn(schedule, today)
            ).length
          : dashboardResponse.data.todays_schedules,
        totalKm,
        totalClaims: filteredClaims.length,
        pendingClaims: filteredClaims.filter(
          (claim) => claim.status.toLocaleLowerCase() === "pending"
        ).length,
        completedTreatments: hasTreatmentFilters
          ? filteredSchedules.filter(
              (schedule) => schedule.status === "completed"
            ).length
          : dashboardResponse.data.completed_treatments,
      };
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
