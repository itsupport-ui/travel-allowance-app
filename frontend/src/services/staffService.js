import api from "./api"
import { authConfig } from "./http"

export const getTherapistsForManagement = async () => {
  const response = await api.get("/therapists/manage", authConfig())
  return response.data
}

export const updateTherapist = async (therapistId, payload) => {
  const response = await api.put(
    `/therapists/${therapistId}`,
    payload,
    authConfig(),
  )
  return response.data
}

export const getDoctorsForManagement = async () => {
  const response = await api.get("/doctors/manage", authConfig())
  return response.data
}

export const createDoctorUser = async (payload) => {
  const response = await api.post("/users/doctors", payload, authConfig())
  return response.data
}

export const createDoctorProfile = async (payload) => {
  const response = await api.post("/doctors/", payload, authConfig())
  return response.data
}

export const updateDoctor = async (doctorId, payload) => {
  const response = await api.put(
    `/doctors/${doctorId}`,
    payload,
    authConfig(),
  )
  return response.data
}

export const getStaffDeactivationReadiness = async (staffRole, staffId) => {
  const response = await api.get(
    `/staff/deactivation-readiness/${staffRole}/${staffId}`,
    authConfig(),
  )
  return response.data
}

export const getStaffDeactivationOverrides = async (staffRole, staffId) => {
  const response = await api.get("/staff/deactivation-overrides", {
    ...authConfig(),
    params: {
      status: "all",
      staff_role: staffRole,
      staff_id: staffId,
    },
  })
  return response.data
}

export const requestStaffDeactivationOverride = async (payload) => {
  const response = await api.post(
    "/staff/deactivation-overrides",
    payload,
    authConfig(),
  )
  return response.data
}

export const decideStaffDeactivationOverride = async (
  requestId,
  payload,
) => {
  const response = await api.put(
    `/staff/deactivation-overrides/${requestId}/decision`,
    payload,
    authConfig(),
  )
  return response.data
}
