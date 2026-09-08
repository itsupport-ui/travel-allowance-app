import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type {
  StaffDeactivationOverride,
  StaffDeactivationReadiness,
  StaffRole,
} from "../types/staffOverride";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

export class StaffOverrideServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "StaffOverrideServiceError";
  }
}

const headers = async () => {
  const token = await getToken();
  if (!token) {
    throw new StaffOverrideServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }
  return { Authorization: `Bearer ${token}` };
};

const normalize = (error: unknown, fallback: string): Error => {
  if (error instanceof StaffOverrideServiceError) return error;
  if (error instanceof AxiosError) {
    if (!error.response) {
      return new StaffOverrideServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }
    const body = error.response.data as ApiErrorBody | undefined;
    return new StaffOverrideServiceError(
      typeof body?.detail === "string" ? body.detail : fallback,
      error.response.status
    );
  }
  return error instanceof Error ? error : new Error(fallback);
};

export const getStaffDeactivationReadiness = async (
  staffRole: StaffRole,
  staffId: number
): Promise<StaffDeactivationReadiness> => {
  try {
    const response = await api.get<StaffDeactivationReadiness>(
      `/staff/deactivation-readiness/${staffRole}/${staffId}`,
      { headers: await headers() }
    );
    return response.data;
  } catch (error) {
    throw normalize(error, "Unable to check deactivation readiness.");
  }
};

export const getStaffDeactivationOverrides = async (
  staffRole: StaffRole,
  staffId: number
): Promise<StaffDeactivationOverride[]> => {
  try {
    const response = await api.get<StaffDeactivationOverride[]>(
      "/staff/deactivation-overrides",
      {
        headers: await headers(),
        params: { staff_id: staffId, staff_role: staffRole, status: "all" },
      }
    );
    return response.data;
  } catch (error) {
    throw normalize(error, "Unable to load deactivation overrides.");
  }
};

export const requestStaffDeactivationOverride = async (payload: {
  reason: string;
  staff_id: number;
  staff_role: StaffRole;
}): Promise<StaffDeactivationOverride> => {
  try {
    const response = await api.post<StaffDeactivationOverride>(
      "/staff/deactivation-overrides",
      { ...payload, evidence_refs: [] },
      { headers: await headers() }
    );
    return response.data;
  } catch (error) {
    throw normalize(error, "Unable to request the deactivation override.");
  }
};

export const decideStaffDeactivationOverride = async (
  requestId: number,
  payload: { decision: "approved" | "rejected"; reason: string; version: number }
): Promise<StaffDeactivationOverride> => {
  try {
    const response = await api.put<StaffDeactivationOverride>(
      `/staff/deactivation-overrides/${requestId}/decision`,
      payload,
      { headers: await headers() }
    );
    return response.data;
  } catch (error) {
    throw normalize(error, "Unable to review the deactivation override.");
  }
};
