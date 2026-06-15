import { useEffect, useState } from "react"
import TherapistLayout from "../layouts/TherapistLayout"
import { getTodayTravels, deleteTravel } from "../services/travelService"
import { useNavigate } from "react-router-dom"
import { submitClaim } from "../services/claimService"
import toast from "react-hot-toast"

function TodayTravelPage() {
  const navigate = useNavigate()
  const [travels, setTravels] = useState([])

  useEffect(() => {
    fetchTravels()
  }, [])

  const fetchTravels = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getTodayTravels(token)
      setTravels(data)
    } catch {
      toast.error("Failed to load travel data")
    }
  }

  const handleDelete = async (travelId) => {
    if (!window.confirm("Are you sure you want to delete this log?")) return
    try {
      const token = localStorage.getItem("token")
      await deleteTravel(travelId, token)
      toast.success("Travel log removed")
      fetchTravels()
    } catch {
      toast.error("Failed to delete travel")
    }
  }

  const handleSubmitClaim = async () => {
    try {
      const token = localStorage.getItem("token")
      await submitClaim(token)
      toast.success("Claim submitted successfully 🚀")
    } catch {
      toast.error("Failed to submit claim")
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-6xl mx-auto px-1 sm:px-4">
        
        {/* Page Title & Main Action Control */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
              Today's Travel
            </h1>
            <p className="text-sm text-gray-500">
              Manage logs and submit your daily travel mileage claims.
            </p>
          </div>
          <button
            onClick={handleSubmitClaim}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg transition dynamic-shadow text-center"
          >
            Submit Claim
          </button>
        </div>

        {/* ==================== 1. MOBILE LOGS STACK (Visible on Mobile/Tablet) ==================== */}
        <div className="lg:hidden space-y-4">
          {travels.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-xl shadow-md text-gray-400 text-sm">
              No travel items recorded for today.
            </div>
          ) : (
            travels.map((travel) => (
              <div 
                key={travel.id} 
                className="bg-white rounded-xl shadow-md border border-gray-100 p-5 space-y-4"
              >
                {/* Mobile Card Header */}
                <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                  <div>
                    <span className="text-xs text-gray-400 block font-medium uppercase">Patient</span>
                    <h3 className="font-bold text-gray-800 text-base">
                      {travel.patient_name || "N/A"}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400 block font-medium uppercase">Date</span>
                    <span className="text-sm font-medium text-gray-600">{travel.travel_date}</span>
                  </div>
                </div>

                {/* Route Visual Timeline Details */}
                <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-[9px] before:top-[6px] before:bottom-[6px] before:w-0.5 before:bg-gray-200">
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-50"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">From</span>
                    <p className="text-sm text-gray-700 break-words font-medium">{travel.from_address}</p>
                  </div>
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-50"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">To</span>
                    <p className="text-sm text-gray-700 break-words font-medium">{travel.to_address}</p>
                  </div>
                </div>

                {/* Core Mobile Stats Row */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-3 text-center">
                  <div>
                    <span className="text-xs text-gray-400 block font-medium">Distance</span>
                    <span className="text-sm font-bold text-gray-800">{travel.total_km} KM</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block font-medium">Visited Patient</span>
                    <span className={`text-sm font-bold ${travel.patient_visited ? "text-green-600" : "text-amber-600"}`}>
                      {travel.patient_visited ? "Yes" : "No"}
                    </span>
                  </div>
                </div>

                {/* Core Mobile Action Row */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => navigate(`/travel/edit/${travel.id}`)}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-2.5 rounded-lg text-sm transition text-center"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(travel.id)}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2.5 rounded-lg text-sm transition text-center"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ==================== 2. DESKTOP ROW VIEW (Visible on Larger Screen Sizes) ==================== */}
        <div className="hidden lg:block bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Patient</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">From</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">To</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">KM</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Visited</th>
                  <th className="p-4 text-center text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {travels.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-gray-400 text-sm">
                      No travel items recorded for today.
                    </td>
                  </tr>
                ) : (
                  travels.map((travel) => (
                    <tr key={travel.id} className="hover:bg-gray-50/70 transition">
                      <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{travel.travel_date}</td>
                      <td className="p-4 text-sm font-medium text-gray-800">{travel.patient_name || "N/A"}</td>
                      <td className="p-4 text-sm text-gray-600 max-w-xs truncate" title={travel.from_address}>
                        {travel.from_address}
                      </td>
                      <td className="p-4 text-sm text-gray-600 max-w-xs truncate" title={travel.to_address}>
                        {travel.to_address}
                      </td>
                      <td className="p-4 text-sm font-semibold text-gray-800 whitespace-nowrap">{travel.total_km}</td>
                      <td className="p-4 text-sm">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          travel.patient_visited ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {travel.patient_visited ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/travel/edit/${travel.id}`)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1.5 rounded-md hover:bg-blue-50 transition mr-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(travel.id)}
                          className="text-red-600 hover:text-red-800 font-medium text-sm px-3 py-1.5 rounded-md hover:bg-red-50 transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </TherapistLayout>
  )
}

export default TodayTravelPage