import { useEffect, useState } from "react"
import AdminLayout from "../layouts/AdminLayout"
import { getAllClaims } from "../services/claimService"
import toast from "react-hot-toast"
import { useNavigate } from "react-router-dom"

function PendingClaimsPage() {
  const navigate = useNavigate()
  const [claims, setClaims] = useState([])

  useEffect(() => {
    fetchClaims()
  }, [])

  const fetchClaims = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getAllClaims(token)
      setClaims(data)
    } catch {
      toast.error("Failed to load claims")
    }
  }

  // Helper utility to render a consistent accessible status pill
  const getStatusBadge = (status) => {
    const baseStyle = "px-2.5 py-1 rounded-full text-xs font-semibold inline-block capitalize"
    if (status?.toLowerCase() === "approved") {
      return <span className={`${baseStyle} bg-green-100 text-green-800`}>Approved</span>
    }
    return <span className={`${baseStyle} bg-yellow-100 text-yellow-800`}>Pending</span>
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto">
        
        {/* Responsive Heading */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Pending Claims
        </h1>

        {/* ==================== 1. MOBILE & TABLET LAYOUT (Hidden on Desktop) ==================== */}
        <div className="xl:hidden space-y-4">
          {claims.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-xl shadow text-gray-500">
              No pending claims found.
            </div>
          ) : (
            claims.map((claim) => (
              <div 
                key={claim.id} 
                className="bg-white rounded-xl shadow-md p-4 space-y-3.5 border border-gray-100"
              >
                {/* Mobile Card Header */}
                <div className="flex justify-between items-start border-b border-gray-100 pb-2.5">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">
                      {claim.therapist_name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Date: {claim.claim_date}
                    </p>
                  </div>
                  {getStatusBadge(claim.status)}
                </div>

                {/* Mobile Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-gray-600">
                  <div>
                    <span className="text-xs text-gray-400 block">Total Distance</span>
                    <span className="font-medium text-gray-800">{claim.total_km} KM</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Per KM Fare</span>
                    <span className="font-medium text-gray-800">₹{claim.per_km_rate}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Base Fare</span>
                    <span className="font-medium text-gray-800">₹{claim.travel_total}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Allowance</span>
                    <span className="font-medium text-gray-800">₹{claim.daily_allowance}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Patients Count</span>
                    <span className="font-medium text-gray-800">{claim.patient_count}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs text-gray-400 block">Grand Total</span>
                    <span className="font-bold text-blue-600 text-base">₹{claim.grand_total}</span>
                  </div>
                </div>

                {/* Mobile Full-Width Interactive Button */}
                <div className="pt-1">
                  <button
                    onClick={() => navigate(`/admin/claim/${claim.id}`)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-2.5 rounded-lg text-sm font-medium transition block shadow-sm"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ==================== 2. DESKTOP WIDESCREEN VIEW (Hidden on Mobile) ==================== */}
        <div className="hidden xl:block bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Therapist</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">KM</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Per KM Fare</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Fare</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Allowance</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Total</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Patients</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-800">{claim.therapist_name}</td>
                    <td className="p-4 text-sm text-gray-600">{claim.claim_date}</td>
                    <td className="p-4 text-sm text-gray-600">{claim.total_km}</td>
                    <td className="p-4 text-sm text-gray-600">₹{claim.per_km_rate}</td>
                    <td className="p-4 text-sm text-gray-600">₹{claim.travel_total}</td>
                    <td className="p-4 text-sm text-gray-600">₹{claim.daily_allowance}</td>
                    <td className="p-4 text-sm font-semibold text-gray-900">₹{claim.grand_total}</td>
                    <td className="p-4 text-sm">
                      {getStatusBadge(claim.status)}
                    </td>
                    <td className="p-4 text-sm text-gray-600">{claim.patient_count}</td>
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

export default PendingClaimsPage