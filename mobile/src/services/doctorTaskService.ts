import { api } from "../api/apiClient";
import type {
  CreateDoctorTaskRequest,
  DoctorTaskDaySummary,
  DoctorTaskExpenseOption,
  CreatePlaceRequest,
  DoctorTask,
  DoctorTaskScope,
  Place,
  TaskProofPhoto,
  TaskPunchLocation,
} from "../types/doctorTask";
import { getToken } from "../utils/storage";

const getAuthHeaders = async () => {
  const token = await getToken();
  if (!token) {
    throw new Error("Authentication token is missing. Please sign in again.");
  }
  return { Authorization: `Bearer ${token}` };
};

// ---------------------------------------------------------------- places
export const getPlaces = async (): Promise<Place[]> => {
  const response = await api.get<Place[]>("/places", {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const createPlace = async (
  request: CreatePlaceRequest
): Promise<Place> => {
  const response = await api.post<Place>("/places", request, {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const setPlaceActive = async (
  placeId: number,
  active: boolean
): Promise<Place> => {
  const response = await api.put<Place>(
    `/places/${placeId}`,
    { active },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

// ----------------------------------------------------------- assigner side
export const createDoctorTask = async (
  request: CreateDoctorTaskRequest
): Promise<DoctorTask> => {
  const response = await api.post<DoctorTask>("/doctor-tasks", request, {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const getManagedDoctorTasks = async (filters: {
  doctor_id?: number;
  scheduled_date?: string;
  status?: string;
}): Promise<DoctorTask[]> => {
  const response = await api.get<DoctorTask[]>("/doctor-tasks", {
    headers: await getAuthHeaders(),
    params: filters,
  });
  return response.data;
};

export const cancelDoctorTask = async (
  taskId: number,
  reason: string
): Promise<DoctorTask> => {
  const response = await api.post<DoctorTask>(
    `/doctor-tasks/${taskId}/cancel`,
    { reason },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

// ------------------------------------------------------------ doctor side
export const getMyDoctorTasks = async (
  scope: DoctorTaskScope
): Promise<DoctorTask[]> => {
  const response = await api.get<DoctorTask[]>("/doctor-tasks/my", {
    headers: await getAuthHeaders(),
    params: { scope },
  });
  return response.data;
};

export const getMyDoctorTask = async (taskId: number): Promise<DoctorTask> => {
  const response = await api.get<DoctorTask>(`/doctor-tasks/${taskId}`, {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const getTodayCompletedDoctorTasks = async (): Promise<
  DoctorTaskExpenseOption[]
> => {
  const response = await api.get<DoctorTaskExpenseOption[]>(
    "/doctor-tasks/today/completed",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getDoctorTaskDaySummary =
  async (): Promise<DoctorTaskDaySummary> => {
    const response = await api.get<DoctorTaskDaySummary>(
      "/doctor-tasks/day-summary",
      { headers: await getAuthHeaders() }
    );
    return response.data;
  };

export const punchInDoctorTask = async (
  taskId: number,
  location: TaskPunchLocation,
  locationExceptionId?: number | null
): Promise<DoctorTask> => {
  const response = await api.post<DoctorTask>(
    `/doctor-tasks/${taskId}/punch-in`,
    {
      device_timestamp: new Date().toISOString(),
      gps_accuracy_m: Math.max(location.accuracy ?? 1, 1),
      latitude: location.latitude,
      location_exception_id: locationExceptionId ?? null,
      longitude: location.longitude,
    },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const punchOutDoctorTask = async (
  taskId: number,
  location: TaskPunchLocation,
  photo: TaskProofPhoto,
  notes: string,
  locationExceptionId?: number | null
): Promise<DoctorTask> => {
  const formData = new FormData();
  formData.append("latitude", String(location.latitude));
  formData.append("longitude", String(location.longitude));
  formData.append("gps_accuracy_m", String(Math.max(location.accuracy ?? 1, 1)));
  formData.append("device_timestamp", new Date().toISOString());
  if (locationExceptionId) {
    formData.append("location_exception_id", String(locationExceptionId));
  }
  if (notes.trim()) {
    formData.append("notes", notes.trim());
  }
  formData.append(
    "photo",
    {
      name: photo.fileName,
      type: photo.mimeType,
      uri: photo.uri,
    } as unknown as Blob
  );
  const response = await api.post<DoctorTask>(
    `/doctor-tasks/${taskId}/punch-out`,
    formData,
    {
      headers: {
        ...(await getAuthHeaders()),
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
};
