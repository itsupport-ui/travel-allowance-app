import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import TherapistLayout from "../layouts/TherapistLayout"
import { getDashboardSummary } from "../services/dashboardService"
import toast from "react-hot-toast"
import { 
  FaCalendarCheck, 
  FaCalendarTimes, 
  FaClock, 
  FaTasks, 
  FaRoute, 
  FaHourglassHalf, 
  FaCheckCircle,
  FaArrowRight
} from "react-icons/fa"

function TherapistDashboard() {
  const [summary, setSummary] = useState({
    today_trips: 0,
    today_km: 0,
    pending_claims: 0,
    approved_claims: 0,
    today_scheduled: 0,
    completed_today: 0,
    missed_today: 0,
    upcoming: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getDashboardSummary(token)
      
      setSummary({
        today_trips: data?.today_trips || 0,
        today_km: data?.today_km || 0,
        pending_claims: data?.pending_claims || 0,
        approved_claims: data?.approved_claims || 0,
        today_scheduled: data?.today_scheduled || data?.today_trips || 0, 
        completed_today: data?.completed_today || 0,
        missed_today: data?.missed_today || 0,
        upcoming: data?.upcoming || 0
      })
    } catch {
      toast.error("Failed to load dashboard metrics")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-7xl mx-auto px-1 sm:px-4 py-2">
        
        {/* Dashboard Header Context */}
        <div className="mb-8 border-b border-slate-200/60 pb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
            Therapist Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Welcome back 👋 Here is an operational overview of your field records and treatments today.
          </p>
        </div>

        {/* Loading Skeleton Placeholder State */}
        {isLoading ? (
          <div className="space-y-8 animate-pulse">
            {[1, 2].map((section) => (
              <div key={section}>
                <div className="h-4 bg-slate-200 rounded w-48 mb-4"></div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((card) => (
                    <div key={card} className="h-28 bg-slate-200 rounded-2xl"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* SECTION 1: CLINICAL TASKS & SCHEDULES */}
            <div>
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 px-1">
                Agenda & Tasks Summary
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                
                {/* Today's Tasks */}
                <Link to="/today-schedule" className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Today's Tasks</span>
                    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                      <FaTasks className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-800">{summary.today_scheduled}</h3>
                    <span className="text-[10px] text-indigo-600 font-bold hidden sm:inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      View <FaArrowRight className="text-[8px]" />
                    </span>
                  </div>
                </Link>

                {/* Completed Today */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Completed</span>
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <FaCalendarCheck className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">{summary.completed_today}</h3>
                </div>

                {/* Missed Today */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Missed Tasks</span>
                    <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                      <FaCalendarTimes className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">{summary.missed_today}</h3>
                </div>

                {/* Upcoming */}
                <Link to="/upcoming-schedule" className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Upcoming</span>
                    <div className="p-2 rounded-xl bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white">
                      <FaClock className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-800">{summary.upcoming}</h3>
                    <span className="text-[10px] text-violet-600 font-bold hidden sm:inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      Open <FaArrowRight className="text-[8px]" />
                    </span>
                  </div>
                </Link>

              </div>
            </div>

            {/* SECTION 2: TRAVEL METRICS & CLAIMS */}
            <div>
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 px-1">
                Travel & Logistics Claims
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                
                {/* Today's Trips */}
                <Link to="/travel/today" className="group bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Today's Trips</h3>
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                      <FaRoute className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">{summary.today_trips}</p>
                </Link>

                {/* Today's KM */}
                <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Today's Distance</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Metric</span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">
                    {summary.today_km} <span className="text-xs font-bold text-slate-400">km</span>
                  </p>
                </div>

                {/* Pending Claims */}
                <Link to="/claims" className="group bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Pending Claims</h3>
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                      <FaHourglassHalf className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">{summary.pending_claims}</p>
                </Link>

                {/* Approved Claims */}
                <Link to="/claims" className="group bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col justify-between min-h-[110px] sm:min-h-[130px]">
                  <div className="flex justify-between items-start">
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-tight">Approved Claims</h3>
                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white">
                      <FaCheckCircle className="text-xs sm:text-sm" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">{summary.approved_claims}</p>
                </Link>

              </div>
            </div>

          </div>
        )}
      </div>
    </TherapistLayout>
  )
}

export default TherapistDashboard