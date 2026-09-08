import api from "./api"


const authConfig = (token, config = {}) => ({
  ...config,
  headers: {
    ...config.headers,
    Authorization: `Bearer ${token}`,
  },
})


export const getDoctorConsultations = async (token, filters = {}) => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "")
  )
  const response = await api.get(
    "/doctor-consultations/",
    authConfig(token, { params })
  )
  return response.data
}


export const getMyDoctorConsultations = async (token) => {
  const response = await api.get(
    "/doctor-consultations/my",
    authConfig(token)
  )
  return response.data
}


export const getDoctorConsultation = async (consultationId, token) => {
  const response = await api.get(
    `/doctor-consultations/${consultationId}`,
    authConfig(token)
  )
  return response.data
}


export const getDoctorConsultationHistory = async (
  consultationId,
  token
) => {
  const response = await api.get(
    `/doctor-consultations/${consultationId}/history`,
    authConfig(token)
  )
  return response.data
}


export const cancelDoctorConsultation = async (
  consultationId,
  payload,
  token
) => {
  const response = await api.put(
    `/doctor-consultations/${consultationId}/cancel`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const rescheduleDoctorConsultation = async (
  consultationId,
  payload,
  token
) => {
  const response = await api.post(
    `/doctor-consultations/${consultationId}/reschedule`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const scheduleDoctorConsultationFollowUp = async (
  consultationId,
  payload,
  token
) => {
  const response = await api.post(
    `/doctor-consultations/${consultationId}/schedule-follow-up`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const completeDoctorConsultation = async (
  consultationId,
  payload,
  token
) => {
  const response = await api.put(
    `/doctor-consultations/${consultationId}/complete`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const createDoctorConsultation = async (payload, token) => {
  const response = await api.post(
    "/doctor-consultations/",
    payload,
    authConfig(token)
  )
  return response.data
}


export const confirmDoctorConsultation = async (
  consultationId,
  token,
  lifecycleVersion = null
) => {
  const response = await api.put(
    `/doctor-consultations/${consultationId}/confirm`,
    lifecycleVersion == null
      ? {}
      : { lifecycle_version: lifecycleVersion },
    authConfig(token)
  )
  return response.data
}


export const rejectDoctorConsultation = async (
  consultationId,
  rejectionReason,
  token,
  lifecycleVersion = null
) => {
  const response = await api.put(
    `/doctor-consultations/${consultationId}/reject`,
    {
      rejection_reason: rejectionReason,
      ...(lifecycleVersion == null
        ? {}
        : { lifecycle_version: lifecycleVersion }),
    },
    authConfig(token)
  )
  return response.data
}


export const createVisitFromConsultation = async (
  consultationId,
  payload,
  token
) => {
  const response = await api.post(
    `/doctor-consultations/${consultationId}/create-visit`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const getConsultationDoctors = async (token) => {
  const response = await api.get(
    "/doctors/",
    authConfig(token)
  )
  return response.data
}
