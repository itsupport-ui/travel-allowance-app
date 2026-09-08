import api from "./api"


const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
})


export const getEarlyWorkdayClosures = async (
  status,
  role,
  token,
) => {
  const response = await api.get(
    "/workday-exceptions/early-closures",
    {
      ...authConfig(token),
      params: { status, role },
    },
  )
  return response.data
}


export const decideEarlyWorkdayClosure = async (
  staffRole,
  workdayId,
  payload,
  token,
) => {
  const response = await api.put(
    `/workday-exceptions/early-closures/${staffRole}/${workdayId}/decision`,
    payload,
    authConfig(token),
  )
  return response.data
}
