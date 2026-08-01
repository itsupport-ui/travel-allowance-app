import api from "./api"
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

export const cancelAdminSchedule = async (scheduleId) => {
  const response = await api.put(
    `/admin-schedules/${scheduleId}/cancel`,
    null,
    authConfig(),
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
