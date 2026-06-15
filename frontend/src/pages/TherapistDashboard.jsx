import { useEffect, useState } from "react"
import TherapistLayout from "../layouts/TherapistLayout"
import { getDashboardSummary } from "../services/dashboardService"
import toast from "react-hot-toast"

function TherapistDashboard() {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getDashboardSummary(token)
      setSummary(data)
    } catch {
      toast.error("Failed to load dashboard")
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-7xl mx-auto px-1 sm:px-4">
        
        {/* Header Section - Typography sizes down smoothly on smaller displays */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
            Therapist Dashboard
          </h1>
          <p className="text-sm sm:text-base text-gray-500">
            Welcome back 🚀
          </p>
        </div>

        {summary && (
          /* Responsive Grid System:
            - grid-cols-2: Packs 4 cards into a highly scannable 2x2 layout on mobile
            - md:grid-cols-2: Preserves layout spacing on mid-sized tablets
            - lg:grid-cols-4: Stretches out into a full horizontal desktop layout
          */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

            {/* Today's Trips Card */}
            <div className="bg-white rounded-xl shadow-md border border-gray-50 p-4 sm:p-6 flex flex-col justify-between">
              <h2 className="text-xs sm:text-sm font-medium text-gray-400 uppercase tracking-wider">
                Today's Trips
              </h2>
              <p className="text-2xl sm:text-4xl font-extrabold text-blue-600 mt-2 sm:mt-3">
                {summary.today_trips}
              </p>
            </div>

            {/* Today's KM Card */}
            <div className="bg-white rounded-xl shadow-md border border-gray-50 p-4 sm:p-6 flex flex-col justify-between">
              <h2 className="text-xs sm:text-sm font-medium text-gray-400 uppercase tracking-wider">
                Today's KM
              </h2>
              <p className="text-2xl sm:text-4xl font-extrabold text-green-600 mt-2 sm:mt-3">
                {summary.today_km}
              </p>
            </div>

            {/* Pending Claims Card */}
            <div className="bg-white rounded-xl shadow-md border border-gray-50 p-4 sm:p-6 flex flex-col justify-between">
              <h2 className="text-xs sm:text-sm font-medium text-gray-400 uppercase tracking-wider">
                Pending Claims
              </h2>
              <p className="text-2xl sm:text-4xl font-extrabold text-yellow-500 mt-2 sm:mt-3">
                {summary.pending_claims}
              </p>
            </div>

            {/* Approved Claims Card */}
            <div className="bg-white rounded-xl shadow-md border border-gray-50 p-4 sm:p-6 flex flex-col justify-between">
              <h2 className="text-xs sm:text-sm font-medium text-gray-400 uppercase tracking-wider">
                Approved Claims
              </h2>
              <p className="text-2xl sm:text-4xl font-extrabold text-purple-600 mt-2 sm:mt-3">
                {summary.approved_claims}
              </p>
            </div>

          </div>
        )}

      </div>
    </TherapistLayout>
  )
}

export default TherapistDashboard