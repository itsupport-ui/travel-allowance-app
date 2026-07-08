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
