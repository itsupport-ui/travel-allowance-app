import api
from "./api"

export const getSettings =
  async (token) => {

    const response =
      await api.get(
        "/settings",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const updateSettings =
  async (
    settingsData,
    token
  ) => {

    const response =
      await api.put(
        "/settings",
        settingsData,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const getReimbursementPolicyHistory = async (token) => {
  const response = await api.get("/settings/reimbursement-policy/history", {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 20 },
  })
  return response.data
}

export const getLocationPolicy = async (token) => {
  const response = await api.get("/settings/location-policy", {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

export const getLocationPolicyHistory = async (token) => {
  const response = await api.get("/settings/location-policy/history", {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 20 },
  })
  return response.data
}

export const updateLocationPolicy = async (payload, token) => {
  const response = await api.put(
    "/settings/location-policy",
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return response.data
}
