import api from "./api"


const authConfig = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
})


export const createTreatmentPlan = async (payload, token) => {
  const response = await api.post(
    "/treatment-plans/",
    payload,
    authConfig(token)
  )
  return response.data
}


export const getMyTreatmentPlans = async (token) => {
  const response = await api.get(
    "/treatment-plans/my",
    authConfig(token)
  )
  return response.data
}


export const getTreatmentPlan = async (planId, token) => {
  const response = await api.get(
    `/treatment-plans/${planId}`,
    authConfig(token)
  )
  return response.data
}


export const getPendingTreatmentPlans = async (token) => {
  const response = await api.get(
    "/treatment-plans/pending",
    authConfig(token)
  )
  return response.data
}


export const getApprovedTreatmentPlans = async (token) => {
  const response = await api.get(
    "/treatment-plans/approved",
    authConfig(token)
  )
  return response.data
}


export const approveTreatmentPlan = async (planId, token) => {
  const response = await api.put(
    `/treatment-plans/${planId}/approve`,
    {},
    authConfig(token)
  )
  return response.data
}


export const rejectTreatmentPlan = async (
  planId,
  reason,
  token
) => {
  const response = await api.put(
    `/treatment-plans/${planId}/reject`,
    { reason },
    authConfig(token)
  )
  return response.data
}


export const resubmitTreatmentPlan = async (planId, payload, token) => {
  const response = await api.put(
    `/treatment-plans/${planId}/resubmit`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const createScheduleFromTreatmentPlan = async (
  planId,
  payload,
  token
) => {
  const response = await api.post(
    `/treatment-plans/${planId}/create-schedule`,
    payload,
    authConfig(token)
  )
  return response.data
}


export const getTherapistsForTreatmentPlan = async (token) => {
  const response = await api.get(
    "/therapists",
    authConfig(token)
  )
  return response.data
}
