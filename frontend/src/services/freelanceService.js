import api from "./api"
import { authConfig } from "./http"

// ---- directory -------------------------------------------------------------
export const getFreelancers = async (params) => {
  const response = await api.get("/freelancers", authConfig(params))
  return response.data
}

export const createFreelancer = async (payload) => {
  const response = await api.post("/freelancers", payload, authConfig())
  return response.data
}

export const updateFreelancer = async (freelancerId, payload) => {
  const response = await api.put(
    `/freelancers/${freelancerId}`,
    payload,
    authConfig(),
  )
  return response.data
}

// ---- visits ----------------------------------------------------------------
export const createFreelanceVisit = async (payload) => {
  const response = await api.post("/freelance-visits", payload, authConfig())
  return response.data
}

export const getFreelanceVisits = async (params) => {
  const response = await api.get("/freelance-visits", authConfig(params))
  return response.data
}

export const cancelFreelanceVisit = async (visitId, reason) => {
  const response = await api.post(
    `/freelance-visits/${visitId}/cancel`,
    { reason },
    authConfig(),
  )
  return response.data
}

export const reassignFreelanceVisit = async (visitId, payload) => {
  const response = await api.post(
    `/freelance-visits/${visitId}/reassign`,
    payload,
    authConfig(),
  )
  return response.data
}

export const issueFreelanceVisitLink = async (visitId) => {
  const response = await api.post(
    `/freelance-visits/${visitId}/new-link`,
    null,
    authConfig(),
  )
  return response.data
}

export const fetchFreelanceProofBlob = async (visitId) => {
  const response = await api.get(`/freelance-visits/${visitId}/proof`, {
    ...authConfig(),
    responseType: "blob",
  })
  return response.data
}

// ---- payouts (admin) -------------------------------------------------------
export const approveFreelanceVisit = async (visitId) => {
  const response = await api.post(
    `/freelance-visits/${visitId}/approve`,
    null,
    authConfig(),
  )
  return response.data
}

export const markFreelanceVisitPaid = async (visitId, paymentReference) => {
  const response = await api.post(
    `/freelance-visits/${visitId}/mark-paid`,
    { payment_reference: paymentReference },
    authConfig(),
  )
  return response.data
}

export const downloadFreelancePayoutsCsv = async (params) => {
  const response = await api.get("/freelance-visits/export", {
    ...authConfig(params),
    responseType: "blob",
  })
  return response.data
}
