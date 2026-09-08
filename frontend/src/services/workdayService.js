import { API_URL } from "./api";

export const startWorkDay = async (token, payload) => {
  const response = await fetch(
    `${API_URL}/therapist/workday/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || "Failed to start work day")
  }

  return response.json()
}

export const getTodayWorkDay = async (token) => {
  const response = await fetch(
    `${API_URL}/therapist/workday/today`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || "Failed to load workday")
  }
  return response.json()
}

export const endWorkDay = async (token, coordinates) => {
  const response = await fetch(
    `${API_URL}/therapist/workday/end`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        end_latitude: coordinates.latitude,
        end_longitude: coordinates.longitude,
        device_timestamp: new Date().toISOString(),
        early_end_reason: coordinates.earlyEndReason || null,
      }),
    },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || "Failed to end workday")
  }
  return response.json()
}

const doctorRequest = async (path, token, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || "Doctor attendance request failed")
  }
  return response.json()
}

export const getTodayDoctorWorkDay = (token) =>
  doctorRequest("/doctor/workday/today", token)

export const startDoctorWorkDay = (token, payload) =>
  doctorRequest("/doctor/workday/start", token, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      device_timestamp: new Date().toISOString(),
    }),
  })

export const endDoctorWorkDay = (token, payload) =>
  doctorRequest("/doctor/workday/end", token, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      device_timestamp: new Date().toISOString(),
    }),
  })
