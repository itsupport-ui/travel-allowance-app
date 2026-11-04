import axios from "axios"

import { API_URL } from "./api"

// A dedicated client: the freelancer has no login, so there is no bearer
// token and no 401 redirect behaviour.
const publicApi = axios.create({ baseURL: API_URL })

const path = (token, suffix = "") =>
  `/public/visits/${encodeURIComponent(token)}${suffix}`

const toFormData = (fields) => {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, value)
    }
  })
  return formData
}

export const getPublicVisit = async (token) => {
  const response = await publicApi.get(path(token))
  return response.data
}

export const startPublicVisit = async (token, fields) => {
  const response = await publicApi.post(path(token, "/start"), toFormData(fields))
  return response.data
}

export const finishPublicVisit = async (token, fields, photo) => {
  const formData = toFormData(fields)
  formData.append("photo", photo)
  const response = await publicApi.post(path(token, "/finish"), formData)
  return response.data
}
