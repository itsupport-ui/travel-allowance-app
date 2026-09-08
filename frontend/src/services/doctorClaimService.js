import api from "./api"


const authConfig = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
})


export const submitDoctorClaim = async (token) => {
  const response = await api.post(
    "/doctor-claims/submit",
    {},
    authConfig(token)
  )
  return response.data
}


export const getDoctorClaimPreview = async (token) => {
  const response = await api.get(
    "/doctor-claims/preview",
    authConfig(token)
  )
  return response.data
}


export const getMyDoctorClaims = async (token) => {
  const response = await api.get(
    "/doctor-claims/my",
    authConfig(token)
  )
  return response.data
}


export const getDoctorClaim = async (claimId, token) => {
  const response = await api.get(
    `/doctor-claims/${claimId}`,
    authConfig(token)
  )
  return response.data
}


export const getPendingDoctorClaims = async (token) => {
  const response = await api.get(
    "/doctor-claims/pending",
    authConfig(token)
  )
  return response.data
}


export const getAdminDoctorClaimHistory = async (
  token,
  filters = {}
) => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "")
  )
  const response = await api.get(
    "/doctor-claims/admin/history",
    {
      ...authConfig(token),
      params,
    }
  )
  return response.data
}


export const downloadDoctorClaimProof = async (
  claimId,
  expenseId,
  token
) => {
  const response = await api.get(
    `/doctor-claims/${claimId}/proof/${expenseId}`,
    {
      ...authConfig(token),
      responseType: "blob",
    }
  )
  const disposition = response.headers["content-disposition"] || ""
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i)
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : filenameMatch?.[1] || `expense-${expenseId}-proof`

  return {
    blob: response.data,
    filename,
  }
}


export const approveDoctorClaim = async (claimId, token) => {
  const response = await api.put(
    `/doctor-claims/${claimId}/approve`,
    {},
    authConfig(token)
  )
  return response.data
}


export const rejectDoctorClaim = async (
  claimId,
  rejectionReason,
  token
) => {
  const response = await api.put(
    `/doctor-claims/${claimId}/reject`,
    { rejection_reason: rejectionReason },
    authConfig(token)
  )
  return response.data
}


export const getDoctorsForClaims = async (token) => {
  const response = await api.get(
    "/doctors/",
    authConfig(token)
  )
  return response.data
}
