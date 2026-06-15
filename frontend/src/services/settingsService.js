import api
from "./api"

export const getSettings =
  async (token) => {

    const response =
      await api.get(
        "/settings",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const updateSettings =
  async (
    settingsData,
    token
  ) => {

    const response =
      await api.put(
        "/settings",
        settingsData,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}