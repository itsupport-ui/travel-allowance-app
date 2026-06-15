import api
from "./api"

export const submitClaim =
  async (token) => {

    const response =
      await api.post(
        "/claims/submit",
        {},
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const getMyClaims =
  async (token) => {

    const response =
      await api.get(
        "/claims/my",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}


export const getPendingClaims =
  async (token) => {

    const response =
      await api.get(
        "/claims/pending",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const approveClaim =
  async (
    claimId,
    token
  ) => {

    const response =
      await api.put(
        `/claims/${claimId}/approve`,
        {},
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}


export const getAllClaims =
  async (token) => {
    const response =
      await api.get(
        "/claims/all",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const getClaimById =
  async (
    claimId,
    token
  ) => {

    const response =
      await api.get(
        `/claims/${claimId}/details`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const getClaimDetails =
  async (
    claimId,
    token
  ) => {
    const response =
      await api.get(
        `/claims/${claimId}/details`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}

export const rejectClaim =
  async (
    claimId,
    token
  ) => {

    const response =
      await api.put(
        `/claims/${claimId}/reject`,
        {},
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      )

    return response.data
}


export const
getClaimHistory =
async (token) => {

  const response =
    await api.get(
      "/claims/history",
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      }
    )

  return response.data
}