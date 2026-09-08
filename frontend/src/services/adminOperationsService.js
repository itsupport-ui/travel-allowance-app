import api from "./api"
import { waitForReportExportJob } from "./reportExportJob"
import { authConfig } from "./http"

export const getAdminSchedules = async (params) => {
  const response = await api.get(
    "/admin-schedules/review",
    authConfig(params),
  )
  return response.data
}

export const getScheduleFormOptions = async () => {
  const response = await api.get(
    "/admin-schedules/form-options",
    authConfig(),
  )
  return response.data
}

export const getTherapistAvailability = async (params) => {
  const response = await api.get(
    "/admin-schedules/therapist-availability",
    authConfig(params),
  )
  return response.data
}

export const cancelAdminSchedule = async (scheduleId, scope = "this") => {
  const response = await api.put(
    `/admin-schedules/${scheduleId}/cancel`,
    null,
    authConfig({ scope }),
  )
  return response.data
}

export const getAdminClaimReview = async (params) => {
  const response = await api.get(
    "/admin-claims/review",
    authConfig(params),
  )
  return response.data
}

export const getAdminReportOverview = async (params) => {
  const response = await api.get(
    "/admin-reports/overview",
    authConfig(params),
  )
  return response.data
}

export const previewClaimRegister = async (params) => {
  const response = await api.post(
    "/reports/preview",
    {
      report_type: params.report_type || "consolidated_claims",
      from_date: params.from_date || null,
      to_date: params.to_date || null,
      status: params.status || "all",
      role: params.role || "all",
      therapist_id: params.therapist_id
        ? Number(params.therapist_id)
        : null,
      doctor_id: params.doctor_id
        ? Number(params.doctor_id)
        : null,
    },
    authConfig(),
  )
  return response.data
}

export const downloadClaimSnapshot = async (snapshotId, format) => {
  const job = await api.post(
    "/reports/exports",
    {
      snapshot_id: snapshotId,
      format,
      idempotency_key: `${snapshotId}:${format}`,
    },
    authConfig(),
  )
  const readyJob = await waitForReportExportJob(api, job.data, authConfig())
  return api.get(
    readyJob.download_url,
    {
      ...authConfig(),
      responseType: "blob",
    },
  )
}
