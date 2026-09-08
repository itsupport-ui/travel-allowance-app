import { File, Paths } from "expo-file-system";

import { api } from "../api/apiClient";
import { appConfig } from "../config/env";
import type {
  ManualTravelReviewEvent,
  TravelResponse,
} from "../types/travel";
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

export const listManualTravelReviews = async (
  status = "pending"
): Promise<TravelResponse[]> => {
  const response = await api.get<TravelResponse[]>("/travel/manual-review", {
    headers: await getAuthHeaders(),
    params: { status },
  });
  return response.data;
};

export const decideManualTravel = async (
  travelId: number,
  payload: {
    decision: "approved" | "changes_requested";
    reason: string;
    version: number;
  }
): Promise<TravelResponse> => {
  const response = await api.put<TravelResponse>(
    `/travel/manual-review/${travelId}/decision`,
    payload,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getManualTravelReviewHistory = async (
  travelId: number
): Promise<ManualTravelReviewEvent[]> => {
  const response = await api.get<ManualTravelReviewEvent[]>(
    `/travel/${travelId}/review-history`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const cancelManualTravel = async (travelId: number): Promise<void> => {
  await api.delete(`/travel/${travelId}`, {
    headers: await getAuthHeaders(),
  });
};

export interface ManualTravelUpdateRequest {
  bill_amount: number | null;
  correction_reason: string;
  from_address: string;
  invoice_file: {
    mimeType: string;
    name: string;
    uri: string;
  } | null;
  manual_reason: string;
  patient_name: string;
  patient_visited: boolean;
  to_address: string;
  total_km: number;
  transport_mode: string;
  travel_date: string;
  version: number;
}

export const updateManualTravel = async (
  travelId: number,
  request: ManualTravelUpdateRequest
): Promise<TravelResponse> => {
  const formData = new FormData();
  formData.append("patient_name", request.patient_name);
  formData.append("travel_date", request.travel_date);
  formData.append("from_address", request.from_address);
  formData.append("to_address", request.to_address);
  formData.append("total_km", String(request.total_km));
  formData.append("patient_visited", String(request.patient_visited));
  formData.append("transport_mode", request.transport_mode);
  formData.append("manual_reason", request.manual_reason);
  formData.append("correction_reason", request.correction_reason);
  formData.append("version", String(request.version));
  if (request.bill_amount !== null) {
    formData.append("bill_amount", String(request.bill_amount));
  }
  if (request.invoice_file) {
    formData.append(
      "invoice_file",
      {
        name: request.invoice_file.name,
        type: request.invoice_file.mimeType,
        uri: request.invoice_file.uri,
      } as unknown as Blob
    );
  }
  const response = await api.put<TravelResponse>(
    `/travel/${travelId}`,
    formData,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};
