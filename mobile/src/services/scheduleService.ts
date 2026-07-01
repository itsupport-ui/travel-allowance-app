import { AxiosError, type AxiosResponse } from "axios";

import { api } from "../api/apiClient";
import type {
  CompleteTreatmentRequest,
  CreateScheduleRequest,
  ScheduleResponse,
  UpdateScheduleRequest,
} from "../types/schedule";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

interface ApiValidationIssue {
  loc?: unknown;
  msg?: unknown;
}

export class ScheduleServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ScheduleServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new ScheduleServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const getValidationMessage = (detail: unknown): string | null => {
  if (!Array.isArray(detail)) {
    return null;
  }

  const issue = detail.find(
    (item): item is ApiValidationIssue =>
      typeof item === "object" && item !== null && "msg" in item
  );

  if (!issue || typeof issue.msg !== "string") {
    return null;
  }

  const location = Array.isArray(issue.loc)
    ? issue.loc.filter((part) => typeof part === "string").at(-1)
    : null;

  if (typeof location !== "string") {
    return issue.msg;
  }

  const fieldName = location.replace(/_/g, " ");
  return `${fieldName}: ${issue.msg}`;
};

const normalizeError = (
  error: unknown,
  fallback: string
): ScheduleServiceError => {
  if (error instanceof ScheduleServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new ScheduleServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;

    if (error.response.status === 401) {
      return new ScheduleServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new ScheduleServiceError(
        "You do not have permission to manage this schedule.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new ScheduleServiceError(
        body.detail,
        error.response.status
      );
    }

    const validationMessage = getValidationMessage(body?.detail);

    if (validationMessage) {
      return new ScheduleServiceError(
        validationMessage,
        error.response.status
      );
    }

    return new ScheduleServiceError(fallback, error.response.status);
  }

  if (error instanceof Error) {
    return new ScheduleServiceError(error.message);
  }

  return new ScheduleServiceError(fallback);
};

const executeRequest = async <T>(
  request: () => Promise<AxiosResponse<T>>,
  fallback: string
): Promise<T> => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    throw normalizeError(error, fallback);
  }
};

export const getTodaySchedules = async (): Promise<ScheduleResponse[]> =>
  executeRequest(
    async () =>
      api.get<ScheduleResponse[]>("/schedule/my-today", {
        headers: await getAuthHeaders(),
      }),
    "Unable to load today's schedules."
  );

export const getUpcomingSchedules =
  async (): Promise<ScheduleResponse[]> =>
    executeRequest(
      async () =>
        api.get<ScheduleResponse[]>("/schedule/my-upcoming", {
          headers: await getAuthHeaders(),
        }),
      "Unable to load upcoming schedules."
    );

export const getCompletedSchedules =
  async (): Promise<ScheduleResponse[]> =>
    executeRequest(
      async () =>
        api.get<ScheduleResponse[]>("/schedule/completed", {
          headers: await getAuthHeaders(),
        }),
      "Unable to load completed schedules."
    );

export const getMissedSchedules =
  async (): Promise<ScheduleResponse[]> =>
    executeRequest(
      async () =>
        api.get<ScheduleResponse[]>("/schedule/missed", {
          headers: await getAuthHeaders(),
        }),
      "Unable to load missed schedules."
    );

export const getScheduleById = async (
  scheduleId: number
): Promise<ScheduleResponse> =>
  executeRequest(
    async () =>
      api.get<ScheduleResponse>(`/schedule/${scheduleId}`, {
        headers: await getAuthHeaders(),
      }),
    "Unable to load schedule details."
  );

export const createSchedule = async (
  request: CreateScheduleRequest
): Promise<ScheduleResponse> =>
  executeRequest(
    async () =>
      api.post<ScheduleResponse>("/schedule/create", request, {
        headers: await getAuthHeaders(),
      }),
    "Unable to create the schedule."
  );

export const updateSchedule = async (
  scheduleId: number,
  request: UpdateScheduleRequest
): Promise<ScheduleResponse> =>
  executeRequest(
    async () =>
      api.put<ScheduleResponse>(
        `/schedule/${scheduleId}`,
        request,
        {
          headers: await getAuthHeaders(),
        }
      ),
    "Unable to update the schedule."
  );

export const completeTreatment = async (
  scheduleId: number,
  request: CompleteTreatmentRequest
): Promise<ScheduleResponse> => {
  const formData = new FormData();
  formData.append("completion_notes", request.completion_notes);
  formData.append(
    "arrival_latitude",
    String(request.arrival_latitude)
  );
  formData.append(
    "arrival_longitude",
    String(request.arrival_longitude)
  );
  formData.append("transport_mode", request.transport_mode);

  if (
    request.bill_amount !== null &&
    request.bill_amount !== undefined
  ) {
    formData.append("bill_amount", String(request.bill_amount));
  }

  if (request.invoice_file) {
    const nativeFile = {
      name: request.invoice_file.name,
      type: request.invoice_file.mimeType,
      uri: request.invoice_file.uri,
    };

    formData.append(
      "invoice_file",
      nativeFile as unknown as Blob
    );
  }

  return executeRequest(
    async () =>
      api.put<ScheduleResponse>(
        `/schedule/${scheduleId}/complete`,
        formData,
        {
          headers: await getAuthHeaders(),
        }
      ),
    "Unable to complete the treatment."
  );
};

export const markTreatmentMissed = async (
  scheduleId: number,
  reason: string
): Promise<ScheduleResponse> =>
  executeRequest(
    async () =>
      api.put<ScheduleResponse>(
        `/schedule/${scheduleId}/missed`,
        {
          missed_reason: reason,
        },
        {
          headers: await getAuthHeaders(),
        }
      ),
    "Unable to mark the treatment as missed."
  );
