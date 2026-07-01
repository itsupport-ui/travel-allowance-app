import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import toast from "react-hot-toast"
import TherapistLayout from "../layouts/TherapistLayout"
import { getClaimDetails } from "../services/claimService"
import { openTravelInvoice } from "../services/travelService"
import { exportClaimDetailPdf } from "../utils/pdfExport"

function TherapistClaimDetailsPage() {
  const { claimId } = useParams()
  const [claim, setClaim] = useState(null)
  const [travels, setTravels] = useState([])

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const token = localStorage.getItem("token")
        const data = await getClaimDetails(claimId, token)
        setClaim(data.claim)
        setTravels(data.travels)
      } catch {
        toast.error("Failed to load claim")
      }
    }

    void fetchDetails()
  }, [claimId])

  const handleInvoice = async (travelId) => {
    try {
      const token = localStorage.getItem("token")
      await openTravelInvoice(travelId, token)
    } catch {
      toast.error("Failed to open invoice")
    }
  }

  if (!claim) return null

  // UI state color badge generator 
  const getStatusBadge = (status) => {
    const baseStyle = "px-3 py-1 rounded-full text-xs font-semibold inline-block capitalize"
    switch (status?.toLowerCase()) {
      case "approved":
        return <span className={`${baseStyle} bg-green-100 text-green-800`}>Approved</span>
      case "rejected":
        return <span className={`${baseStyle} bg-red-100 text-red-800`}>Rejected</span>
      default:
        return <span className={`${baseStyle} bg-yellow-100 text-yellow-800`}>Pending</span>
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-4xl mx-auto px-1 sm:px-4">
        
        {/* Title + PDF download action row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Claim Details
          </h1>
          <button
            onClick={() => exportClaimDetailPdf(claim, travels, "therapist")}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download PDF
          </button>
        </div>

        {/* Top Overview Summary Block */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5 sm:p-6 mb-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            
            <div className="border-r border-gray-100 pr-2">
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Claim Date
              </span>
              <span className="font-semibold text-gray-800 text-sm sm:text-base">
                {claim.claim_date}
              </span>
            </div>

            <div className="sm:border-r border-gray-100 pr-2">
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Total Distance
              </span>
              <span className="font-semibold text-gray-800 text-sm sm:text-base">
                {claim.total_km} KM
              </span>
            </div>

            <div className="border-r border-gray-100 pr-2">
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Grand Total
              </span>
              <span className="font-bold text-blue-600 text-base sm:text-lg">
                ₹{claim.grand_total}
              </span>
            </div>

            <div>
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Status
              </span>
              <div className="mt-0.5">
                {getStatusBadge(claim.status)}
              </div>
            </div>

          </div>
        </div>

        {/* Section Breakdown Header */}
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">
          Travel Entries
        </h2>

        {/* Stacked Travel Log Cards */}
        <div className="space-y-4">
          {travels.length === 0 ? (
            <div className="text-center p-6 bg-white rounded-xl shadow text-gray-400 text-sm">
              No individual travel items linked to this claim.
            </div>
          ) : (
            travels.map((travel) => (
              <div
                key={travel.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
              >
                {/* Travel Card Top Header */}
                <div className="border-b border-gray-100 pb-3 mb-4">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <span className="text-xs text-gray-400 block font-medium">PATIENT</span>
                      <span className="font-bold text-gray-800 text-base sm:text-lg">
                        {travel.patient_name}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400 block font-medium">TRANSPORT</span>
                      <span className="font-semibold text-gray-700 text-sm sm:text-base capitalize">
                        {travel.transport_mode}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-gray-400 block font-medium">DISTANCE</span>
                      <span className="font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md text-sm">
                        {travel.total_km} KM
                      </span>
                    </div>
                  </div>

                  {/* Sub-meta details row for non-vehicle parameters */}
                  {(travel.transport_mode?.toLowerCase() !== "vehicle" || travel.invoice_file) && (
                    <div className="mt-3 pt-2 border-t border-dashed border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {travel.transport_mode?.toLowerCase() !== "vehicle" && (
                        <div className="flex items-center gap-1.5">
                          <strong className="text-gray-500 font-medium">Bill Amount:</strong>
                          <span className="font-semibold text-gray-800">₹{travel.bill_amount}</span>
                        </div>
                      )}
                      
                      {travel.invoice_file && (
                        <div className="flex items-center gap-1.5">
                          <strong className="text-gray-500 font-medium">Invoice:</strong>
                          <button
                            type="button"
                            onClick={() => handleInvoice(travel.id)}
                            className="text-blue-600 hover:underline font-medium inline-flex items-center"
                          >
                            View Invoice
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Interactive Route Timeline Mapping */}
                <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[11px] before:top-[8px] before:bottom-[8px] before:w-0.5 before:bg-gray-200">
                  
                  {/* From Endpoint */}
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-50 text-xs"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">From</span>
                    <span className="text-sm text-gray-700 font-medium break-words block">
                      {travel.from_address}
                    </span>
                  </div>

                  {/* To Endpoint */}
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-50 text-xs"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">To</span>
                    <span className="text-sm text-gray-700 font-medium break-words block">
                      {travel.to_address}
                    </span>
                  </div>

                </div>

              </div>
            ))
          )}
        </div>

      </div>
    </TherapistLayout>
  )
}

export default TherapistClaimDetailsPage
