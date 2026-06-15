import api from "./api"

export const getDashboardSummary =
  async (token) => {

    const response =
      await api.get(
        "/dashboard/summary",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}