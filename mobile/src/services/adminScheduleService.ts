import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import type {
  AdminScheduleFilters,
  AdminScheduleFormOptions,
  AdminScheduleReviewItem,
  AdminScheduleReviewPage,
  ScheduleDoctorOption,
  SchedulePatientOption,
  ScheduleTherapistOption,
  TherapistAvailability,
} from "../types/adminSchedule";
import type {
  ScheduleResponse,
  ScheduleType,
} from "../types/schedule";
import { formatScheduleDate, formatScheduleTime } from "../utils/scheduleForm";
import { getToken } from "../utils/storage";

interface ApiReviewItem {
  area: string;
  clinical_notes: string | null;
  doctor_id: number;
  doctor_name: string;
  duration_minutes: number;
  expected_end_time: string;
  has_conflict: boolean;
  id: number;
  instructions: string;
  medicines: string | null;
  occurrence_date: string | null;
  operational_status: AdminScheduleReviewItem["operationalStatus"];
  patient_address: string;
  patient_name: string;
  patient_phone: string | null;
  patient_reference_id: string | null;
  precautions: string | null;
  priority: AdminScheduleReviewItem["priority"];
  schedule_type: AdminScheduleReviewItem["scheduleType"];
  start_date: string | null;
  start_time: string;
  status: AdminScheduleReviewItem["status"];
  therapist_id: number;
  therapist_name: string;
  treatment_name: string;
  visit_type: AdminScheduleReviewItem["visitType"];
}

interface ApiReviewPage {
  items: ApiReviewItem[];
  page: number;
  page_size: number;
  summary: {
    cancelled: number;
    cancelled_today: number;
    completed: number;
    completed_today: number;
    conflicts: number;
    high_priority_today: number;
    in_progress: number;
    today: number;
    upcoming: number;
  };
  total: number;
  total_pages: number;
}

interface ApiFormOptions {
  doctors: {
    id: number;
    name: string;
    specialization: string | null;
  }[];
  patients: {
    address: string;
    name: string;
    phone: string | null;
    reference_id: string | null;
  }[];
  therapists: {
    email: string;
    id: number;
    name: string;
    today_appointments: number;
  }[];
}

interface ApiAvailability {
  available: boolean;
  conflicts: {
    expected_end_time: string;
    id: number;
    patient_name: string;
    schedule_date: string | null;
    start_time: string;
  }[];
  today_appointments: number;
}

export class AdminScheduleServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AdminScheduleServiceError";
  }
}

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new AdminScheduleServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }

  return { Authorization: `Bearer ${token}` };
};

const normalizeError = (
  error: unknown,
  fallback: string
): AdminScheduleServiceError => {
  if (error instanceof AdminScheduleServiceError) {
    return error;
  }
  if (error instanceof AxiosError) {
    const responseData: unknown = error.response?.data;
    const detail =
      typeof responseData === "object" &&
      responseData !== null &&
      "detail" in responseData
        ? responseData.detail
        : undefined;
    if (!error.response) {
      return new AdminScheduleServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }
    if (error.response.status === 401) {
      return new AdminScheduleServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }
    return new AdminScheduleServiceError(
      typeof detail === "string" ? detail : fallback,
      error.response.status
    );
  }
  return new AdminScheduleServiceError(
    error instanceof Error ? error.message : fallback
  );
};

export const createEmptyAdminScheduleFilters =
  (): AdminScheduleFilters => ({
    doctorId: null,
    fromDate: "",
    priority: null,
    search: "",
    sort: "time",
    therapistId: null,
    toDate: "",
    view: "today",
  });

const mapReviewItem = (
  item: ApiReviewItem
): AdminScheduleReviewItem => ({
  area: item.area,
  clinicalNotes: item.clinical_notes,
  doctorId: item.doctor_id,
  doctorName: item.doctor_name,
  durationMinutes: item.duration_minutes,
  expectedEndTime: item.expected_end_time,
  hasConflict: item.has_conflict,
  id: item.id,
  instructions: item.instructions,
  medicines: item.medicines,
  occurrenceDate: item.occurrence_date,
  operationalStatus: item.operational_status,
  patientAddress: item.patient_address,
  patientName: item.patient_name,
  patientPhone: item.patient_phone,
  patientReferenceId: item.patient_reference_id,
  precautions: item.precautions,
  priority: item.priority,
  scheduleType: item.schedule_type,
  startDate: item.start_date,
  startTime: item.start_time,
  status: item.status,
  therapistId: item.therapist_id,
  therapistName: item.therapist_name,
  treatmentName: item.treatment_name,
  visitType: item.visit_type,
});

