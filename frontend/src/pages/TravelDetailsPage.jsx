import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import toast from "react-hot-toast"
import TherapistLayout from "../layouts/TherapistLayout"
import { getTravelById, openTravelInvoice } from "../services/travelService"

function TravelDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [travel, setTravel] = useState(null)

  useEffect(() => {
    const fetchTravel = async () => {
      try {
        const token = localStorage.getItem("token")
        const data = await getTravelById(id, token)
        setTravel(data)
      } catch {
        toast.error("Failed to load travel details")
        navigate("/travel/today", { replace: true })
      }
    }

    fetchTravel()
  }, [id, navigate])

  if (!travel) return null

  const isVehicle = travel.transport_mode?.toLowerCase() === "vehicle"

  const handleInvoice = async () => {
    try {
      const token = localStorage.getItem("token")
      await openTravelInvoice(travel.id, token)
    } catch {
      toast.error("Failed to open invoice")
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-4xl mx-auto px-1 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
              Travel Details
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Travel entries are read-only after creation.
            </p>
          </div>
          <button
            onClick={() => navigate("/travel/today")}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            Back to Today's Travel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 border-b border-gray-100 p-5 sm:p-6">
            <Detail label="Date" value={travel.travel_date} />
            <Detail label="Patient" value={travel.patient_name || "N/A"} />
            <Detail label="Transport" value={travel.transport_mode || "N/A"} capitalize />
            <Detail label="Status" value={travel.status || "N/A"} capitalize />
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <Detail label="From Address" value={travel.from_address} />
              <Detail label="To Address" value={travel.to_address} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 border-t border-gray-100 pt-6">
              <Detail label="Distance" value={`${travel.total_km} KM`} />
              <Detail label="Per KM Rate" value={`₹${travel.per_km_rate}`} />
              <Detail label="Travel Fare" value={`₹${travel.travel_fare}`} />
              <Detail
                label="Patient Visited"
                value={travel.patient_visited ? "Yes" : "No"}
              />
            </div>

            {!isVehicle && (
              <div className="grid sm:grid-cols-2 gap-5 border-t border-gray-100 pt-6">
                <Detail
                  label="Bill Amount"
                  value={`₹${travel.bill_amount ?? 0}`}
                />
                <div>
                  <span className="text-xs text-gray-400 block font-medium uppercase mb-1">
                    Invoice
                  </span>
                  {travel.invoice_file ? (
                    <button
                      type="button"
                      onClick={handleInvoice}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      View Invoice
                    </button>
                  ) : (
                    <span className="text-gray-800 font-semibold">N/A</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TherapistLayout>
  )
}

function Detail({ label, value, capitalize = false }) {
  return (
    <div>
      <span className="text-xs text-gray-400 block font-medium uppercase mb-1">
        {label}
      </span>
      <span className={`text-gray-800 font-semibold break-words ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </div>
  )
}

export default TravelDetailsPage
