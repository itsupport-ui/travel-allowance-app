import { File, Paths } from "expo-file-system";

import { api } from "../api/apiClient";
import { appConfig } from "../config/env";
import type {
  AdminDoctorClaim,
  CancelDoctorConsultationRequest,
  CompleteDoctorConsultationRequest,
  CreateDoctorConsultationRequest,
  CreateDoctorVisitRequest,
  CreateTreatmentPlanRequest,
  CreateVisitFromConsultationRequest,
  DoctorClaim,
  DoctorClaimDashboard,
  DoctorClaimDetails,
  DoctorClaimFilters,
  DoctorConsultationFilters,
  DoctorConsultation,
  DoctorConsultationDashboard,
  DoctorConsultationEvent,
  DoctorDashboardSummary,
  DoctorExpense,
  DoctorProofAsset,
  DoctorVisit,
  DoctorVisitExpenseOption,
  DoctorVisitSession,
  DoctorVisitDashboard,
  ManualDoctorExpenseReviewEvent,
  SaveDoctorExpenseRequest,
  TreatmentPlan,
  TreatmentPlanScheduleRequest,
  ResubmitTreatmentPlanRequest,
  RescheduleDoctorConsultationRequest,
  ScheduleDoctorConsultationFollowUpRequest,
  UpdateDoctorVisitStatusRequest,
} from "../types/doctorWorkflow";
import type { Doctor } from "../types/doctor";
import type { TherapistResponse } from "../types/therapist";
import type { DoctorClaimReadiness } from "../types/claim";
import { getToken } from "../utils/storage";
import { executeOrQueueMutation } from "./offlineMutationQueue";

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new Error(
      "Authentication token is missing. Please sign in again."
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

export const getMyDoctorConsultations = async (): Promise<
  DoctorConsultation[]
> => {
  const response = await api.get<DoctorConsultation[]>(
    "/doctor-consultations/my",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getDoctorConsultationDashboard =
  async (): Promise<DoctorConsultationDashboard> => {
    const response = await api.get<DoctorConsultationDashboard>(
      "/doctor-consultations/dashboard",
      { headers: await getAuthHeaders() }
    );
    return response.data;
  };

export const getDoctorConsultation = async (
  consultationId: number
): Promise<DoctorConsultation> => {
  const response = await api.get<DoctorConsultation>(
    `/doctor-consultations/${consultationId}`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const completeDoctorConsultation = async (
  consultationId: number,
  request: CompleteDoctorConsultationRequest
): Promise<DoctorConsultation> => {
  const response = await api.put<DoctorConsultation>(
    `/doctor-consultations/${consultationId}/complete`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

const withoutEmptyValues = (values: object): Record<string, string> =>
  Object.entries(values as Record<string, unknown>).reduce<
    Record<string, string>
  >((params, [key, value]) => {
    if (typeof value === "string" && value.trim() !== "") {
      params[key] = value;
    }
    return params;
  }, {});

export const getAdminDoctorConsultations = async (
  filters: DoctorConsultationFilters = {}
): Promise<DoctorConsultation[]> => {
  const response = await api.get<DoctorConsultation[]>(
    "/doctor-consultations/",
    {
      headers: await getAuthHeaders(),
      params: withoutEmptyValues(filters),
    }
  );
  return response.data;
};

export const createDoctorConsultation = async (
  request: CreateDoctorConsultationRequest
): Promise<DoctorConsultation> => {
  const response = await api.post<DoctorConsultation>(
    "/doctor-consultations/",
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const confirmDoctorConsultation = async (
  consultationId: number,
  lifecycleVersion?: number
): Promise<DoctorConsultation> => {
  const response = await api.put<DoctorConsultation>(
    `/doctor-consultations/${consultationId}/confirm`,
    lifecycleVersion === undefined
      ? {}
      : { lifecycle_version: lifecycleVersion },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const rejectDoctorConsultation = async (
  consultationId: number,
  rejectionReason: string,
  lifecycleVersion?: number
): Promise<DoctorConsultation> => {
  const response = await api.put<DoctorConsultation>(
    `/doctor-consultations/${consultationId}/reject`,
    {
      rejection_reason: rejectionReason,
      ...(lifecycleVersion === undefined
        ? {}
        : { lifecycle_version: lifecycleVersion }),
    },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const createVisitFromConsultation = async (
  consultationId: number,
  request: CreateVisitFromConsultationRequest
): Promise<DoctorVisit> => {
  const response = await api.post<DoctorVisit>(
    `/doctor-consultations/${consultationId}/create-visit`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getConsultationDoctors = async (): Promise<Doctor[]> => {
  const response = await api.get<Doctor[]>("/doctors/", {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const getMyTreatmentPlans = async (): Promise<TreatmentPlan[]> => {
  const response = await api.get<TreatmentPlan[]>(
    "/treatment-plans/my",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getTreatmentPlan = async (
  planId: number
): Promise<TreatmentPlan> => {
  const response = await api.get<TreatmentPlan>(
    `/treatment-plans/${planId}`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getMyDoctorVisits = async (): Promise<DoctorVisit[]> => {
  const response = await api.get<DoctorVisit[]>("/doctor-visits/my", {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const getDoctorVisitDashboard =
  async (): Promise<DoctorVisitDashboard> => {
    const response = await api.get<DoctorVisitDashboard>(
      "/doctor-visits/dashboard",
      { headers: await getAuthHeaders() }
    );
    return response.data;
  };

export const getDoctorVisit = async (
  visitId: number
): Promise<DoctorVisit> => {
  const response = await api.get<DoctorVisit>(
    `/doctor-visits/${visitId}`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const createDoctorVisit = async (
  request: CreateDoctorVisitRequest
): Promise<DoctorVisit> => {
  const response = await api.post<DoctorVisit>(
    "/doctor-visits/",
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const updateDoctorVisitStatus = async (
  visitId: number,
  request: UpdateDoctorVisitStatusRequest
): Promise<DoctorVisit> => {
  const response = await api.put<DoctorVisit>(
    `/doctor-visits/${visitId}/status`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getDoctorConsultationHistory = async (
  consultationId: number
): Promise<DoctorConsultationEvent[]> => {
  const response = await api.get<DoctorConsultationEvent[]>(
    `/doctor-consultations/${consultationId}/history`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const cancelDoctorConsultation = async (
  consultationId: number,
  request: CancelDoctorConsultationRequest
): Promise<DoctorConsultation> => {
  const response = await api.put<DoctorConsultation>(
    `/doctor-consultations/${consultationId}/cancel`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const rescheduleDoctorConsultation = async (
  consultationId: number,
  request: RescheduleDoctorConsultationRequest
): Promise<DoctorConsultation> => {
  const response = await api.post<DoctorConsultation>(
    `/doctor-consultations/${consultationId}/reschedule`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const scheduleDoctorConsultationFollowUp = async (
  consultationId: number,
  request: ScheduleDoctorConsultationFollowUpRequest
): Promise<DoctorConsultation> => {
  const response = await api.post<DoctorConsultation>(
    `/doctor-consultations/${consultationId}/schedule-follow-up`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getDoctorVisitSession = async (
  visitId: number,
  latitude?: number,
  longitude?: number,
  gpsAccuracyM?: number,
  deviceTimestamp?: string
): Promise<DoctorVisitSession> => {
  const response = await api.get<DoctorVisitSession>(
    `/doctor-visits/${visitId}/session`,
    {
      headers: await getAuthHeaders(),
      params:
        latitude === undefined || longitude === undefined
          ? undefined
          : {
              latitude,
              longitude,
              gps_accuracy_m: gpsAccuracyM,
              device_timestamp: deviceTimestamp,
            },
    }
  );
  return response.data;
};

export const punchInDoctorVisit = async (
  visitId: number,
  latitude: number,
  longitude: number,
  gpsAccuracyM?: number | null,
  locationExceptionId?: number | null
): Promise<DoctorVisitSession> => {
  const body = {
    device_timestamp: new Date().toISOString(),
    latitude,
    longitude,
    gps_accuracy_m: gpsAccuracyM,
    location_exception_id: locationExceptionId,
  };
  return executeOrQueueMutation({
    body,
    execute: async (operationId) => {
      const response = await api.post<DoctorVisitSession>(
        `/doctor-visits/${visitId}/punch-in`,
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
    operationType: "doctor_visit_punch_in",
    targetId: visitId,
  });
};

export const punchOutDoctorVisit = async (
  visitId: number,
  request: {
    latitude: number;
    longitude: number;
    remarks: string | null;
    gps_accuracy_m?: number | null;
    location_exception_id?: number | null;
  }
): Promise<DoctorVisitSession> => {
  const body = {
    ...request,
    device_timestamp: new Date().toISOString(),
  };
  return executeOrQueueMutation({
    body,
    execute: async (operationId) => {
      const response = await api.post<DoctorVisitSession>(
        `/doctor-visits/${visitId}/punch-out`,
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
    operationType: "doctor_visit_punch_out",
    targetId: visitId,
  });
};

export const getTodayCompletedDoctorVisits = async (): Promise<
  DoctorVisitExpenseOption[]
> => {
  const response = await api.get<DoctorVisitExpenseOption[]>(
    "/doctor-visits/today/completed",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const createTreatmentPlan = async (
  request: CreateTreatmentPlanRequest
): Promise<TreatmentPlan> => {
  const response = await api.post<TreatmentPlan>(
    "/treatment-plans/",
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const resubmitTreatmentPlan = async (
  planId: number,
  request: ResubmitTreatmentPlanRequest
): Promise<TreatmentPlan> => {
  const response = await api.put<TreatmentPlan>(
    `/treatment-plans/${planId}/resubmit`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getPendingTreatmentPlans = async (): Promise<
  TreatmentPlan[]
> => {
  const response = await api.get<TreatmentPlan[]>(
    "/treatment-plans/pending",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getApprovedTreatmentPlans = async (): Promise<
  TreatmentPlan[]
> => {
  const response = await api.get<TreatmentPlan[]>(
    "/treatment-plans/approved",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const approveTreatmentPlan = async (
  planId: number
): Promise<TreatmentPlan> => {
  const response = await api.put<TreatmentPlan>(
    `/treatment-plans/${planId}/approve`,
    {},
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const rejectTreatmentPlan = async (
  planId: number,
  reason: string
): Promise<TreatmentPlan> => {
  const response = await api.put<TreatmentPlan>(
    `/treatment-plans/${planId}/reject`,
    { reason },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const createScheduleFromTreatmentPlan = async (
  planId: number,
  request: TreatmentPlanScheduleRequest
): Promise<unknown[]> => {
  const response = await api.post<unknown[]>(
    `/treatment-plans/${planId}/create-schedule`,
    request,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getTherapistsForTreatmentPlan = async (): Promise<
  TherapistResponse[]
> => {
  const response = await api.get<TherapistResponse[]>("/therapists", {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

const appendProof = (
  formData: FormData,
  proof: DoctorProofAsset | null
): void => {
  if (!proof) {
    return;
  }

  formData.append(
    "proof_file",
    {
      name: proof.name,
      type: proof.mimeType,
      uri: proof.uri,
    } as unknown as Blob
  );
};

const buildExpenseFormData = (
  request: SaveDoctorExpenseRequest
): FormData => {
  const formData = new FormData();
  formData.append("expense_date", request.expense_date);
  if (request.visit_id !== null) {
    formData.append("visit_id", String(request.visit_id));
  }
  if (request.from_location) {
    formData.append("from_location", request.from_location);
  }
  if (request.to_location) {
    formData.append("to_location", request.to_location);
  }
  formData.append("transport_mode", request.transport_mode);
  if (request.fare !== null) {
    formData.append("fare", String(request.fare));
  }
  formData.append("remarks", request.remarks);
  formData.append("expense_category", request.expense_category);
  if (request.manual_reason) {
    formData.append("manual_reason", request.manual_reason);
  }
  if (request.correction_reason) {
    formData.append("correction_reason", request.correction_reason);
  }
  if (request.version !== undefined) {
    formData.append("version", String(request.version));
  }
  appendProof(formData, request.proof_file);
  return formData;
};

export const getTodayDoctorExpenses = async (): Promise<
  DoctorExpense[]
> => {
  const response = await api.get<DoctorExpense[]>(
    "/doctor-expenses/today",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getMyDoctorExpenses = async (): Promise<DoctorExpense[]> => {
  const response = await api.get<DoctorExpense[]>(
    "/doctor-expenses/my",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const createDoctorExpense = async (
  request: SaveDoctorExpenseRequest
): Promise<DoctorExpense> => {
  const response = await api.post<DoctorExpense>(
    "/doctor-expenses/",
    buildExpenseFormData(request),
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const updateDoctorExpense = async (
  expenseId: number,
  request: SaveDoctorExpenseRequest
): Promise<DoctorExpense> => {
  const response = await api.put<DoctorExpense>(
    `/doctor-expenses/${expenseId}`,
    buildExpenseFormData(request),
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const deleteDoctorExpense = async (
  expenseId: number
): Promise<void> => {
  await api.delete(`/doctor-expenses/${expenseId}`, {
    headers: await getAuthHeaders(),
  });
};

export const listManualDoctorExpenseReviews = async (
  status = "pending"
): Promise<DoctorExpense[]> => {
  const response = await api.get<DoctorExpense[]>(
    "/doctor-expenses/manual-review",
    { headers: await getAuthHeaders(), params: { status } }
  );
  return response.data;
};

export const decideManualDoctorExpense = async (
  expenseId: number,
  payload: {
    decision: "approved" | "changes_requested";
    reason: string;
    version: number;
    approved_amount?: number;
  }
): Promise<DoctorExpense> => {
  const response = await api.put<DoctorExpense>(
    `/doctor-expenses/manual-review/${expenseId}/decision`,
    payload,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getManualDoctorExpenseReviewHistory = async (
  expenseId: number
): Promise<ManualDoctorExpenseReviewEvent[]> => {
  const response = await api.get<ManualDoctorExpenseReviewEvent[]>(
    `/doctor-expenses/${expenseId}/review-history`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getMyDoctorClaims = async (): Promise<DoctorClaim[]> => {
  const response = await api.get<DoctorClaim[]>("/doctor-claims/my", {
    headers: await getAuthHeaders(),
  });
  return response.data;
};

export const getPendingDoctorClaims = async (): Promise<
  DoctorClaim[]
> => {
  const response = await api.get<DoctorClaim[]>(
    "/doctor-claims/pending",
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const getDoctorClaimDashboard =
  async (): Promise<DoctorClaimDashboard> => {
    const response = await api.get<DoctorClaimDashboard>(
      "/doctor-claims/dashboard",
      { headers: await getAuthHeaders() }
    );
    return response.data;
  };

export const getAdminDoctorClaimHistory = async (
  filters: DoctorClaimFilters = {}
): Promise<AdminDoctorClaim[]> => {
  const response = await api.get<AdminDoctorClaim[]>(
    "/doctor-claims/admin/history",
    {
      headers: await getAuthHeaders(),
      params: withoutEmptyValues(filters),
    }
  );
  return response.data;
};

export const getDoctorClaim = async (
  claimId: number
): Promise<DoctorClaimDetails> => {
  const response = await api.get<DoctorClaimDetails>(
    `/doctor-claims/${claimId}`,
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const submitDoctorClaim =
  async (): Promise<DoctorClaimDetails> => {
    return executeOrQueueMutation({
      body: {},
      execute: async (operationId) => {
        const response = await api.post<DoctorClaimDetails>(
          "/doctor-claims/submit",
          {},
          {
            headers: {
              ...(await getAuthHeaders()),
              "X-Idempotency-Key": operationId,
            },
          }
        );
        return response.data;
      },
      operationType: "doctor_claim_submit",
    });
  };

export const approveDoctorClaim = async (
  claimId: number
): Promise<DoctorClaim> => {
  const response = await api.put<DoctorClaim>(
    `/doctor-claims/${claimId}/approve`,
    {},
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

export const rejectDoctorClaim = async (
  claimId: number,
  rejectionReason: string
): Promise<DoctorClaim> => {
  const response = await api.put<DoctorClaim>(
    `/doctor-claims/${claimId}/reject`,
    { rejection_reason: rejectionReason },
    { headers: await getAuthHeaders() }
  );
  return response.data;
};

const getProofExtension = (proofName: string): string => {
  const match = proofName.toLowerCase().match(/\.(pdf|jpe?g|png)$/);
  return match?.[0] ?? "";
};

export const getDoctorClaimReadiness =
  async (): Promise<DoctorClaimReadiness> => {
    const response = await api.get<DoctorClaimReadiness>(
      "/doctor-claims/preview",
      { headers: await getAuthHeaders() }
    );
    return response.data;
  };

export const downloadDoctorExpenseProof = async (
  expenseId: number,
  proofName: string
): Promise<File> => {
  const destination = new File(
    Paths.cache,
    `doctor-expense-${expenseId}-proof${getProofExtension(proofName)}`
  );
  const downloadedFile = await File.downloadFileAsync(
    `${appConfig.apiUrl}/doctor-expenses/${expenseId}/proof`,
    destination,
    { headers: await getAuthHeaders(), idempotent: true }
  );
  return new File(downloadedFile.uri);
};

export const downloadDoctorClaimProof = async (
  claimId: number,
  expenseId: number,
  proofName: string
): Promise<File> => {
  const destination = new File(
    Paths.cache,
    `doctor-claim-${claimId}-expense-${expenseId}-proof${getProofExtension(
      proofName
    )}`
  );
  const downloadedFile = await File.downloadFileAsync(
    `${appConfig.apiUrl}/doctor-claims/${claimId}/proof/${expenseId}`,
    destination,
    {
      headers: await getAuthHeaders(),
      idempotent: true,
    }
  );
  return new File(downloadedFile.uri);
};

const toDashboardNumber = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 0;

  return Number.isFinite(parsed) ? parsed : 0;
};

export const getDoctorDashboardSummary =
  async (): Promise<DoctorDashboardSummary> => {
    const [
      consultations,
      visits,
      treatmentPlans,
      expenses,
      claims,
    ] = await Promise.all([
      getDoctorConsultationDashboard(),
      getDoctorVisitDashboard(),
      getMyTreatmentPlans(),
      getTodayDoctorExpenses(),
      getDoctorClaimDashboard(),
    ]);

    return {
      pending_claims: toDashboardNumber(claims.pending_claims),
      pending_treatment_plans: treatmentPlans.filter(
        (plan) => plan.status?.toLowerCase() === "submitted"
      ).length,
      today_consultations: toDashboardNumber(
        consultations.today_calls
      ),
      today_expenses: expenses.length,
      today_visits: toDashboardNumber(visits.today_visits),
    };
  };
