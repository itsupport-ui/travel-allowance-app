import { AxiosError, type AxiosResponse } from "axios";

import { api } from "../api/apiClient";
import type {
  CreateDoctorRequest,
  Doctor,
  UpdateDoctorRequest,
} from "../types/doctor";
import { getToken } from "../utils/storage";

interface ApiErrorBody {
  detail?: unknown;
}

export class DoctorServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "DoctorServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new DoctorServiceError(
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
  fallback: string
): DoctorServiceError => {
  if (error instanceof DoctorServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new DoctorServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;

    if (error.response.status === 401) {
      return new DoctorServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }

    if (error.response.status === 403) {
      return new DoctorServiceError(
        "You do not have permission to manage doctors.",
        403
      );
    }

    if (typeof body?.detail === "string") {
      return new DoctorServiceError(
        body.detail,
        error.response.status
      );
    }

    return new DoctorServiceError(fallback, error.response.status);
  }

  if (error instanceof Error) {
    return new DoctorServiceError(error.message);
  }

  return new DoctorServiceError(fallback);
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

export const getDoctors = async (): Promise<Doctor[]> =>
  executeRequest(
    async () =>
      api.get<Doctor[]>("/doctors/", {
        headers: await getAuthHeaders(),
      }),
    "Unable to load doctors."
  );

export const getManagedDoctors = async (): Promise<Doctor[]> =>
  executeRequest(
    async () =>
      api.get<Doctor[]>("/doctors/manage", {
        headers: await getAuthHeaders(),
      }),
    "Unable to load doctor profiles."
  );

export const getDoctorById = async (
  doctorId: number
): Promise<Doctor> =>
  executeRequest(
    async () =>
      api.get<Doctor>(`/doctors/${doctorId}`, {
        headers: await getAuthHeaders(),
      }),
    "Unable to load doctor details."
  );

export const createDoctor = async (
  request: CreateDoctorRequest
): Promise<Doctor> =>
  executeRequest(
    async () =>
      api.post<Doctor>("/doctors/", request, {
        headers: await getAuthHeaders(),
      }),
    "Unable to create the doctor."
  );

export const updateDoctor = async (
  doctorId: number,
  request: UpdateDoctorRequest
): Promise<Doctor> =>
  executeRequest(
    async () =>
      api.put<Doctor>(`/doctors/${doctorId}`, request, {
        headers: await getAuthHeaders(),
      }),
    "Unable to update the doctor."
  );
