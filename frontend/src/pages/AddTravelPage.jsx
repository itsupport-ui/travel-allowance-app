import { useState } from "react"
import TherapistLayout from "../layouts/TherapistLayout"
import { createTravel } from "../services/travelService"
import { getDistance } from "../services/mapsService"
import toast from "react-hot-toast"

// Add Transport Mode Dropdown in Add Travel Form with options like Vehicle, Auto, Bus, Metro, Cab, etc. This allows therapists to specify the mode of transport used for the trip, which can be useful for reporting and analytics purposes. The default value can be set to "Vehicle" to maintain consistency with existing entries.
// Place the transport mode dropdown below the travel date field and above the from/to address fields for better logical grouping in the form. This way, users can select the transport mode early on before entering the addresses, which may influence their choice of transport.



function AddTravelPage() {
  const [patientName, setPatientName] = useState("")
  const [travelDate, setTravelDate] = useState("")
  const [fromAddress, setFromAddress] = useState("")
  const [toAddress, setToAddress] = useState("")
  const [totalKm, setTotalKm] = useState("")
  const [patientVisited, setPatientVisited] = useState(false)
  const [transportMode, setTransportMode] = useState("vehicle") // Default value
  const [ billAmount, setBillAmount] = useState("")
  const [invoiceFile, setInvoiceFile] = useState(null)

  const handleCalculateDistance = async () => {
    if (!fromAddress || !toAddress) {
      toast.error("Please enter both from and to addresses to calculate distance.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const data = await getDistance(fromAddress, toAddress, token);
      setTotalKm(data.distance_km);
    } catch (error) {
      toast.error("Failed to calculate distance");
    }
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem("token")
      const travelData = {
        patient_name: patientName,
        travel_date: travelDate,
        from_address: fromAddress,
        to_address: toAddress,
        total_km: Number(totalKm),
        patient_visited: patientVisited,
        transport_mode: transportMode,
        bill_amount: transportMode === "vehicle" ? null : Number(billAmount), // Bill amount only relevant for non-vehicle modes
        invoice_file: invoiceFile
      }

      await createTravel(travelData, token)
      toast.success("Travel saved successfully")

      // clear form
      setTravelDate("")
      setFromAddress("")
      setToAddress("")
      setTotalKm("")
      setPatientVisited(false)
      setPatientName("")
      setTransportMode("vehicle")
      setBillAmount("")
      setInvoiceFile(null)
    } catch {
      toast.error("Failed to save travel")
    }
  }

  return (
    <TherapistLayout>
      {/* Centered container with fluid width control */}
      <div className="max-w-3xl mx-auto w-full">

        {/* Scaled header font size for mobile viewports */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Add Travel
        </h1>

        {/* Responsive padding: p-5 on mobile, scales to p-8 on desktop */}
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 space-y-5">

          {/* Patient Name */}
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              Patient Name
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Enter patient name"
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              Travel Date
            </label>
            <input
              type="date"
              value={travelDate}
              onChange={(e) => setTravelDate(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Transport Mode */}
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              Transport Mode
            </label>
            <select
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
            <option value="vehicle">Vehicle</option>
            <option value="auto">Auto</option>
            <option value="bus">Bus</option>
            <option value="metro">Metro</option>
            <option value="cab">Cab</option>
            </select>
          </div>

          {/* From */}
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              From Address
            </label>
            <input
              type="text"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="Enter from address"
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* To */}
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              To Address
            </label>
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="Enter to address"
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Bill Amount */}
          {
            transportMode !== "vehicle" && (
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              Bill Amount
            </label>
            <input
              type="number"
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value)}
              placeholder="Enter bill amount"
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
            )
          }

          {/* Invoice File Upload */}
          { 
            transportMode !== "vehicle" && (
          <div>
            <label className="block mb-2 font-medium text-gray-700">
              Upload Invoice
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setInvoiceFile(e.target.files[0])}
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
            )
          }

          {/* Calculate Button: full width on mobile, inline auto width on desktop */}
          {
            transportMode === "vehicle" && (
        
          <div className="pt-2">
            <button
              type="button"
              onClick={handleCalculateDistance}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg transition font-medium block text-center"
            >
              Calculate Distance
            </button>
          </div>
          )
        }

          {/* KM */}
          {
            transportMode === "vehicle" && (

          <div>
            <label className="block mb-2 font-medium text-gray-700">
              Total KM
            </label>
            <input 
              type="number"
              value={totalKm}
              readOnly
              className="w-full border rounded-lg px-4 py-3 bg-gray-100 text-gray-600 cursor-not-allowed"
            />
          </div>
            )
          }
          
          {/* Checkbox wrapper with enhanced tap alignment */}
          <div className="flex items-center gap-3 py-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="patientVisited"
              checked={patientVisited}
              onChange={(e) => setPatientVisited(e.target.checked)}
              className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
            />
            <label htmlFor="patientVisited" className="font-medium text-gray-700 cursor-pointer">
              Patient Visited
            </label>
          </div>

          {/* Save Button: full width on mobile, inline auto width on desktop */}
          <div className="pt-4 border-t border-gray-100">
            <button
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition block text-center"
              onClick={handleSubmit}
            >
              Save Travel
            </button>
          </div>

        </div>
      </div>
    </TherapistLayout>
  )
}


export default AddTravelPage