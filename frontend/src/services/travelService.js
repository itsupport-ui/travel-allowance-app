import api from "./api"

export const
createTravel =
async (
  travelData,
  token
) => {

  const formData =
    new FormData()

  formData.append(
    "patient_name",
    travelData.patient_name
  )

  formData.append(
    "travel_date",
    travelData.travel_date
  )

  formData.append(
    "from_address",
    travelData.from_address
  )

  formData.append(
    "to_address",
    travelData.to_address
  )

  formData.append(
    "total_km",
    travelData.total_km
  )

  formData.append(
    "patient_visited",
    travelData.patient_visited
  )

  formData.append(
    "transport_mode",
    travelData.transport_mode
  )

  if (
    travelData.bill_amount
    !== null
  ) {

    formData.append(
      "bill_amount",
      travelData.bill_amount
    )
  }

  if (
    travelData.invoice_file
  ) {

    formData.append(
      "invoice_file",
      travelData.invoice_file
    )
  }

  formData.append(
    "manual_reason",
    travelData.manual_reason
  )

  const response =
    await api.post(
      "/travel",
      formData,
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      }
    )

  return response.data
}

export const updateTravel = async (travelId, travelData, token) => {
  const formData = new FormData()
  Object.entries({
    patient_name: travelData.patient_name || "",
    travel_date: travelData.travel_date,
    from_address: travelData.from_address,
    to_address: travelData.to_address,
    total_km: travelData.total_km,
    patient_visited: travelData.patient_visited,
    transport_mode: travelData.transport_mode,
    manual_reason: travelData.manual_reason,
    correction_reason: travelData.correction_reason,
    version: travelData.version,
  }).forEach(([key, value]) => formData.append(key, value))
  if (travelData.bill_amount !== null) {
    formData.append("bill_amount", travelData.bill_amount)
  }
  if (travelData.invoice_file) {
    formData.append("invoice_file", travelData.invoice_file)
  }
  const response = await api.put(`/travel/${travelId}`, formData, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

export const cancelTravel = async (travelId, token) => {
  const response = await api.delete(`/travel/${travelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

export const getTravelReviewHistory = async (travelId, token) => {
  const response = await api.get(`/travel/${travelId}/review-history`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

export const getManualTravelReviews = async (status, token) => {
  const response = await api.get("/travel/manual-review", {
    headers: { Authorization: `Bearer ${token}` },
    params: { status },
  })
  return response.data
}

export const decideManualTravel = async (travelId, payload, token) => {
  const response = await api.put(
    `/travel/manual-review/${travelId}/decision`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return response.data
}

export const getTodayTravels =
  async (token) => {
    const response =
      await api.get(
        "/travel/today",
        {
          headers: {
            Authorization:
              `Bearer ${token}`
            }
        }
        )

    return response.data

}


export const getTravelById =
    async (
        travelId,
        token
    ) => {
        const response =
            await api.get(
                `/travel/${travelId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            )

        return response.data
    }

export const openTravelInvoice = async (travelId, token) => {
  const response = await api.get(
    `/travel/${travelId}/invoice`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      responseType: "blob"
    }
  )
  const invoiceUrl = URL.createObjectURL(response.data)
  const link = document.createElement("a")
  link.href = invoiceUrl
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(invoiceUrl), 60_000)
}
