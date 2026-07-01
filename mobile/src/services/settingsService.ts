import { api } from "../api/apiClient";
import type {
  AppSettings,
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
