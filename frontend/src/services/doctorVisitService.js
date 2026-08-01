import api from "./api"


const authConfig = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
})


export const getMyDoctorVisits = async (token) => {
  const response = await api.get(
    "/doctor-visits/my",
    authConfig(token)
  )
  return response.data
}


export const getDoctorVisit = async (visitId, token) => {
  const response = await api.get(
    `/doctor-visits/${visitId}`,
    authConfig(token)
  )
  return response.data
}


export const updateDoctorVisitStatus = async (
  visitId,
  payload,
  token
) => {
  const response = await api.put(
    `/doctor-visits/${visitId}/status`,
    payload,
    authConfig(token)
  )
  return response.data
}

export const getDoctorVisitSession = async (
  visitId,
  token,
  coordinates
) => {
  const response = await api.get(
    `/doctor-visits/${visitId}/session`,
    {
      ...authConfig(token),
      params: coordinates || undefined,
    }
  )
  return response.data
}

export const punchInDoctorVisit = async (
  visitId,
  coordinates,
  token
) => {
  const response = await api.post(
    `/doctor-visits/${visitId}/punch-in`,
    {
      ...coordinates,
      device_timestamp: new Date().toISOString(),
    },
    authConfig(token)
  )
  return response.data
}

export const punchOutDoctorVisit = async (
  visitId,
  payload,
  token
) => {
  const response = await api.post(
    `/doctor-visits/${visitId}/punch-out`,
    {
      ...payload,
      device_timestamp: new Date().toISOString(),
    },
    authConfig(token)
  )
  return response.data
}

export const getTodayCompletedDoctorVisits = async (token) => {
  const response = await api.get(
    "/doctor-visits/today/completed",
    authConfig(token)
  )
  return response.data
}
