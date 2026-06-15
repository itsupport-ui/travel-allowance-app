import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import TherapistLayout from "../layouts/TherapistLayout"
import { getTravelById, updateTravel } from "../services/travelService"
import toast from "react-hot-toast"

function EditTravelPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [patientName, setPatientName] = useState("")
  const [travelDate, setTravelDate] = useState("")
  const [fromAddress, setFromAddress] = useState("")
  const [toAddress, setToAddress] = useState("")
  const [totalKm, setTotalKm] = useState("")
  const [patientVisited, setPatientVisited] = useState(false)

  useEffect(() => {
    fetchTravel()
  }, [])

  const fetchTravel = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getTravelById(id, token)

      setPatientName(data.patient_name)
      setTravelDate(data.travel_date)
      setFromAddress(data.from_address)
      setToAddress(data.to_address)
      setTotalKm(data.total_km)
      setPatientVisited(data.patient_visited)
    } catch {
      toast.error("Failed to load travel")
    }
  }

  const handleUpdate = async () => {
    try {
      const token = localStorage.getItem("token")
      const travelData = {
        travel_date: travelDate,
        from_address: fromAddress,
        to_address: toAddress,
        total_km: Number(totalKm),
        patient_visited: patientVisited,
        patient_name: patientName
      }

      await updateTravel(id, travelData, token)
      toast.success("Travel updated 🚀")
      navigate("/travel/today")
    } catch {
      toast.error("Update failed")
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-3xl mx-auto">
        
        {/* Scaled page heading typography */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Edit Travel
        </h1>

        {/* Form panel with fluid phone padding (p-5 on mobile scaling up to p-8 on desktop) */}
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 space-y-5">
          
          {/* Patient Name */}
          <div>
            <label className="block mb-1.5 text-sm font-medium text-gray-700">
              Patient Name
            </label>
            <input 
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Enter patient name"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-shadow"
            />
          </div>

          {/* Travel Date */}
          <div>
            <label className="block mb-1.5 text-sm font-medium text-gray-700">
              Travel Date
            </label>
            <input
              type="date"
              value={travelDate}
              onChange={(e) => setTravelDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-shadow"
            />
          </div>

          {/* From Address */}
          <div>
            <label className="block mb-1.5 text-sm font-medium text-gray-700">
              From Address
            </label>
            <input
              type="text"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="Enter starting address"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-shadow"
            />
          </div>

          {/* To Address */}
          <div>
            <label className="block mb-1.5 text-sm font-medium text-gray-700">
              To Address
            </label>
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="Enter destination address"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-shadow"
            />
          </div>

          {/* Total Distance */}
          <div>
            <label className="block mb-1.5 text-sm font-medium text-gray-700">
              Total Distance (KM)
            </label>
            <input
              type="number"
              value={totalKm}
              onChange={(e) => setTotalKm(e.target.value)}
              placeholder="Enter kilometers traveled"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-shadow"
            />
          </div>

          {/* Checkbox Wrapper with interactive cursor alignments */}
          <div className="flex items-center gap-3 py-2 select-none">
            <input
              type="checkbox"
              id="patientVisited"
              checked={patientVisited}
              onChange={(e) => setPatientVisited(e.target.checked)}
              className="w-5 h-5 rounded text-yellow-500 focus:ring-yellow-500 border-gray-300 cursor-pointer"
            />
            <label 
              htmlFor="patientVisited" 
              className="font-medium text-gray-700 cursor-pointer text-sm sm:text-base"
            >
              Patient Visited
            </label>
          </div>

          {/* Update Action (Full-width button wrapper for precise mobile touch control) */}
          <div className="pt-2">
            <button
              onClick={handleUpdate}
              className="w-full sm:w-auto text-center bg-yellow-500 hover:bg-yellow-600 text-white px-8 py-3.5 rounded-lg font-medium transition block shadow-sm"
            >
              Update Travel
            </button>
          </div>

        </div>
      </div>
    </TherapistLayout>
  )
}

export default EditTravelPage