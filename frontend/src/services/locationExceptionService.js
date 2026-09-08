import api from "./api"


const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
})


export const requestLocationException = async (payload, token) => {
  const response = await api.post(
    "/location-exceptions",
    payload,
    authConfig(token),
  )
  return response.data
}


export const getLocationExceptions = async (status, token) => {
  const response = await api.get("/location-exceptions", {
    ...authConfig(token),
    params: { status },
  })
  return response.data
}


export const decideLocationException = async (
  requestId,
  payload,
  token,
) => {
  const response = await api.put(
    `/location-exceptions/${requestId}/decision`,
    payload,
    authConfig(token),
  )
  return response.data
}
