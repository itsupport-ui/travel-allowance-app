import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { 
  FaUserMd, 
  FaCalendarAlt, 
  FaClock, 
  FaExclamationCircle, 
  FaNotesMedical,
  FaFileMedical,
  FaSearch
} from "react-icons/fa"

import TherapistLayout from "../layouts/TherapistLayout"
import { getMissedSchedules } from "../services/scheduleService"
import { exportSchedulePdf } from "../utils/pdfExport"

function TherapistMissedSchedulesPage() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getMissedSchedules(token)
      setSchedules(data)
    } catch (error) {
      console.error(error)
      toast.error("Failed to load missed schedules")
    } finally {
      setLoading(false)
    }
  }

  const getPriorityBadge = (priority) => {
    const baseClass = "px-2.5 py-0.5 rounded-lg text-[10px] font-bold inline-block uppercase tracking-wider border"
    switch (priority?.toLowerCase()) {
      case "high":
        return <span className={`${baseClass} bg-rose-50 text-rose-700 border-rose-100`}>High</span>
      case "medium":
        return <span className={`${baseClass} bg-amber-50 text-amber-700 border-amber-100`}>Medium</span>
      default:
        return <span className={`${baseClass} bg-indigo-50 text-indigo-700 border-indigo-100`}>Normal</span>
    }
  }

  const labelClasses = "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1"

  if (loading) {
    return (
      <TherapistLayout>
        <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-2 space-y-4 animate-pulse">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3 mb-6"></div>
          <div className="h-44 bg-slate-200 rounded-2xl w-full"></div>
          <div className="h-44 bg-slate-200 rounded-2xl w-full"></div>
        </div>
      </TherapistLayout>
    )
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-2">

        {/* Page Header Area */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                Missed Schedules
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
                Review your historical anomalies and appointment exceptions marked as missed.
              </p>
            </div>
            <button
              onClick={() => exportSchedulePdf("Missed-Schedules", schedules)}
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

        {/* Workspace Display Layer */}
        {schedules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-lg text-slate-400">
              <FaSearch />
            </div>
            <p className="text-slate-700 font-bold text-sm sm:text-base">
              No missed schedules found
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Your logs are completely up to date with no missed exceptions registered.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 sm:p-5 relative overflow-hidden group hover:border-slate-300 transition-all duration-200"
              >
                {/* Visual Alert Side Border Badge Line */}
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-rose-400" />

                {/* Patient Information Top Header */}
                <div className="flex justify-between items-start gap-4 border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <span className={labelClasses}>Patient Profile</span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
                      {schedule.patient_name}
                    </h2>
                    <span className="text-[11px] font-bold text-indigo-600 mt-1 inline-flex items-center gap-1">
                      <FaFileMedical className="text-[10px]" /> {schedule.treatment_name}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="bg-rose-50 border border-rose-100 text-rose-700 text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider inline-block mb-1.5">
                      Missed
                    </span>
                  </div>
                </div>

                {/* Multi-Column Metadata Fields Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/60 border border-slate-100 rounded-xl p-3.5 text-xs">
                  
                  {/* Doctor Field */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaUserMd />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Physician</span>
                      <span className="text-slate-700 font-bold">{schedule.doctor_name}</span>
                    </div>
                  </div>

                  {/* Priority Field */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaExclamationCircle />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Priority Matrix</span>
                      {getPriorityBadge(schedule.priority)}
                    </div>
                  </div>

                  {/* Treatment Date Field */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaCalendarAlt />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Target Treatment Date</span>
                      <span className="text-slate-700 font-bold tracking-tight">{schedule.treatment_date}</span>
                    </div>
                  </div>

                  {/* Operational Timeline Window */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaClock />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Scheduled Window</span>
                      <span className="text-slate-700 font-bold tracking-wide">
                        {schedule.in_time} - {schedule.out_time}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Reason Exception Block Elements */}
                <div className="mt-4">
                  <div className="flex items-center gap-1 mb-1 pl-0.5 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                    <FaNotesMedical className="text-rose-400 text-[9px]" />
                    <span>Logged Exception Reason</span>
                  </div>
                  <p className="text-xs text-rose-900 leading-relaxed bg-rose-50/50 border border-rose-100/60 rounded-xl p-3 font-semibold">
                    {schedule.missed_reason || "No explicit operational justification reason logged in records."}
                  </p>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </TherapistLayout>
  )
}

export default TherapistMissedSchedulesPage