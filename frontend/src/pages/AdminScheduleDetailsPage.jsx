import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"
import { getScheduleDetails } from "../services/scheduleService"
import { exportScheduleDetailPdf } from "../utils/pdfExport"

function AdminScheduleDetailsPage() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScheduleDetails()
  }, [])

  const fetchScheduleDetails = async () => {
    try {
      const token = localStorage.getItem("token")
      const data = await getScheduleDetails(id, token)
      setSchedule(data)
    } catch (error) {
      console.error(error)
      toast.error("Failed to load schedule")
    } finally {
      setLoading(false)
    }
  }

  // Enhanced Status Badge Generator matching design language
  const getStatusBadge = (status) => {
    const baseClass = "px-2.5 py-1 rounded-full text-xs font-bold inline-block capitalize tracking-wide shadow-sm"
    switch (status?.toLowerCase()) {
      case "completed":
        return <span className={`${baseClass} bg-green-100 text-green-800 ring-4 ring-green-50`}>{status}</span>
      case "scheduled":
        return <span className={`${baseClass} bg-blue-100 text-blue-800 ring-4 ring-blue-50`}>{status}</span>
      case "missed":
        return <span className={`${baseClass} bg-red-100 text-red-800 ring-4 ring-red-50`}>{status}</span>
      case "cancelled":
        return <span className={`${baseClass} bg-gray-100 text-gray-700 ring-4 ring-gray-50`}>{status}</span>
      default:
        return <span className={`${baseClass} bg-yellow-100 text-yellow-800 ring-4 ring-yellow-50`}>{status}</span>
    }
  }

  // Enhanced Priority Badge Generator matching design language
  const getPriorityBadge = (priority) => {
    const baseClass = "px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-block uppercase tracking-wider"
    if (priority?.toLowerCase() === "important") {
      return <span className={`${baseClass} bg-amber-100 text-amber-800 ring-4 ring-amber-50`}>⚠️ Important</span>
    }
    return <span className={`${baseClass} bg-blue-100 text-blue-800 ring-4 ring-blue-50`}>Normal</span>
  }

  // Universal typography tokens to align layouts cleanly
  const cardClasses = "bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-4"
  const labelClasses = "block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5"
  const valueClasses = "text-sm sm:text-base font-semibold text-gray-800 block"

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64 w-full">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!schedule) {
    return (
      <AdminLayout>
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 max-w-xl mx-auto my-6">
          <p className="text-gray-500 font-medium">Schedule target not found or has been modified.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-blue-600 hover:underline">
            ← Go Back
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto px-1 sm:px-4 py-2">
        
        {/* Page Top Context Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
              Schedule Details
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Comprehensive case file metrics, assignment targets, and routing timeline fields.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-center">
            {getStatusBadge(schedule.status)}
            <button
              onClick={() => exportScheduleDetailPdf(schedule)}
              className="inline-flex items-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 active:scale-95 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download PDF
            </button>
          </div>
        </div>

        <div className="space-y-6">

          {/* Card 1: Patient Details */}
          <div className={cardClasses}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 border-b border-gray-100 pb-2 mb-1 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-500 rounded-sm inline-block"></span>
              Patient Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <span className={labelClasses}>Patient Name</span>
                <span className="text-base sm:text-lg font-bold text-gray-900 block">{schedule.patient_name}</span>
              </div>
              <div className="md:col-span-2">
                <span className={labelClasses}>Address</span>
                <span className="text-sm text-gray-600 block leading-relaxed font-medium">{schedule.patient_address || "No address supplied."}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Assignment Metrics */}
          <div className={cardClasses}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 border-b border-gray-100 pb-2 mb-1 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-teal-500 rounded-sm inline-block"></span>
              Assignment Configuration
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3 shadow-sm">
                <span className={labelClasses}>Assigned Doctor</span>
                <span className={valueClasses}>{schedule.doctor_name || `ID: ${schedule.doctor_id}`}</span>
              </div>
              <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3 shadow-sm">
                <span className={labelClasses}>Assigned Therapist</span>
                <span className={valueClasses}>{schedule.therapist_name || `ID: ${schedule.therapist_id}`}</span>
              </div>
              <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-center">
                <span className={labelClasses}>Priority Tier</span>
                <div className="mt-0.5">{getPriorityBadge(schedule.priority)}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Treatment Details */}
          <div className={cardClasses}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 border-b border-gray-100 pb-2 mb-1 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-500 rounded-sm inline-block"></span>
              Treatment Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className={labelClasses}>Treatment Name</span>
                <span className="text-base font-bold text-blue-600 block">{schedule.treatment_name}</span>
              </div>
              <div>
                <span className={labelClasses}>Prescribed Medicines</span>
                <span className={`${valueClasses} font-medium text-gray-700`}>{schedule.medicines || "No diagnostic medicines logged."}</span>
              </div>
              <div className="md:col-span-2">
                <span className={labelClasses}>Special Care Instructions</span>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed break-words bg-gray-50 border border-gray-100 rounded-xl p-3 shadow-inner mt-1">
                  {schedule.instructions || "No custom medical operational updates registered for this window."}
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: Logistics & Schedule Mapping */}
          <div className={cardClasses}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 border-b border-gray-100 pb-2 mb-1 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-sm inline-block"></span>
              Schedule Logistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className={labelClasses}>Schedule Configuration</span>
                <span className={`${valueClasses} capitalize`}>
                  {schedule.schedule_type === "one_time" ? "One Time Visit" : "Recurring Range"}
                </span>
              </div>

              {schedule.schedule_type === "one_time" ? (
                <div>
                  <span className={labelClasses}>Treatment Date</span>
                  <span className={valueClasses}>{schedule.treatment_date || "-"}</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={labelClasses}>Start Date</span>
                    <span className={valueClasses}>{schedule.start_date || "-"}</span>
                  </div>
                  <div>
                    <span className={labelClasses}>End Date</span>
                    <span className={valueClasses}>{schedule.end_date || "-"}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-dashed border-gray-100">
              <div>
                <span className={labelClasses}>Expected In-Time</span>
                <span className="font-bold text-gray-700 tracking-wide text-sm sm:text-base">{schedule.in_time}</span>
              </div>
              <div>
                <span className={labelClasses}>Expected Out-Time</span>
                <span className="font-bold text-gray-700 tracking-wide text-sm sm:text-base">{schedule.out_time}</span>
              </div>
            </div>
          </div>

          {/* Conditional Sections */}
          {schedule.completion_notes && (
            <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 sm:p-5 space-y-2 shadow-sm">
              <h3 className="text-xs sm:text-sm font-bold text-green-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Therapist Completion Notes
              </h3>
              <p className="text-xs sm:text-sm text-green-700 leading-relaxed font-medium break-words bg-white/80 border border-green-100/50 rounded-xl p-3">
                {schedule.completion_notes}
              </p>
            </div>
          )}

          {schedule.missed_reason && (
            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 sm:p-5 space-y-2 shadow-sm">
              <h3 className="text-xs sm:text-sm font-bold text-red-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Cancellation / Missed Reason Log
              </h3>
              <p className="text-xs sm:text-sm text-red-700 leading-relaxed font-medium break-words bg-white/80 border border-red-100/50 rounded-xl p-3">
                {schedule.missed_reason}
              </p>
            </div>
          )}

        </div>

        {/* Dynamic Action Buttons Footer Block */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 mt-8 pt-4 border-t border-gray-100">
          <button
            onClick={() => navigate(-1)}
            className="w-full sm:w-32 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-5 py-2.5 rounded-xl font-semibold transition text-sm shadow-sm text-center"
          >
            ← Back
          </button>
          
          <button
            onClick={() => navigate(`/admin/schedule/edit/${schedule.id}`)}
            className="w-full sm:w-44 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition text-sm shadow-md active:scale-[0.99] text-center"
          >
            Edit Schedule
          </button>
        </div>

      </div>
    </AdminLayout>
  )
}

export default AdminScheduleDetailsPage