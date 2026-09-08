import api from "./api"


const authConfig = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
})


const buildExpenseFormData = (payload) => {
  const formData = new FormData()

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value)
    }
  })

  return formData
}


export const createDoctorExpense = async (payload, token) => {
  const response = await api.post(
    "/doctor-expenses/",
    buildExpenseFormData(payload),
    authConfig(token)
  )
  return response.data
}


export const getTodayDoctorExpenses = async (token) => {
  const response = await api.get(
    "/doctor-expenses/today",
    authConfig(token)
  )
  return response.data
}


export const getMyDoctorExpenses = async (token) => {
  const response = await api.get(
    "/doctor-expenses/my",
    authConfig(token)
  )
  return response.data
}


export const updateDoctorExpense = async (
  expenseId,
  payload,
  token
) => {
  const response = await api.put(
    `/doctor-expenses/${expenseId}`,
    buildExpenseFormData(payload),
    authConfig(token)
  )
  return response.data
}


export const deleteDoctorExpense = async (expenseId, token) => {
  await api.delete(
    `/doctor-expenses/${expenseId}`,
    authConfig(token)
  )
}


export const getManualDoctorExpenseReviews = async (status, token) => {
  const response = await api.get("/doctor-expenses/manual-review", {
    ...authConfig(token),
    params: { status },
  })
  return response.data
}


export const decideManualDoctorExpense = async (
  expenseId,
  payload,
  token,
) => {
  const response = await api.put(
    `/doctor-expenses/manual-review/${expenseId}/decision`,
    payload,
    authConfig(token),
  )
  return response.data
}


export const getManualDoctorExpenseHistory = async (
  expenseId,
  token,
) => {
  const response = await api.get(
    `/doctor-expenses/${expenseId}/review-history`,
    authConfig(token),
  )
  return response.data
}


export const openDoctorExpenseProof = async (expenseId, token) => {
  const response = await api.get(
    `/doctor-expenses/${expenseId}/proof`,
    { ...authConfig(token), responseType: "blob" },
  )
  const url = URL.createObjectURL(response.data)
  const link = document.createElement("a")
  link.href = url
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
