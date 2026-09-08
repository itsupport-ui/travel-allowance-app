import api from "./api"
import { authConfig } from "./http"


export const getOperationalFollowUps = async (params = {}) => {
  const response = await api.get("/operational-follow-ups", authConfig(params))
  return response.data
}

export const getOperationalFollowUpAssignees = async () => {
  const response = await api.get("/operational-follow-ups/assignees", authConfig())
  return response.data
}

export const createOperationalFollowUp = async (payload) => {
  const response = await api.post("/operational-follow-ups", payload, authConfig())
  return response.data
}

export const updateOperationalFollowUp = async (id, payload) => {
  const response = await api.put(`/operational-follow-ups/${id}`, payload, authConfig())
  return response.data
}
