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
