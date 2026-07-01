import { File, Paths } from "expo-file-system";

import { api } from "../api/apiClient";
import { appConfig } from "../config/env";
import type { TravelResponse } from "../types/travel";
import { getToken } from "../utils/storage";

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new Error("Authentication token is missing. Please log in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

export const getTodayTravels = async (): Promise<TravelResponse[]> => {
  const response = await api.get<TravelResponse[]>("/travel/today", {
    headers: await getAuthHeaders(),
  });

  return response.data;
};

export const getTravelById = async (
  travelId: number
): Promise<TravelResponse> => {
  const response = await api.get<TravelResponse>(`/travel/${travelId}`, {
    headers: await getAuthHeaders(),
  });

  return response.data;
};

export const downloadTravelInvoice = async (
  travelId: number,
  fileName: string
): Promise<File> => {
  const headers = await getAuthHeaders();
  const safeFileName =
    fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_") ||
    `travel_${travelId}_invoice`;
  const destination = new File(Paths.cache, safeFileName);

  const downloadedFile = await File.downloadFileAsync(
    `${appConfig.apiUrl}/travel/${travelId}/invoice`,
    destination,
    {
      headers,
      idempotent: true,
    }
  );

  return new File(downloadedFile.uri);
};
