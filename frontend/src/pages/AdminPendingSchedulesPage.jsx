import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useNavigate } from "react-router-dom"
import { FaSearch, FaUserInjured, FaUserMd, FaUserPlus, FaCalendarAlt, FaSlidersH } from "react-icons/fa"

import AdminLayout from "../layouts/AdminLayout"
import { getPendingSchedules } from "../services/scheduleService"
import { exportSchedulePdf } from "../utils/pdfExport"

function AdminPendingSchedulesPage() {
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const navigate = useNavigate()
  const [searchPatient, setSearchPatient] = useState("")
  const [searchDoctor, setSearchDoctor] = useState("")
  const [searchTherapist, setSearchTherapist] = useState("")

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getPendingSchedules(token)
      setSchedules(data)
    } catch (error) {
      console.error(error)
      toast.error("Failed to load pending schedules")
    } finally {
      setLoading(false)
    }
  }

  const renderPriorityBadge = (priority) => {
    const baseClass = "px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 uppercase tracking-wider"
    if (priority?.toLowerCase() === "important") {
      return <span className={`${baseClass} bg-amber-50 text-amber-700 border border-amber-200/60`}>⚠️ Important</span>
    }
    return <span className={`${baseClass} bg-slate-50 text-slate-600 border border-slate-200/60`}>Normal</span>
  }

  const labelClasses = "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1"

  if (loading) {
    return (
      <AdminLayout>
        <div className="w-full max-w-7xl mx-auto px-1 sm:px-4 py-2 space-y-6 animate-pulse">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3"></div>
          <div className="h-16 bg-slate-200 rounded-xl w-full"></div>
          <div className="h-64 bg-slate-200 rounded-2xl w-full"></div>
        </div>
      </AdminLayout>
    )
  }

  const filteredSchedules = schedules.filter(schedule =>
    (schedule.patient_name || "").toLowerCase().includes(searchPatient.toLowerCase()) &&
    (schedule.doctor_name || "").toLowerCase().includes(searchDoctor.toLowerCase()) &&
    (schedule.therapist_name || "").toLowerCase().includes(searchTherapist.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-1 sm:px-4 py-2">
        
        {/* Page Header Header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                Pending Schedules
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
                Real-time queue tracking incoming treatment configurations requiring review and verification.
              </p>
            </div>
            <button
              onClick={() => exportSchedulePdf("Pending-Schedules", filteredSchedules)}
              disabled={filteredSchedules.length === 0}
              className="inline-flex items-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm mt-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download PDF
            </button>
          </div>
        </div>

        {/* Unified Search Filter Controls Section */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <FaSlidersH className="text-xs text-slate-400" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Search Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* Patient Search */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-xs">
                <FaUserInjured />
              </span>
              <input
                type="text"
                placeholder="Search by patient..."
                value={searchPatient}
                onChange={(e) => setSearchPatient(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Doctor Search */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-xs">
                <FaUserMd />
              </span>
              <input
                type="text"
                placeholder="Search by doctor..."
                value={searchDoctor}
                onChange={(e) => setSearchDoctor(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Therapist Search */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-xs">
                <FaUserPlus />
              </span>
              <input
                type="text"
                placeholder="Search by therapist..."
                value={searchTherapist}
                onChange={(e) => setSearchTherapist(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

          </div>
        </div>

        {/* Workspace Display Area */}
        {filteredSchedules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center max-w-xl mx-auto my-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-lg text-slate-400">
              <FaSearch />
            </div>
            <p className="text-slate-700 font-bold text-sm sm:text-base">
              No matching schedules found
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Try updating your search fields or check back later for new entries.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View Layout Layer */}
            <div className="hidden lg:block overflow-hidden bg-white border border-slate-200/60 rounded-2xl shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/60">
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Patient</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Doctor</th> 
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Therapist</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Treatment Target</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Pattern</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Target Date</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Priority</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSchedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 font-bold text-slate-800 text-xs whitespace-nowrap">
                        {schedule.patient_name}
                      </td>
                      <td className="p-4 font-semibold text-slate-600 text-xs whitespace-nowrap">
                        {schedule.doctor_name}
                      </td>
                      <td className="p-4 font-semibold text-slate-600 text-xs whitespace-nowrap">
                        {schedule.therapist_name}
                      </td>
                      <td className="p-4 font-semibold text-indigo-600 text-xs whitespace-nowrap">
                        {schedule.treatment_name}
                      </td>
                      <td className="p-4 font-medium text-slate-400 text-xs capitalize whitespace-nowrap">
                        {schedule.schedule_type === "one-time" ? "One-Time Visit" : schedule.schedule_type}
                      </td>
                      <td className="p-4 font-bold text-slate-500 text-xs whitespace-nowrap">
                        {schedule.treatment_date || schedule.start_date}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {renderPriorityBadge(schedule.priority)}
                      </td>
                      <td className="p-4 whitespace-nowrap text-right pr-6">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/schedule/${schedule.id}`)}
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl font-bold transition text-[11px] shadow-sm active:scale-95"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => navigate(`/admin/schedule/edit/${schedule.id}`)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl font-bold transition text-[11px] shadow-sm shadow-indigo-100 active:scale-95"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Card Block Grid */}
            <div className="lg:hidden space-y-4">
              {filteredSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-white border border-slate-200/60 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4 relative overflow-hidden"
                >
                  <div className={`absolute top-0 bottom-0 left-0 w-1 ${schedule.priority?.toLowerCase() === 'important' ? 'bg-amber-400' : 'bg-indigo-500'}`} />

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={labelClasses}>Patient Name</span>
                      <h3 className="font-bold text-sm text-slate-800 leading-tight">
                        {schedule.patient_name}
                      </h3>
                    </div>
                    <div>
                      {renderPriorityBadge(schedule.priority)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-1">
                    <div>
                      <span className={labelClasses}>Treatment Target</span>
                      <span className="text-xs font-bold text-indigo-600 block truncate">
                        {schedule.treatment_name}
                      </span>
                    </div>
                    <div>
                      <span className={labelClasses}>Schedule Pattern</span>
                      <span className="text-xs font-semibold text-slate-600 capitalize block truncate">
                        {schedule.schedule_type === "one_time" ? "One Time Visit" : schedule.schedule_type}
                      </span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-dashed border-slate-100 flex items-center gap-2">
                      <FaCalendarAlt className="text-xs text-slate-400 shrink-0" />
                      <div>
                        <span className={labelClasses}>Target Launch Date</span>
                        <span className="text-xs font-bold text-slate-600 block">
                          {schedule.treatment_date || schedule.start_date}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={() => navigate(`/admin/schedule/${schedule.id}`)}
                      className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 py-2.5 rounded-xl font-bold transition text-xs shadow-sm text-center active:scale-95"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => navigate(`/admin/schedule/edit/${schedule.id}`)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold transition text-xs shadow-md text-center active:scale-95"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminPendingSchedulesPage