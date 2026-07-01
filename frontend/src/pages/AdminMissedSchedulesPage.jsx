import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import { 
  FaSearch, 
  FaUserInjured, 
  FaUserMd, 
  FaUserPlus, 
  FaSlidersH, 
  FaExclamationTriangle, 
  FaNotesMedical 
} from "react-icons/fa"

import AdminLayout from "../layouts/AdminLayout"
import { getMissedSchedules } from "../services/scheduleService"
import { exportSchedulePdf } from "../utils/pdfExport"

function AdminMissedSchedulesPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [searchPatient, setSearchPatient] = useState("")
  const [searchDoctor, setSearchDoctor] = useState("")
  const [searchTherapist, setSearchTherapist] = useState("")

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
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

  const filteredSchedules = schedules.filter((schedule) => {
    const patientMatch = (schedule.patient_name || "").toLowerCase().includes(searchPatient.toLowerCase())
    const doctorMatch = (schedule.doctor_name || "").toLowerCase().includes(searchDoctor.toLowerCase())
    const therapistMatch = (schedule.therapist_name || "").toLowerCase().includes(searchTherapist.toLowerCase())
    return patientMatch && doctorMatch && therapistMatch
  })

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

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto px-1 sm:px-4 py-2">
        
        {/* Page Header Area */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                Missed Schedules
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
                View historical anomalies and treatment files marked as missed by active clinical staff.
              </p>
            </div>
            <button
              onClick={() => exportSchedulePdf("Missed-Schedules", filteredSchedules)}
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
              No matching missed records found
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Try adjusting your configuration filters or check general log tables.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View Layout Layer */}
            <div className="hidden lg:block overflow-hidden bg-white border border-slate-200/60 rounded-2xl shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/60 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-5">Patient</th>
                    <th className="p-4">Doctor</th>
                    <th className="p-4">Therapist</th>
                    <th className="p-4">Treatment Target</th>
                    <th className="p-4">Missed Reason Exception</th>
                    <th className="p-4 text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-semibold">
                  {filteredSchedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 pl-5 font-bold text-slate-800">{schedule.patient_name}</td>
                      <td className="p-4 text-slate-600">{schedule.doctor_name}</td>
                      <td className="p-4 text-slate-600">{schedule.therapist_name}</td>
                      <td className="p-4">
                        <span className="bg-indigo-50/60 text-indigo-700 text-[11px] px-2.5 py-1 rounded-lg font-bold border border-indigo-100/40">
                          {schedule.treatment_name}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-rose-700 font-bold text-[11px] bg-rose-50 border border-rose-100/70 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 max-w-xs truncate">
                          ⚠️ {schedule.missed_reason || "No explicit reason logged"}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-6">
                        <button
                          onClick={() => navigate(`/admin/schedule/${schedule.id}`)}
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl font-bold transition text-[11px] shadow-sm active:scale-95"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Card Block Grid */}
            <div className="lg:hidden space-y-4">
              {filteredSchedules.map((schedule) => (
                <div key={schedule.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-0 w-1 bg-rose-400" />
                  
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className={labelClasses}>Patient Name</span>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight">{schedule.patient_name}</h3>
                      <span className="text-[11px] font-bold text-indigo-600 mt-1 block">{schedule.treatment_name}</span>
                    </div>
                    <span className="bg-rose-50 border border-rose-100 text-rose-700 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                      <FaExclamationTriangle className="text-[8px]" /> Missed
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-y-3 gap-x-3 text-xs border-t border-dashed border-slate-100 pt-3">
                    <div>
                      <span className={labelClasses}>Doctor</span>
                      <span className="font-bold text-slate-600 block truncate">{schedule.doctor_name}</span>
                    </div>
                    <div>
                      <span className={labelClasses}>Therapist</span>
                      <span className="font-bold text-slate-600 block truncate">{schedule.therapist_name}</span>
                    </div>
                  </div>

                  <div className="bg-rose-50/50 border border-rose-100/50 rounded-xl p-3 text-xs text-rose-900">
                    <div className="flex items-center gap-1 mb-1 text-rose-800 font-bold text-[10px] uppercase tracking-tight">
                      <FaNotesMedical className="text-rose-400 text-[9px]" />
                      <span>Missed Reason Exception</span>
                    </div>
                    <p className="font-semibold leading-relaxed">
                      {schedule.missed_reason || "No explicit operational error reason logged in system logs."}
                    </p>
                  </div>

                  <button
                    onClick={() => navigate(`/admin/schedule/${schedule.id}`)}
                    className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition active:scale-[0.98] shadow-sm tracking-wide"
                  >
                    View Operational Details
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminMissedSchedulesPage