import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import { getTodayAdminSchedules } from "../services/scheduleService"
import { exportSchedulePdf } from "../utils/pdfExport"

function AdminTodaySchedulePage() {
  const navigate = useNavigate()
  const [schedules, setSchedules] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getTodayAdminSchedules(token)
      setSchedules(data || [])
    } catch {
      toast.error("Failed to load schedules")
    } finally {
      setIsLoading(false)
    }
  }

  // Priority Badge Visual Transformer
  const getPriorityBadge = (priority) => {
    const baseClass = "px-2.5 py-0.5 rounded-md text-xs font-semibold inline-block uppercase tracking-wider"
    switch (priority?.toLowerCase()) {
      case "important":
      case "high":
        return <span className={`${baseClass} bg-red-100 text-red-800`}>Important</span>
      default:
        return <span className={`${baseClass} bg-blue-100 text-blue-800`}>Normal</span>
    }
  }

  // Status Badge Dynamic Class Wrapper (Fixes the raw string rendering bug)
  const getStatusBadge = (status) => {
    const baseClass = "px-2.5 py-0.5 rounded-md text-xs font-medium inline-block capitalize border"
    switch (status?.toLowerCase()) {
      case "completed":
        return <span className={`${baseClass} bg-emerald-50 text-emerald-700 border-emerald-200/60`}>Completed</span>
      case "missed":
        return <span className={`${baseClass} bg-rose-50 text-rose-700 border-rose-200/60`}>Missed</span>
      case "cancelled":
        return <span className={`${baseClass} bg-gray-100 text-gray-700 border-gray-300/60`}>Cancelled</span>
      default:
        return <span className={`${baseClass} bg-amber-50 text-amber-700 border-amber-200/60`}>Pending</span>
    }
  }

  return (
    <AdminLayout>
      {/* px-3 sm:px-6 provides proper touch margin protection against device borders */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4">
        
        {/* Dynamic Context Header */}
        <div className="mb-6 border-b border-gray-100 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">
                Today's Schedule
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">
                Review live active practitioner clinical operations and patient routing queues.
              </p>
            </div>
            <button
              onClick={() => exportSchedulePdf("Todays-Schedule", schedules)}
              disabled={schedules.length === 0}
              className="inline-flex items-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm mt-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download PDF
            </button>
          </div>
        </div>

        {/* 1. MOBILE RESPONSIVE LAYOUT CARDS VIEWPORTS (Triggers exclusively below 768px view space) */}
        <div className="md:hidden space-y-4">
          {schedules.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-2xl border border-gray-100 shadow-sm text-gray-400 text-sm font-medium">
              {isLoading ? "Loading system tasks..." : "No operational schedules recorded for today"}
            </div>
          ) : (
            schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100/80 p-4 space-y-4"
              >
                {/* Mobile Meta Header Block */}
                <div className="flex justify-between items-start gap-4 border-b border-gray-50 pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Patient Account</span>
                    <h3 className="font-bold text-gray-800 text-base leading-snug">
                      {schedule.patient_name}
                    </h3>
                    <p className="text-xs font-semibold text-blue-600 mt-0.5">
                      {schedule.treatment_name}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {getPriorityBadge(schedule.priority)}
                  </div>
                </div>

                {/* Info Value Split Panels */}
                <div className="grid grid-cols-2 gap-3 bg-gray-50/60 rounded-xl p-3 text-sm border border-gray-100/40">
                  <div>
                    <span className="text-[11px] font-medium text-gray-400 block mb-0.5">Time Frame</span>
                    <span className="font-semibold text-gray-700 text-xs sm:text-sm whitespace-nowrap">
                      {schedule.in_time} - {schedule.out_time}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-gray-400 block mb-0.5">Workflow Status</span>
                    <div className="block">{getStatusBadge(schedule.status)}</div>
                  </div>
                </div>

                {/* Ergonomic Mobile Touch Action Row */}
                <button
                  onClick={() => navigate(`/admin/schedule/${schedule.id}`)}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white py-3 px-4 rounded-xl text-sm font-semibold transition-all shadow-sm text-center block"
                >
                  View Full Profile
                </button>
              </div>
            ))
          )}
        </div>

          {/* 2. DESKTOP VIEWPORT LAYOUT CHANNELS (Triggers smoothly from 768px screens upward) */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-400 text-xs font-bold uppercase tracking-wider text-left">
                  <th className="py-4 px-5">Patient Name</th>
                  <th className="py-4 px-5">Assigned Treatment</th>
                  <th className="py-4 px-5">Time Frame Allocation</th>
                  <th className="py-4 px-5">Case Priority</th>
                  <th className="py-4 px-5">Operations Status</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700 font-medium">
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-400 font-medium">
                      {isLoading ? "Loading clinical system pipelines..." : "No operational schedules recorded for today"}
                    </td>
                  </tr>
                ) : (
                  schedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-gray-50/50 transition duration-150">
                      <td className="py-4 px-5 font-bold text-gray-900">{schedule.patient_name}</td>
                      <td className="py-4 px-5 text-gray-500">{schedule.treatment_name}</td>
                      <td className="py-4 px-5 text-gray-600 whitespace-nowrap">
                        {schedule.in_time} - {schedule.out_time}
                      </td>
                      <td className="py-4 px-5">{getPriorityBadge(schedule.priority)}</td>
                      <td className="py-4 px-5">{getStatusBadge(schedule.status)}</td>
                      <td className="py-4 px-5 text-right">
                        <button
                          onClick={() => navigate(`/admin/schedule/${schedule.id}`)}
                          className="bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-[0.98] px-4 py-2 rounded-xl text-xs font-bold transition-all"
                        >
                          View Details
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
    </AdminLayout>
  )
}

export default AdminTodaySchedulePage