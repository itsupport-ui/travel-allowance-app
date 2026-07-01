const API_URL =
  "http://127.0.0.1:8000/schedule"

export const getDoctors = async (token) => {
  const response =
    await fetch(
      `http://127.0.0.1:8000/doctors`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch doctors"
    )
  }

  return response.json()
}

export const getTherapists = async (token) => {
  const response =
    await fetch(
      `http://127.0.0.1:8000/therapists`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch therapists"
    )
  }

  return response.json()
}

export const createSchedule =
async (
  payload,
  token
) => {
  const response =
    await fetch(
      `${API_URL}/create`,
      {
        method: "POST",
        headers: {
          "Content-Type":
          "application/json",
          Authorization:
          `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to create schedule"
    )
  }

  return response.json()
}

export const getTodaySchedules =
async (token) => {

  const response =
    await fetch(
      `${API_URL}/my-today`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch schedules"
    )
  }

  return response.json()
}

export const completeSchedule =
async (
  scheduleId,
  completionData,
  token,
  arrivalLocation = {}
) => {
  const payload =
    typeof completionData === "object"
      ? completionData
      : { completion_notes: completionData, ...arrivalLocation }

  const formData = new FormData()

  formData.append(
    "completion_notes",
    payload.completion_notes || ""
  )

  formData.append(
    "transport_mode",
    payload.transport_mode || "vehicle"
  )

  if (payload.arrival_latitude !== undefined && payload.arrival_latitude !== null) {
    formData.append("arrival_latitude", payload.arrival_latitude)
  }

  if (payload.arrival_longitude !== undefined && payload.arrival_longitude !== null) {
    formData.append("arrival_longitude", payload.arrival_longitude)
  }

  if (payload.bill_amount !== undefined && payload.bill_amount !== null) {
    formData.append("bill_amount", payload.bill_amount)
  }

  if (payload.invoice_file) {
    formData.append("invoice_file", payload.invoice_file)
  }

  const response =
    await fetch(
      `${API_URL}/${scheduleId}/complete`,
      {
        method: "PUT",

        headers: {
          Authorization:
          `Bearer ${token}`
        },

        body: formData
      }
    )

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(
      error?.detail || "Failed to complete schedule"
    )
  }

  return response.json()
}

export const missedSchedule =
async (
  scheduleId,
  reason,
  token
) => {

  const response =
    await fetch(
      `${API_URL}/${scheduleId}/missed`,
      {
        method: "PUT",

        headers: {
          "Content-Type":
          "application/json",

          Authorization:
          `Bearer ${token}`
        },

        body: JSON.stringify({
          missed_reason:
          reason
        })
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to mark missed"
    )
  }

  return response.json()
}


export const getUpcomingSchedules =
async (token) => {

  const response =
    await fetch(
      `${API_URL}/my-upcoming`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch schedules"
    )
  }

  return response.json()
}


export const getMyDashboard =
async (token) => {

  const response =
    await fetch(
      `${API_URL}/my-dashboard`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch dashboard"
    )
  }

  return response.json()
}

export const getDashboardSummary =
async (token) => {

  const response =
    await fetch(
      `${API_URL}/dashboard-summary`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch dashboard"
    )
  }

  return response.json()
}


export const getTodayAdminSchedules =
async (token) => {
    const response =
    await fetch(
      `${API_URL}/today`,
      {
        headers: {
          Authorization:
          `Bearer ${token}`
        }
      }
    )

    if (!response.ok) {
        throw new Error(
            "Failed to fetch today's schedules"
        )
    }

    return response.json()
}


export const getScheduleDetails = async (
  schedule_id,
  token
) => {

  const response = await fetch(
    `${API_URL}/${schedule_id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  if (!response.ok) {
    throw new Error(
      "Failed to load schedule"
    )
  }

  return response.json()
}


export const updateSchedule = async (
  scheduleId,
  payload,
  token
) => {

  const response = await fetch(
    `${API_URL}/${scheduleId}`,
    {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },

      body: JSON.stringify(payload)
    }
  )

  if (!response.ok) {
    const error = await response.json()
    console.error(error)

    throw new Error(
      "Failed to update schedule"
    )
  }

  return response.json()
}

export const getPendingSchedules = async (token) => {
  const response = await fetch(
    `${API_URL}/pending`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch pending schedules"
    )
  }
  return response.json()
}


export const getCompletedSchedules = async (token) => {
  const response = await fetch(`${API_URL}/completed`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const error = await response.text()
    console.log("Completed error:", response.status, error)
    throw new Error("Failed to fetch completed schedules")
  }

  return await response.json()
}


export const getMissedSchedules = async (token) => {
  const response = await fetch(
    `${API_URL}/missed`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  if (!response.ok) {
    throw new Error(
      "Failed to fetch missed schedules"
    )
  }
  return response.json()

}
