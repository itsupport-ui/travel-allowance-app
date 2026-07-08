import api from "./api"

const authConfig = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
})

export async function getDoctorDashboardSummary(token) {
  const [
    consultationsResponse,
    visitsResponse,
    treatmentPlansResponse,
    expensesResponse,
    claimsResponse,
  ] = await Promise.all([
    api.get("/doctor-consultations/dashboard", authConfig(token)),
    api.get("/doctor-visits/dashboard", authConfig(token)),
    api.get("/treatment-plans/my", authConfig(token)),
    api.get("/doctor-expenses/today", authConfig(token)),
    api.get("/doctor-claims/dashboard", authConfig(token)),
  ])

  const treatmentPlans = Array.isArray(treatmentPlansResponse.data)
    ? treatmentPlansResponse.data
    : []
  const expenses = Array.isArray(expensesResponse.data)
    ? expensesResponse.data
    : []

  return {
    today_consultations: consultationsResponse.data?.today_calls ?? 0,
    today_visits: visitsResponse.data?.today_visits ?? 0,
    pending_treatment_plans: treatmentPlans.filter(
      (plan) => plan.status === "submitted",
    ).length,
    today_expenses: expenses.length,
    pending_claims: claimsResponse.data?.pending_claims ?? 0,
  }
}
