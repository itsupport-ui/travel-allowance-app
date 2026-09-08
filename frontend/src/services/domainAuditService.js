import api from "./api"
import { authConfig } from "./http"


export const getDomainAuditEvents = async (params = {}) => {
  const response = await api.get(
    "/audit-events/",
    authConfig(params),
  )
  return response.data
}
