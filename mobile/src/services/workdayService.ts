import { api } from "../api/apiClient";
import { getToken } from "../utils/storage";
import type { DoctorTodayWorkday } from "../types/doctorWorkflow";

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
  ended_at: string | null;
  total_work_minutes: number | null;
  pending_schedules_count: number | null;
  completed_schedules_count: number | null;
  missed_schedules_count: number | null;
  workday_end_time: string;
  can_end_workday: boolean;
  should_prompt_end: boolean;
  auto_logout_enabled: boolean;
  auto_logout_grace_minutes: number;
}

export interface EndDayResponse {
  message: string;
  workday_id: number;
  ended_at: string;
  total_work_minutes: number;
  pending_schedules_count: number;
  completed_schedules_count: number;
  missed_schedules_count: number;
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

export const endWorkday = async (request: {
  end_latitude: number;
  end_longitude: number;
  device_timestamp: string;
}): Promise<EndDayResponse> => {
  const response = await api.post<EndDayResponse>(
    "/therapist/workday/end",
    request,
    {
      headers: await getAuthHeaders(),
    }
  );

  return response.data;
};

export const startDoctorWorkday = async (
  request: StartDayRequest
): Promise<StartDayResponse> => {
  const response = await api.post<StartDayResponse>(
    "/doctor/workday/start",
    {
      ...request,
      device_timestamp: new Date().toISOString(),
    },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getTodayDoctorWorkday =
  async (): Promise<DoctorTodayWorkday> => {
    const response = await api.get<DoctorTodayWorkday>(
      "/doctor/workday/today",
      { headers: await getAuthHeaders() }
    );
    return response.data;
  };

export interface DoctorEndDayResponse {
  message: string;
  workday_id: number;
  ended_at: string;
  total_work_minutes: number;
  total_visits_count: number;
  completed_visits_count: number;
  pending_visits_count: number;
  total_distance_km: number;
}

export const endDoctorWorkday = async (request: {
  end_address?: string;
  end_latitude: number;
  end_longitude: number;
  device_timestamp: string;
}): Promise<DoctorEndDayResponse> => {
  const response = await api.post<DoctorEndDayResponse>(
    "/doctor/workday/end",
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};
