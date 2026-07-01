import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type { AdminScheduleData } from "../types/adminSchedule";
import type { Schedule } from "../types/schedule";
import type { TherapistResponse } from "../types/therapist";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

export class AdminScheduleServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AdminScheduleServiceError";
  }
}

const getLocalDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isFutureSchedule = (
  schedule: Schedule,
  todayIds: Set<number>
): boolean => {
  if (todayIds.has(schedule.id)) {
    return false;
  }

  const today = getLocalDateKey();

  if (schedule.schedule_type === "one_time") {
    return Boolean(
      schedule.treatment_date && schedule.treatment_date > today
    );
  }

  return Boolean(schedule.start_date && schedule.start_date > today);
};

const getScheduleDateKey = (schedule: Schedule): string =>
  schedule.treatment_date ?? schedule.start_date ?? "";

const sortSchedules = (schedules: Schedule[]): Schedule[] =>
  [...schedules].sort((first, second) => {
    const dateComparison = getScheduleDateKey(first).localeCompare(
      getScheduleDateKey(second)
    );

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return first.in_time.localeCompare(second.in_time);
  });

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new AdminScheduleServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const normalizeError = (error: unknown): AdminScheduleServiceError => {
  if (error instanceof AdminScheduleServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new AdminScheduleServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;

    if (error.response.status === 401) {
      return new AdminScheduleServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new AdminScheduleServiceError(
        "You do not have permission to view schedules.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new AdminScheduleServiceError(
        body.detail,
        error.response.status
      );
    }

    return new AdminScheduleServiceError(
      "Unable to load schedules.",
      error.response.status
    );
  }

  if (error instanceof Error) {
    return new AdminScheduleServiceError(error.message);
  }

  return new AdminScheduleServiceError("Unable to load schedules.");
};

export const getAdminScheduleData =
  async (): Promise<AdminScheduleData> => {
    try {
      const headers = await getAuthHeaders();
      const [
        todayResponse,
        pendingResponse,
        completedResponse,
        missedResponse,
        therapistsResponse,
      ] = await Promise.all([
        api.get<Schedule[]>("/schedule/today", { headers }),
        api.get<Schedule[]>("/schedule/pending", { headers }),
        api.get<Schedule[]>("/schedule/completed", { headers }),
        api.get<Schedule[]>("/schedule/missed", { headers }),
        api.get<TherapistResponse[]>("/therapists", { headers }),
      ]);

      const todayIds = new Set(
        todayResponse.data.map((schedule) => schedule.id)
      );
      const upcoming = pendingResponse.data.filter((schedule) =>
        isFutureSchedule(schedule, todayIds)
      );

      return {
        today: sortSchedules(todayResponse.data),
        upcoming: sortSchedules(upcoming),
        completed: completedResponse.data,
        missed: missedResponse.data,
        therapists: [...therapistsResponse.data].sort((first, second) =>
          first.username.localeCompare(second.username)
        ),
      };
    } catch (error) {
      throw normalizeError(error);
    }
  };