export const getAdminScheduleReview = async (
  filters: AdminScheduleFilters,
  page = 1,
  pageSize = 20
): Promise<AdminScheduleReviewPage> => {
  try {
    const response = await api.get<ApiReviewPage>(
      "/admin-schedules/review",
      {
        headers: await getAuthHeaders(),
        params: {
          doctor_id: filters.doctorId ?? undefined,
          from_date: filters.fromDate || undefined,
          page,
          page_size: pageSize,
          priority: filters.priority ?? undefined,
          search: filters.search.trim() || undefined,
          sort: filters.sort,
          therapist_id: filters.therapistId ?? undefined,
          to_date: filters.toDate || undefined,
          view: filters.view,
        },
      }
    );
    const data = response.data;
    return {
      items: data.items.map(mapReviewItem),
      page: data.page,
      pageSize: data.page_size,
      summary: {
        cancelled: data.summary.cancelled,
        cancelledToday: data.summary.cancelled_today,
        completed: data.summary.completed,
        completedToday: data.summary.completed_today,
        conflicts: data.summary.conflicts,
        highPriorityToday: data.summary.high_priority_today,
        inProgress: data.summary.in_progress,
        today: data.summary.today,
        upcoming: data.summary.upcoming,
      },
      total: data.total,
      totalPages: data.total_pages,
    };
  } catch (error) {
    throw normalizeError(error, "Unable to load schedules.");
  }
};

export const getAdminScheduleFormOptions =
  async (): Promise<AdminScheduleFormOptions> => {
    try {
      const response = await api.get<ApiFormOptions>(
        "/admin-schedules/form-options",
        { headers: await getAuthHeaders() }
      );
      const patients: SchedulePatientOption[] =
        response.data.patients.map((patient) => ({
          address: patient.address,
          name: patient.name,
          phone: patient.phone,
          referenceId: patient.reference_id,
        }));
      const doctors: ScheduleDoctorOption[] =
        response.data.doctors;
      const therapists: ScheduleTherapistOption[] =
        response.data.therapists.map((therapist) => ({
          email: therapist.email,
          id: therapist.id,
          name: therapist.name,
          todayAppointments: therapist.today_appointments,
        }));
      return { doctors, patients, therapists };
    } catch (error) {
      throw normalizeError(error, "Unable to load scheduling options.");
    }
  };

interface AvailabilityInput {
  endDate: Date | null;
  excludeScheduleId?: number;
  expectedEndTime: Date;
  scheduleType: ScheduleType;
  startDate: Date | null;
  startTime: Date;
  therapistId: number;
  treatmentDate: Date | null;
}

export const getTherapistAvailability = async (
  input: AvailabilityInput
): Promise<TherapistAvailability> => {
  try {
    const response = await api.get<ApiAvailability>(
      "/admin-schedules/therapist-availability",
      {
        headers: await getAuthHeaders(),
        params: {
          end_date: input.endDate
            ? formatScheduleDate(input.endDate)
            : undefined,
          exclude_schedule_id: input.excludeScheduleId,
          expected_end_time: formatScheduleTime(
            input.expectedEndTime
          ),
          schedule_type: input.scheduleType,
          start_date: input.startDate
            ? formatScheduleDate(input.startDate)
            : undefined,
          start_time: formatScheduleTime(input.startTime),
          therapist_id: input.therapistId,
          treatment_date: input.treatmentDate
            ? formatScheduleDate(input.treatmentDate)
            : undefined,
        },
      }
    );
    return {
      available: response.data.available,
      conflicts: response.data.conflicts.map((conflict) => ({
        expectedEndTime: conflict.expected_end_time,
        id: conflict.id,
        patientName: conflict.patient_name,
        scheduleDate: conflict.schedule_date,
        startTime: conflict.start_time,
      })),
      todayAppointments: response.data.today_appointments,
    };
  } catch (error) {
    throw normalizeError(
      error,
      "Unable to check therapist availability."
    );
  }
};

export const cancelAdminSchedule = async (
  scheduleId: number
): Promise<ScheduleResponse> => {
  try {
    const response = await api.put<ScheduleResponse>(
      `/admin-schedules/${scheduleId}/cancel`,
      undefined,
      { headers: await getAuthHeaders() }
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error, "Unable to cancel the schedule.");
  }
};
