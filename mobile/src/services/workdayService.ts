import { api } from "../api/apiClient";
import { getToken } from "../utils/storage";

export interface StartDayRequest {
  start_address: string;
  start_latitude: number;
  start_longitude: number;
}

export interface StartDayResponse {
  message: string;
  workday_id: number;
}

export interface TodayWorkdayResponse {
  started: boolean;
  workday_id: number | null;
  work_date: string;
  started_at: string | null;
  start_address: string | null;
  is_active: boolean;
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new Error("Authentication token is missing. Please log in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

export const startWorkday = async (
  request: StartDayRequest
): Promise<StartDayResponse> => {
  const response = await api.post<StartDayResponse>(
    "/therapist/workday/start",
    request,
    {
      headers: await getAuthHeaders(),
    }
  );

  return response.data;
};

export const getTodayWorkday =
  async (): Promise<TodayWorkdayResponse> => {
    const response = await api.get<TodayWorkdayResponse>(
      "/therapist/workday/today",
      {
        headers: await getAuthHeaders(),
      }
    );

    return response.data;
  };
