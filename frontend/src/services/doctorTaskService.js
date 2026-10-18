import api from "./api"
import { authConfig } from "./http"

// ---- places ---------------------------------------------------------------
export const getPlaces = async () => {
  const response = await api.get("/places", authConfig())
  return response.data
}

export const createPlace = async (payload) => {
  const response = await api.post("/places", payload, authConfig())
  return response.data
}

export const setPlaceActive = async (placeId, active) => {
  const response = await api.put(`/places/${placeId}`, { active }, authConfig())
  return response.data
}

// ---- assigner -------------------------------------------------------------
export const createDoctorTask = async (payload) => {
  const response = await api.post("/doctor-tasks", payload, authConfig())
  return response.data
}

export const getManagedDoctorTasks = async (params) => {
  const response = await api.get("/doctor-tasks", authConfig(params))
  return response.data
}

export const cancelDoctorTask = async (taskId, reason) => {
  const response = await api.post(
    `/doctor-tasks/${taskId}/cancel`,
    { reason },
    authConfig(),
  )
  return response.data
}

export const fetchTaskProofBlob = async (taskId) => {
  const response = await api.get(`/doctor-tasks/${taskId}/review-proof`, {
    ...authConfig(),
    responseType: "blob",
  })
  return response.data
}

// ---- doctor ---------------------------------------------------------------
export const getMyDoctorTasks = async (scope) => {
  const response = await api.get("/doctor-tasks/my", authConfig({ scope }))
  return response.data
}

export const punchInDoctorTask = async (taskId, payload) => {
  const response = await api.post(
    `/doctor-tasks/${taskId}/punch-in`,
    payload,
    authConfig(),
  )
  return response.data
}

export const punchOutDoctorTask = async (taskId, fields, photo) => {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, String(value))
    }
  })
  formData.append("photo", photo)
  const response = await api.post(
    `/doctor-tasks/${taskId}/punch-out`,
    formData,
    authConfig(),
  )
  return response.data
}

export const getTodayCompletedDoctorTasks = async () => {
  const response = await api.get("/doctor-tasks/today/completed", authConfig())
  return response.data
}

export const getDoctorTaskDaySummary = async () => {
  const response = await api.get("/doctor-tasks/day-summary", authConfig())
  return response.data
}
