import { api } from "../api/apiClient";
import { getToken } from "../utils/storage";
import type { DoctorTodayWorkday } from "../types/doctorWorkflow";
import { executeOrQueueMutation } from "./offlineMutationQueue";

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
  available_actions: string[];
  blocking_reasons: string[];
  next_action: string | null;
  active_schedule_id: number | null;
  ended_early: boolean;
  end_reason: string | null;
  early_end_review_status: string | null;
}

export interface EndDayResponse {
  message: string;
  workday_id: number;
  ended_at: string;
  total_work_minutes: number;
  pending_schedules_count: number;
  completed_schedules_count: number;
  missed_schedules_count: number;
  ended_early: boolean;
  end_reason: string | null;
  early_end_review_status: string | null;
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
  const body = { ...request };
  return executeOrQueueMutation({
    body,
    execute: async (operationId) => {
      const response = await api.post<StartDayResponse>(
        "/therapist/workday/start",
        body,
        {
          headers: {
            ...(await getAuthHeaders()),
            "X-Idempotency-Key": operationId,
          },
        }
      );
      return response.data;
    },
    operationType: "therapist_workday_start",
  });
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
  early_end_reason?: string;
}): Promise<EndDayResponse> => {
  const body = { ...request };
  return executeOrQueueMutation({
    body,
    execute: async (operationId) => {
      const response = await api.post<EndDayResponse>(
        "/therapist/workday/end",
        body,
        {
          headers: {
            ...(await getAuthHeaders()),
            "X-Idempotency-Key": operationId,
          },
        }
      );
      return response.data;
    },
    operationType: "therapist_workday_end",
  });
};

export const startDoctorWorkday = async (
  request: StartDayRequest
): Promise<StartDayResponse> => {
  const body = {
    ...request,
    device_timestamp: new Date().toISOString(),
  };
  return executeOrQueueMutation({
    body,
    execute: async (operationId) => {
      const response = await api.post<StartDayResponse>(
        "/doctor/workday/start",
        body,
        {
          headers: {
            ...(await getAuthHeaders()),
            "X-Idempotency-Key": operationId,
          },
        }
      );
      return response.data;
    },
    operationType: "doctor_workday_start",
  });
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
  ended_early: boolean;
  end_reason: string | null;
  early_end_review_status: string | null;
}

export const endDoctorWorkday = async (request: {
  end_address?: string;
  end_latitude: number;
  end_longitude: number;
  device_timestamp: string;
  early_end_reason?: string;
}): Promise<DoctorEndDayResponse> => {
  const body = { ...request };
  return executeOrQueueMutation({
    body,
    execute: async (operationId) => {
      const response = await api.post<DoctorEndDayResponse>(
        "/doctor/workday/end",
        body,
        {
          headers: {
            ...(await getAuthHeaders()),
            "X-Idempotency-Key": operationId,
          },
        }
      );
      return response.data;
    },
    operationType: "doctor_workday_end",
  });
};
