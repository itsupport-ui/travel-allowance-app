import { API_URL } from "./api"

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
})

const parseResponse = async (response, fallback) => {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.detail || fallback)
  }
  return data
}

export const getTreatmentSession = async (
  scheduleId,
  token,
  coordinates,
) => {
  const query = coordinates
    ? `?${new URLSearchParams({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        gps_accuracy_m: coordinates.gps_accuracy_m,
        device_timestamp:
          coordinates.device_timestamp || new Date().toISOString(),
      }).toString()}`
    : ""
  const response = await fetch(
    `${API_URL}/treatment-sessions/${scheduleId}${query}`,
    { headers: authHeaders(token) },
  )
  return parseResponse(response, "Failed to verify treatment session")
}

export const punchInTreatment = async (
  scheduleId,
  token,
  coordinates,
) => {
  const response = await fetch(
    `${API_URL}/treatment-sessions/${scheduleId}/punch-in`,
    {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        gps_accuracy_m: coordinates.gps_accuracy_m,
        device_timestamp: new Date().toISOString(),
        location_exception_id: coordinates.location_exception_id || null,
      }),
    },
  )
  return parseResponse(response, "Failed to punch in")
}

export const punchOutTreatment = async (
  scheduleId,
  token,
  payload,
) => {
  const formData = new FormData()
  formData.append("completion_notes", payload.completion_notes || "")
  formData.append("transport_mode", payload.transport_mode || "vehicle")
  formData.append("latitude", payload.latitude)
  formData.append("longitude", payload.longitude)
  formData.append("device_timestamp", new Date().toISOString())
  if (payload.gps_accuracy_m) {
    formData.append("gps_accuracy_m", payload.gps_accuracy_m)
  }
  if (payload.location_exception_id) {
    formData.append("location_exception_id", payload.location_exception_id)
  }

  if (payload.bill_amount !== null && payload.bill_amount !== undefined) {
    formData.append("bill_amount", payload.bill_amount)
  }
  if (payload.invoice_file) {
    formData.append("invoice_file", payload.invoice_file)
  }

  const response = await fetch(
    `${API_URL}/treatment-sessions/${scheduleId}/punch-out`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: formData,
    },
  )
  return parseResponse(response, "Failed to punch out")
}
