import { api } from "../api/apiClient";
import type {
  AppSettings,
  LocationPolicy,
  UpdateLocationPolicyRequest,
  UpdateSettingsRequest,
} from "../types/settings";


export const getSettings = async (): Promise<AppSettings> => {
  const response = await api.get<AppSettings>("/settings/");
  return response.data;
};


export const updateSettings = async (
  payload: UpdateSettingsRequest
): Promise<AppSettings> => {
  const response = await api.put<AppSettings>("/settings/", payload);
  return response.data;
};

export const getReimbursementPolicyHistory = async (): Promise<AppSettings[]> => {
  const response = await api.get<AppSettings[]>(
    "/settings/reimbursement-policy/history",
    { params: { limit: 20 } }
  );
  return response.data;
};

export const getLocationPolicy = async (): Promise<LocationPolicy> => {
  const response = await api.get<LocationPolicy>("/settings/location-policy");
  return response.data;
};

export const getLocationPolicyHistory = async (): Promise<LocationPolicy[]> => {
  const response = await api.get<LocationPolicy[]>(
    "/settings/location-policy/history",
    { params: { limit: 20 } }
  );
  return response.data;
};

export const updateLocationPolicy = async (
  payload: UpdateLocationPolicyRequest
): Promise<LocationPolicy> => {
  const response = await api.put<LocationPolicy>(
    "/settings/location-policy",
    payload
  );
  return response.data;
};
