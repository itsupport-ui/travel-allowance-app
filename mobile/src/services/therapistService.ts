import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type { Schedule } from "../types/schedule";
import type {
  CreateTherapistPayload,
  TherapistListItem,
  TherapistResponse,
  UpdateTherapistPayload,
} from "../types/therapist";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

export class TherapistServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "TherapistServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new TherapistServiceError(
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
  fallback = "Unable to load therapists."
): TherapistServiceError => {
  if (error instanceof TherapistServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new TherapistServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;

    if (error.response.status === 401) {
      return new TherapistServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new TherapistServiceError(
        "You do not have permission to view therapists.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new TherapistServiceError(
        body.detail,
        error.response.status
      );
    }

    return new TherapistServiceError(fallback, error.response.status);
  }

  if (error instanceof Error) {
    return new TherapistServiceError(error.message);
  }

  return new TherapistServiceError(fallback);
};

export const getTherapists = async (): Promise<TherapistResponse[]> => {
  try {
    const response = await api.get<TherapistResponse[]>("/therapists", {
      headers: await getAuthHeaders(),
    });

    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
};

export const getManagedTherapists =
  async (): Promise<TherapistResponse[]> => {
    try {
      const response = await api.get<TherapistResponse[]>(
        "/therapists/manage",
        {
          headers: await getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      throw normalizeError(error, "Unable to load therapist profiles.");
    }
  };

export const getTherapistManagementList =
  async (): Promise<TherapistListItem[]> => {
    try {
      const headers = await getAuthHeaders();
      const [therapistsResponse, schedulesResponse] = await Promise.all([
        getManagedTherapists(),
        api.get<Schedule[]>("/schedule/today", { headers }),
      ]);

      const scheduleCounts = schedulesResponse.data.reduce<Map<number, number>>(
        (counts, schedule) => {
          counts.set(
            schedule.therapist_id,
            (counts.get(schedule.therapist_id) ?? 0) + 1
          );
          return counts;
        },
        new Map<number, number>()
      );

      return therapistsResponse
        .map((therapist) => ({
          ...therapist,
          todayScheduleCount: scheduleCounts.get(therapist.id) ?? 0,
        }))
        .sort((first, second) =>
          first.username.localeCompare(second.username)
        );
    } catch (error) {
      throw normalizeError(error);
    }
  };

export const createTherapist = async (
  payload: CreateTherapistPayload
): Promise<TherapistResponse> => {
  try {
    const response = await api.post<TherapistResponse>(
      "/auth/register",
      payload,
      {
        headers: await getAuthHeaders(),
      }
    );

    return response.data;
  } catch (error) {
    throw normalizeError(error, "Unable to create the therapist.");
  }
};

export const getTherapistById = async (
  therapistId: number
): Promise<TherapistResponse> => {
  try {
    const response = await api.get<TherapistResponse>(
      `/therapists/${therapistId}`,
      {
        headers: await getAuthHeaders(),
      }
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error, "Unable to load therapist profile.");
  }
};

export const updateTherapist = async (
  therapistId: number,
  payload: UpdateTherapistPayload
): Promise<TherapistResponse> => {
  try {
    const response = await api.put<TherapistResponse>(
      `/therapists/${therapistId}`,
      payload,
      {
        headers: await getAuthHeaders(),
      }
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error, "Unable to update therapist profile.");
  }
};
