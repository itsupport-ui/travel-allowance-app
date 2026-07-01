import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import TherapistLayout from "../layouts/TherapistLayout"
import {
  getUpcomingSchedules,
  completeSchedule,
  missedSchedule
} from "../services/scheduleService"

function UpcomingSchedulePage() {
  const [schedules, setSchedules] = useState([])

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getUpcomingSchedules(token)
      setSchedules(data)
    } catch {
      toast.error("Failed to load schedules")
    }
  }

  const handleComplete = async (id) => {
    const notes = prompt("Completion notes")
    if (notes === null) return // Stop execution if prompt modal is canceled

    try {
      const token = localStorage.getItem("token")
      await completeSchedule(id, notes, token)
      toast.success("Treatment completed")
      fetchSchedules()
    } catch {
      toast.error("Failed to complete")
    }
  }

  const handleMissed = async (id) => {
    const reason = prompt("Missed reason")
    if (reason === null) return // Stop execution if prompt modal is canceled

    try {
      const token = localStorage.getItem("token")
      await missedSchedule(id, reason, token)
      toast.success("Marked as missed")
      fetchSchedules()
    } catch {
      toast.error("Failed to update")
    }
  }

  // Dynamic visual status styling badge helper
  const getPriorityBadge = (priority) => {
    const baseClass = "px-2.5 py-0.5 rounded-md text-xs font-semibold inline-block uppercase tracking-wider"
    switch (priority?.toLowerCase()) {
      case "high":
        return <span className={`${baseClass} bg-red-100 text-red-800`}>High</span>
      case "medium":
        return <span className={`${baseClass} bg-amber-100 text-amber-800`}>Medium</span>
      default:
        return <span className={`${baseClass} bg-blue-100 text-blue-800`}>Low</span>
    }
  }

  return (
    <TherapistLayout>
      {/* px-2 sm:px-4 keeps content from hitting the raw edges of small device viewports */}
      <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 py-4">
        
        {/* Responsive Header Elements */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            Upcoming Schedule
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Track future practitioner operations, assigned caseloads, and planned treatments.
          </p>
        </div>

        {schedules.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-400 text-sm font-medium border border-gray-100">
            No upcoming schedules 😄
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-100 p-5 transition duration-150"
              >
                {/* Meta Header Section: Patient Details + Priority Badge Placement */}
                <div className="flex justify-between items-start gap-4 border-b border-gray-50 pb-3 mb-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Patient</span>
                    <h2 className="text-lg font-bold text-gray-800 leading-tight">
                      {schedule.patient_name}
                    </h2>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Priority</span>
                    {getPriorityBadge(schedule.priority)}
                  </div>
                </div>

                {/* Info Data Core Grid: 1 column on mobile layout blocks, 3 columns on full desktop tracks */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50/60 rounded-xl p-3 text-sm border border-gray-100/40">
                  <div>
                    <span className="text-xs font-medium text-gray-400 block">Treatment Plan</span>
                    <span className="text-gray-700 font-semibold">{schedule.treatment_name}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-400 block">Treatment Date</span>
                    <span className="text-gray-700 font-semibold text-xs sm:text-sm block py-0.5">
                      {schedule.treatment_date || `${schedule.start_date} → ${schedule.end_date}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-400 block">Time Allocation</span>
                    <span className="text-gray-700 font-semibold whitespace-nowrap block py-0.5">
                      {schedule.in_time} - {schedule.out_time}
                    </span>
                  </div>
                </div>

                {/* Clinical Notes Field with break-words to guarantee viewport constraints remain intact */}
                <div className="mt-3.5 px-1">
                  <span className="text-xs font-medium text-gray-400 block mb-1">Special Instructions</span>
                  <p className="text-sm text-gray-600 leading-relaxed break-words bg-white border border-gray-100 rounded-lg p-2.5 shadow-inner">
                    {schedule.instructions || "No custom requirements requested for this booking."}
                  </p>
                </div>

                {/* Touch Action Row: Stretches full-width natively on smaller mobile devices */}
                <div className="grid grid-cols-2 gap-3 mt-5 pt-3 border-t border-gray-50">
                  <button
                    onClick={() => handleComplete(schedule.id)}
                    className="w-full bg-green-600 hover:bg-green-700 active:scale-[0.99] text-white py-3 px-4 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-green-600/10 text-center"
                  >
                    Complete
                  </button>

                  <button
                    onClick={() => handleMissed(schedule.id)}
                    className="w-full bg-red-50 hover:bg-red-100 active:scale-[0.99] text-red-600 py-3 px-4 rounded-xl text-sm font-semibold transition-all text-center"
                  >
                    Missed
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </TherapistLayout>
  )
}

export default UpcomingSchedulePage