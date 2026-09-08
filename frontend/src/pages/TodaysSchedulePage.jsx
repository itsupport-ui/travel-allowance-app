import { Fragment, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { 
  FaUserMd, 
  FaPills, 
  FaBriefcaseMedical, 
  FaCalendarAlt, 
  FaClock, 
  FaMapMarkerAlt, 
  FaInfoCircle, 
  FaCheckCircle, 
  FaTimesCircle, 
  FaCalendarCheck,
  FaHeartbeat
} from "react-icons/fa"

import TherapistLayout from "../layouts/TherapistLayout"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import LocationExceptionDialog from "../components/location/LocationExceptionDialog"
import PageState from "../components/ui/PageState"
import {
  getTodaySchedules,
  missedSchedule
} from "../services/scheduleService"
import {
  getTreatmentSession,
  punchInTreatment,
  punchOutTreatment,
} from "../services/treatmentSessionService"
import { requestLocationException } from "../services/locationExceptionService"

const formatSessionTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Not recorded"

const formatDuration = (totalSeconds = 0) => {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return `${hours ? `${hours}h ` : ""}${minutes}m ${remaining}s`
}

const getElapsedSeconds = (session) => {
  if (!session) return 0
  if (session.session_status === "IN_PROGRESS" && session.punch_in_time) {
    return Math.max(
      session.elapsed_seconds || 0,
      Math.floor(
        (Date.now() - new Date(session.punch_in_time).getTime()) / 1000,
      ),
    )
  }
  return session.treatment_duration || 0
}

function TodaysSchedulePage({ embedded = false }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [completionSchedule, setCompletionSchedule] = useState(null)
  const [completionForm, setCompletionForm] = useState({
    completion_notes: "",
    transport_mode: "vehicle",
    bill_amount: "",
    invoice_file: null
  })
  const [completing, setCompleting] = useState(false)
  const [sessions, setSessions] = useState({})
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState("")
  const [punchInTarget, setPunchInTarget] = useState(null)
  const [punchingIn, setPunchingIn] = useState(false)
  const [exceptionTarget, setExceptionTarget] = useState(null)
  const [exceptionReason, setExceptionReason] = useState("")
  const [requestingException, setRequestingException] = useState(false)
  const [, setElapsedTick] = useState(0)
  const PageLayout = embedded ? Fragment : TherapistLayout

  const getCurrentPosition = () => {
    if (!navigator.geolocation) {
      return Promise.reject(
        new Error("Location capture is not supported by this browser")
      )
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      })
    })
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsedTick((value) => value + 1),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [])

  async function loadSessionStates(scheduleData) {
    if (!scheduleData.length) {
      setSessions({})
      return
    }
    setSessionLoading(true)
    setSessionError("")
    const token = localStorage.getItem("token")
    let coordinates
    try {
      const position = await getCurrentPosition()
      coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        gps_accuracy_m: position.coords.accuracy,
        device_timestamp: new Date(position.timestamp).toISOString(),
      }
    } catch (error) {
      setSessionError(
        error.message || "Unable to verify your current location",
      )
    }

    try {
      const results = await Promise.all(
        scheduleData.map((schedule) =>
          getTreatmentSession(schedule.id, token, coordinates),
        ),
      )
      setSessions(
        Object.fromEntries(
          results.map((session) => [session.schedule_id, session]),
        ),
      )
    } catch (error) {
      setSessionError(error.message || "Failed to load treatment sessions")
    } finally {
      setSessionLoading(false)
    }
  }

  const fetchSchedules = async () => {
    setLoading(true)
    setLoadError("")
    try {
      const token = localStorage.getItem("token")
      const data = await getTodaySchedules(token)
      setSchedules(data)
      await loadSessionStates(data)
    } catch (error) {
      console.error(error)
      setLoadError(error.message || "Failed to load today's schedules")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Load schedules and their location eligibility on entry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSchedules()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePunchIn = async () => {
    if (!punchInTarget) return
    try {
      setPunchingIn(true)
      const token = localStorage.getItem("token")
      const position = await getCurrentPosition()
      await punchInTreatment(punchInTarget.id, token, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        gps_accuracy_m: position.coords.accuracy,
        location_exception_id:
          sessions[punchInTarget.id]?.location_exception_id,
      })
      toast.success("Treatment started")
      setPunchInTarget(null)
      await fetchSchedules()
    } catch (error) {
      toast.error(error.message || "Unable to punch in")
    } finally {
      setPunchingIn(false)
    }
  }

  const openExceptionRequest = (schedule) => {
    setExceptionTarget({
      schedule,
      action:
        sessions[schedule.id]?.session_status === "IN_PROGRESS"
          ? "punch_out"
          : "punch_in",
    })
    setExceptionReason("")
  }

  const submitExceptionRequest = async (event) => {
    event.preventDefault()
    if (!exceptionTarget || exceptionReason.trim().length < 10) {
      toast.error("Provide at least 10 characters explaining the GPS issue")
      return
    }
    try {
      setRequestingException(true)
      const position = await getCurrentPosition()
      const token = localStorage.getItem("token")
      await requestLocationException(
        {
          target_type: "therapist_schedule",
          target_id: exceptionTarget.schedule.id,
          action: exceptionTarget.action,
          reason: exceptionReason.trim(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gps_accuracy_m: Math.max(position.coords.accuracy || 1, 1),
          device_timestamp: new Date(position.timestamp).toISOString(),
        },
        token,
      )
      toast.success("Location exception sent for administrator review")
      setExceptionTarget(null)
      setExceptionReason("")
      await fetchSchedules()
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Unable to request exception")
    } finally {
      setRequestingException(false)
    }
  }

  const openCompletion = (schedule) => {
    setCompletionSchedule(schedule)
    setCompletionForm({
      completion_notes: "",
      transport_mode: "vehicle",
      bill_amount: "",
      invoice_file: null
    })
  }

  const closeCompletion = () => {
    if (completing) return
    setCompletionSchedule(null)
  }

  const handleCompletionChange = (event) => {
    const { name, value, files } = event.target
    setCompletionForm((current) => ({
      ...current,
      [name]: files ? files[0] : value
    }))
  }

  const handleComplete = async (event) => {
    event.preventDefault()
    if (!completionSchedule) return

    const isVehicle = completionForm.transport_mode === "vehicle"

    if (!isVehicle && (!completionForm.bill_amount || !completionForm.invoice_file)) {
      toast.error("Bill amount and invoice are required for this transport mode")
      return
    }

    try {
      setCompleting(true)
      const token = localStorage.getItem("token")
      const position = await getCurrentPosition()

      const result = await punchOutTreatment(completionSchedule.id, token, {
        completion_notes: completionForm.completion_notes,
        transport_mode: completionForm.transport_mode,
        bill_amount: isVehicle ? null : Number(completionForm.bill_amount),
        invoice_file: isVehicle ? null : completionForm.invoice_file,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        gps_accuracy_m: position.coords.accuracy,
        location_exception_id:
          sessions[completionSchedule.id]?.location_exception_id,
      })

      toast.success("Treatment punched out and completed")
      if (result.arrival_warning) {
        toast(result.arrival_warning, { duration: 5000 })
      }
      setCompletionSchedule(null)
      fetchSchedules()
    } catch (error) {
      console.error(error)
      toast.error(
        error.message || "Failed to capture location and update status record"
      )
    } finally {
      setCompleting(false)
    }
  }

  const handleMissed = async (id) => {
    const reason = prompt("Missed Reason Exception Details:")
    if (reason === null) return

    try {
      const token = localStorage.getItem("token")
      await missedSchedule(id, reason, token)
      toast.success("Marked as missed anomaly")
      fetchSchedules()
    } catch {
      toast.error("Failed to complete record modification")
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
      <PageLayout>
        <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-2 space-y-4 animate-pulse">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3 mb-6"></div>
          <div className="h-48 bg-slate-200 rounded-2xl w-full"></div>
          <div className="h-48 bg-slate-200 rounded-2xl w-full"></div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-2">

        {/* Page Header Area */}
        {!embedded && <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
            Today's Schedule
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Your active assigned treatments and clinical visits scheduled for the current shift timeline.
          </p>
        </div>}

        {/* Schedule Execution Framework */}
        {loadError ? (
          <PageState error={loadError} onRetry={fetchSchedules} />
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-lg text-emerald-500">
              <FaCalendarCheck />
            </div>
            <p className="text-slate-700 font-bold text-sm sm:text-base">
              No clinical schedules assigned for today
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Your workflow calendar is clear. New dispatch items will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 sm:p-5 relative overflow-hidden group hover:border-slate-300 transition-all duration-200"
              >
                {/* Status Indicator Side Pillar Accent */}
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-slate-200 group-hover:bg-indigo-400 transition-colors" />

                {/* Patient Header Identity Row Block */}
                <div className="flex justify-between items-start gap-4 border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <span className={labelClasses}>Patient Profile</span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
                      {schedule.patient_name}
                    </h2>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={labelClasses}>Priority Matrix</span>
                    {getPriorityBadge(schedule.priority)}
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
                      
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Doctor</span>
                      <span className="text-slate-700 font-bold">{schedule.doctor_name}</span>
                    </div>
                  </div>

                  {/* Treatment Target Field */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-indigo-500 shrink-0 shadow-sm">
                      <FaBriefcaseMedical />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Assigned Treatment</span>
                      <span className="text-slate-700 font-bold">{schedule.treatment_name}</span>
                    </div>
                  </div>

                  {/* Medication Field */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaPills />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Prescribed Medicines</span>
                      <span className="text-slate-700 font-bold truncate max-w-[180px] block">
                        {schedule.medicines || "None Specified"}
                      </span>
                    </div>
                  </div>

                  {/* Schedule Configuration Type */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaHeartbeat />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Schedule Protocol</span>
                      <span className="text-slate-700 font-bold capitalize">
                        {schedule.schedule_type?.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Calendar Allocation Dates */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaCalendarAlt />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Calendar Date Timeline</span>
                      <span className="text-slate-700 font-bold tracking-tight">
                        {schedule.schedule_type === "one_time"
                          ? schedule.treatment_date
                          : `${schedule.start_date} → ${schedule.end_date}`}
                      </span>
                    </div>
                  </div>

                  {/* Time Window Allocation */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaClock />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Operational Window</span>
                      <span className="text-slate-700 font-bold tracking-wide">
                        {schedule.in_time} - {schedule.out_time}
                      </span>
                    </div>
                  </div>

                  {/* Navigation Location Address Block */}
                  <div className="flex items-start gap-2.5 sm:col-span-2 border-t border-slate-200/40 pt-2.5 mt-1">
                    <div className="p-1.5 bg-white border border-slate-200/60 rounded-lg text-slate-500 shrink-0 shadow-sm">
                      <FaMapMarkerAlt />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-0.5">Patient Deployment Address</span>
                      <span className="text-slate-700 font-semibold leading-normal block">
                        {schedule.patient_address}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Explicit Operational Instructions Block Element */}
                <div className="mt-4">
                  <div className="flex items-center gap-1 mb-1 pl-0.5 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                    <FaInfoCircle className="text-[9px]" />
                    <span>Special Task Instructions</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed bg-white border border-slate-200/50 rounded-xl p-3 font-medium">
                    {schedule.instructions || "No custom assignment profile instructions provided."}
                  </p>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Treatment Session
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700">
                      {(sessions[schedule.id]?.session_status || "VERIFYING").replaceAll("_", " ")}
                    </span>
                  </div>
                  {sessionLoading && !sessions[schedule.id] ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Verifying workday and patient location...
                    </p>
                  ) : sessions[schedule.id] ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-slate-400">Punch In</span>
                        <p className="mt-1 font-bold text-slate-700">
                          {formatSessionTime(sessions[schedule.id].punch_in_time)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">
                          {sessions[schedule.id].session_status === "IN_PROGRESS"
                            ? "Elapsed"
                            : "Duration"}
                        </span>
                        <p className="mt-1 font-bold text-slate-700">
                          {formatDuration(getElapsedSeconds(sessions[schedule.id]))}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Punch Out</span>
                        <p className="mt-1 font-bold text-slate-700">
                          {formatSessionTime(sessions[schedule.id].punch_out_time)}
                        </p>
                      </div>
                      <p className={`col-span-2 rounded-lg p-2 text-[11px] sm:col-span-3 ${
                        sessions[schedule.id].location_verified === false
                          ? "bg-rose-50 text-rose-700"
                          : "bg-blue-50 text-blue-700"
                      }`}>
                        {sessions[schedule.id].eligibility_message}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-rose-600">
                      {sessionError || "Unable to verify treatment session."}
                    </p>
                  )}
                </div>

                {/* Operations Validation Bottom Controls */}
                <div className="flex flex-col sm:flex-row gap-2 mt-5 pt-4 border-t border-slate-100">
                  {sessions[schedule.id]?.can_punch_in && (
                    <button
                      type="button"
                      onClick={() => setPunchInTarget(schedule)}
                      className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 order-1 sm:order-2"
                    >
                      <FaCheckCircle className="text-[11px]" /> Punch In
                    </button>
                  )}

                  {sessions[schedule.id]?.can_punch_out && (
                    <button
                      type="button"
                      onClick={() => openCompletion(schedule)}
                      className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 order-1 sm:order-2"
                    >
                      <FaCheckCircle className="text-[11px]" /> Punch Out
                    </button>
                  )}

                  {sessions[schedule.id]?.can_request_location_exception && (
                    <button
                      type="button"
                      onClick={() => openExceptionRequest(schedule)}
                      className="w-full sm:flex-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                    >
                      Request location exception
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleMissed(schedule.id)}
                    className="w-full sm:flex-1 bg-white border border-slate-200 hover:bg-rose-50/50 hover:border-rose-200 text-slate-600 hover:text-rose-600 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 order-2 sm:order-1"
                  >
                    <FaTimesCircle className="text-[11px]" /> Mark as Missed Anomaly
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {completionSchedule && (
        <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center px-4">
          <form
            onSubmit={handleComplete}
            className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-5 space-y-4"
          >
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-800">
                Punch Out & Complete
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {completionSchedule.patient_name}
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Completion Notes
              </label>
              <textarea
                name="completion_notes"
                value={completionForm.completion_notes}
                onChange={handleCompletionChange}
                rows="3"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Transport Mode
              </label>
              <select
                name="transport_mode"
                value={completionForm.transport_mode}
                onChange={handleCompletionChange}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 font-semibold focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
              >
                <option value="vehicle">Vehicle</option>
                <option value="auto">Auto</option>
                <option value="bus">Bus</option>
                <option value="metro">Metro</option>
                <option value="cab">Cab</option>
              </select>
            </div>

            {completionForm.transport_mode !== "vehicle" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Bill Amount
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    name="bill_amount"
                    value={completionForm.bill_amount}
                    onChange={handleCompletionChange}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Invoice
                  </label>
                  <input
                    type="file"
                    name="invoice_file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleCompletionChange}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={closeCompletion}
                disabled={completing}
                className="w-full sm:w-auto bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={completing}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {completing ? "Capturing Location..." : "Punch Out & Complete"}
              </button>
            </div>
          </form>
        </div>
      )}
      <LocationExceptionDialog
        action={exceptionTarget?.action}
        busy={requestingException}
        open={Boolean(exceptionTarget)}
        reason={exceptionReason}
        targetLabel={exceptionTarget?.schedule?.patient_name || "this treatment"}
        onClose={() => setExceptionTarget(null)}
        onReasonChange={setExceptionReason}
        onSubmit={submitExceptionRequest}
      />
      <ConfirmDialog
        open={Boolean(punchInTarget)}
        title="Punch in to treatment?"
        message={
          punchInTarget
            ? `Start the treatment session for ${punchInTarget.patient_name}. A fresh GPS position will be validated.`
            : ""
        }
        confirmLabel="Punch In"
        busy={punchingIn}
        onClose={() => setPunchInTarget(null)}
        onConfirm={handlePunchIn}
      />
    </PageLayout>
  )
}

export default TodaysSchedulePage
