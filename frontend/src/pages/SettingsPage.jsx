import { useEffect, useState } from "react"
import AdminLayout from "../layouts/AdminLayout"
import { getSettings, updateSettings } from "../services/settingsService"
import toast from "react-hot-toast"

function SettingsPage() {
  const [perKmRate, setPerKmRate] = useState("")
  const [dailyAllowance, setDailyAllowance] = useState("")

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getSettings(token)
      setPerKmRate(data.per_km_rate)
      setDailyAllowance(data.daily_allowance)
    } catch {
      toast.error("Failed to load settings")
    }
  }

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token")
      await updateSettings(
        {
          per_km_rate: Number(perKmRate),
          daily_allowance: Number(dailyAllowance)
        },
        token
      )
      toast.success("Settings updated 🚀")
    } catch {
      toast.error("Update failed")
    }
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-xl mx-auto">
        
        {/* Dynamic Typography Header sizing down on mobile */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Settings
        </h1>

        {/* Responsive padding container (p-5 on mobile scales to p-8 on desktop) */}
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 space-y-6">

          {/* Per KM Rate Field */}
          <div>
            <label className="block mb-2 text-sm font-semibold text-gray-700">
              Per KM Rate
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">₹</span>
              </div>
              <input
                type="number"
                value={perKmRate}
                onChange={(e) => setPerKmRate(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-800"
              />
            </div>
          </div>

          {/* Daily Allowance Field */}
          <div>
            <label className="block mb-2 text-sm font-semibold text-gray-700">
              Daily Allowance
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">₹</span>
              </div>
              <input
                type="number"
                value={dailyAllowance}
                onChange={(e) => setDailyAllowance(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-800"
              />
            </div>
          </div>

          {/* Action Button Block (Full-width on mobile viewports, auto on desktop) */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              className="w-full sm:w-auto text-center bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-lg font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Save Settings
            </button>
          </div>

        </div>
      </div>
    </AdminLayout>
  )
}

export default SettingsPage