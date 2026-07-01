import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import { getClaimHistory } from "../services/claimService"
import { exportClaimsListPdf } from "../utils/pdfExport"

function ClaimHistoryPage() {
  const navigate = useNavigate()
  const [claims, setClaims] = useState([])

  useEffect(() => {
    fetchClaims()
  }, [])

  const fetchClaims = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getClaimHistory(token)
      setClaims(data)
    } catch {
      toast.error("Failed to load history")
    }
  }

  // FIXED: This now returns actual JSX <span> tags with the classes applied, rather than raw string text
  const getStatusBadge = (status) => {
    const baseClass = "px-2.5 py-1 rounded-full text-xs font-semibold inline-block capitalize"
    const displayStatus = status || "pending"
    
    switch (displayStatus.toLowerCase()) {
      case "approved":
        return <span className={`${baseClass} bg-green-100 text-green-800`}>{displayStatus}</span>
      case "pending":
        return <span className={`${baseClass} bg-yellow-100 text-yellow-800`}>{displayStatus}</span>
      case "rejected":
        return <span className={`${baseClass} bg-red-100 text-red-800`}>{displayStatus}</span>
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-800`}>{displayStatus}</span>
    }
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4">
        
        {/* Title text adjustments for fluid viewports */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Claim History
          </h1>
          <button
            onClick={() => exportClaimsListPdf("Claim History", claims)}
            disabled={claims.length === 0}
            className="inline-flex items-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Export PDF
          </button>
        </div>

        {/* 1. MOBILE RESPONSIVE CARDS (Displays only on mobile/tablet viewports) */}
        <div className="md:hidden space-y-4">
          {claims.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-xl shadow text-gray-500">
              No claim records found.
            </div>
          ) : (
            claims.map((claim) => (
              <div 
                key={claim.id} 
                className="bg-white rounded-xl shadow-md p-4 space-y-3 border border-gray-100"
              >
                {/* Mobile Card Header */}
                <div className="flex justify-between items-start border-b border-gray-50 pb-2">
                  <div>
                    <h3 className="font-bold text-gray-800 text-base">
                      {claim.therapist_name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Date: {claim.claim_date}
                    </p>
                  </div>
                  {getStatusBadge(claim.status)}
                </div>

                {/* Mobile Card Data Grid */}
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>
                    <span className="text-xs text-gray-400 block">Total Distance</span>
                    <span className="font-medium text-gray-800">{claim.total_km} KM</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Per KM Rate</span>
                    <span className="font-medium text-gray-800">₹{claim.per_km_rate}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Patients Visited</span>
                    <span className="font-medium text-gray-800">{claim.patient_count}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Grand Total</span>
                    <span className="font-bold text-blue-600 text-base">₹{claim.grand_total}</span>
                  </div>
                </div>

                {/* Mobile Card Action Field */}
                <div className="pt-2">
                  <button
                    onClick={() => navigate(`/admin/claim/${claim.id}`)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-2.5 rounded-lg text-sm font-medium transition block"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2. DESKTOP VIEW MASK (Keeps original rich layout, hidden on small breakpoints) */}
        <div className="hidden md:block bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Therapist</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">KM</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Per KM</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Total</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Patients</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-800">{claim.therapist_name}</td>
                    <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{claim.claim_date}</td>
                    <td className="p-4 text-sm text-gray-600">{claim.total_km}</td>
                    <td className="p-4 text-sm text-gray-600">₹{claim.per_km_rate}</td>
                    <td className="p-4 text-sm font-semibold text-gray-900">₹{claim.grand_total}</td>
                    <td className="p-4 text-sm text-gray-600">{claim.patient_count}</td>
                    <td className="p-4 text-sm">
                      {getStatusBadge(claim.status)}
                    </td>
                    <td className="p-4 text-sm">
                      <button
                        onClick={() => navigate(`/admin/claim/${claim.id}`)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}

export default ClaimHistoryPage