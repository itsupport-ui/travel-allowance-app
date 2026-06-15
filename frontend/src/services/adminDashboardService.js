import api
from "./api"

export const getAdminSummary =
  async (token) => {

    const response =
      await api.get(
        "/admin-dashboard/summary",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}