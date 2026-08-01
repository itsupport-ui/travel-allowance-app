import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaCalendarDay,
  FaClock,
  FaEye,
  FaPhoneAlt,
  FaPlay,
  FaStopCircle,
} from "react-icons/fa"

import DoctorLayout from "../layouts/DoctorLayout"
import {
  getDoctorVisit,
  getDoctorVisitSession,
  getMyDoctorVisits,
  punchInDoctorVisit,
  punchOutDoctorVisit,
} from "../services/doctorVisitService"


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"


const getLocalDate = () => {
  const now = new Date()
  const localTime = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )
  return localTime.toISOString().slice(0, 10)
}


const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ")
  }
  return fallback
}


const formatDate = (value) => {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}


const formatDateTime = (value) => {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

const formatDuration = (seconds) => {
  const value = Number(seconds) || 0
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const remainingSeconds = value % 60
  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${remainingSeconds}s`
}

const sessionElapsed = (session) => {
  if (!session) return 0
  if (
    session.session_status === "IN_PROGRESS" &&
    session.punch_in_time
  ) {
    return Math.max(
      session.elapsed_seconds || 0,
      Math.floor(
        (Date.now() - new Date(session.punch_in_time).getTime()) / 1000
      )
    )
  }
  return session.treatment_duration || 0
}


function Modal({ title, description, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}


function StatusBadge({ value }) {
  const normalized = value || "scheduled"
  const colorMap = {
    scheduled: "border-blue-200 bg-blue-50 text-blue-700",
    visited: "border-emerald-200 bg-emerald-50 text-emerald-700",
    treatment_plan_submitted:
      "border-violet-200 bg-violet-50 text-violet-700",
    cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${
        colorMap[normalized] || colorMap.scheduled
      }`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  )
}


function DetailItem({ label, value, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {value || "—"}
      </dd>
    </div>
  )
}


function DoctorVisitsPage() {
  const [visits, setVisits] = useState([])
  const [activeTab, setActiveTab] = useState("today")
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedVisit, setSelectedVisit] = useState(null)
  const [remarks, setRemarks] = useState("")
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState("")
  const [, setElapsedTick] = useState(0)

  const today = getLocalDate()

  useEffect(() => {
    const token = localStorage.getItem("token")

    getMyDoctorVisits(token)
      .then((data) => {
        setVisits(data || [])
      })
      .catch((error) => {
        toast.error(
          getErrorMessage(error, "Failed to load assigned visits")
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    if (session?.session_status !== "IN_PROGRESS") return undefined
    const timer = window.setInterval(
      () => setElapsedTick((value) => value + 1),
      1000
    )
    return () => window.clearInterval(timer)
  }, [session?.session_status])

  const captureLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported by this browser"))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })
    })

  const loadSession = async (visit) => {
    if (visit.status !== "scheduled") {
      setSession(null)
      return
    }
    try {
      setSessionLoading(true)
      setSessionError("")
      const token = localStorage.getItem("token")
      let coordinates
      if (visit.session_status !== "IN_PROGRESS") {
        const position = await captureLocation()
        coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
      }
      const data = await getDoctorVisitSession(
        visit.id,
        token,
        coordinates
      )
      setSession(data)
    } catch (error) {
      setSessionError(
        getErrorMessage(error, "Unable to verify visit location")
      )
    } finally {
      setSessionLoading(false)
    }
  }

  const todayVisits = useMemo(
    () =>
      visits
        .filter((visit) => visit.visit_date === today)
        .sort((left, right) =>
          (left.visit_time || "").localeCompare(right.visit_time || "")
        ),
    [today, visits]
  )

  const upcomingVisits = useMemo(
    () =>
      visits
        .filter((visit) => visit.visit_date > today)
        .sort((left, right) => {
          const dateComparison = left.visit_date.localeCompare(
            right.visit_date
          )
          if (dateComparison !== 0) return dateComparison
          return (left.visit_time || "").localeCompare(
            right.visit_time || ""
          )
        }),
    [today, visits]
  )

  const visibleVisits =
    activeTab === "today" ? todayVisits : upcomingVisits

  const closeModal = () => {
    if (actionId !== null) return
    setModal(null)
    setSelectedVisit(null)
    setRemarks("")
    setSession(null)
    setSessionError("")
  }

  const openDetails = async (visit) => {
    try {
      setActionId(`view-${visit.id}`)
      const token = localStorage.getItem("token")
      const data = await getDoctorVisit(visit.id, token)
      setSelectedVisit(data)
      setModal("details")
      await loadSession(data)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to load visit details"))
    } finally {
      setActionId(null)
    }
  }

  const handlePunchIn = async () => {
    if (
      !selectedVisit ||
      !window.confirm(
        `Punch in for ${selectedVisit.patient_name}?`
      )
    ) {
      return
    }
    try {
      setActionId(`punch-in-${selectedVisit.id}`)
      const position = await captureLocation()
      const token = localStorage.getItem("token")
      const data = await punchInDoctorVisit(
        selectedVisit.id,
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        token
      )
      setSession(data)
      toast.success("Treatment started")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to Punch In"))
    } finally {
      setActionId(null)
    }
  }

  const handlePunchOut = async () => {
    if (
      !selectedVisit ||
      !window.confirm(
        "Punch out and complete this patient visit?"
      )
    ) {
      return
    }
    try {
      setActionId(`punch-out-${selectedVisit.id}`)
      const position = await captureLocation()
      const token = localStorage.getItem("token")
      await punchOutDoctorVisit(
        selectedVisit.id,
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          remarks: remarks.trim() || null,
        },
        token
      )
      const updatedVisit = await getDoctorVisit(
        selectedVisit.id,
        token
      )
      setSelectedVisit(updatedVisit)
      setVisits((current) =>
        current.map((visit) =>
          visit.id === updatedVisit.id ? updatedVisit : visit
        )
      )
      setSession(null)
      toast.success("Visit completed")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to Punch Out"))
    } finally {
      setActionId(null)
    }
  }

  const renderActions = (visit, mobile = false) => {
    const isViewing = actionId === `view-${visit.id}`
    return (
      <div
        className={`flex gap-2 ${
          mobile ? "grid grid-cols-2" : "justify-end"
        }`}
      >
        <button
          type="button"
          disabled={isViewing}
          onClick={() => openDetails(visit)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <FaEye />
          {isViewing ? "Loading..." : "View"}
        </button>
      </div>
    )
  }

  return (
    <DoctorLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            My Visits
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review today&apos;s patient visits and upcoming appointments.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              activeTab === "today"
                ? "border-blue-200 bg-blue-50"
                : "border-slate-100 bg-white hover:border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Today
              </span>
              <FaCalendarDay
                className={
                  activeTab === "today"
                    ? "text-blue-600"
                    : "text-slate-400"
                }
              />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {todayVisits.length}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("upcoming")}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              activeTab === "upcoming"
                ? "border-violet-200 bg-violet-50"
                : "border-slate-100 bg-white hover:border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Upcoming
              </span>
              <FaClock
                className={
                  activeTab === "upcoming"
                    ? "text-violet-600"
                    : "text-slate-400"
                }
              />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {upcomingVisits.length}
            </p>
          </button>
        </div>

        <div className="space-y-4 md:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
              Loading visits...
            </div>
          ) : visibleVisits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No {activeTab} visits found.
            </div>
          ) : (
            visibleVisits.map((visit) => (
              <article
                key={visit.id}
                className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {visit.patient_name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <FaPhoneAlt />
                      {visit.patient_phone}
                    </p>
                  </div>
                  <StatusBadge value={visit.status} />
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Date</dt>
                    <dd className="mt-0.5 font-medium text-slate-700">
                      {formatDate(visit.visit_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Time</dt>
                    <dd className="mt-0.5 font-medium text-slate-700">
                      {visit.visit_time?.slice(0, 5)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-400">
                      Chief complaint
                    </dt>
                    <dd className="mt-0.5 text-slate-700">
                      {visit.chief_complaint || "—"}
                    </dd>
                  </div>
                </dl>

                {renderActions(visit, true)}
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3.5">Patient</th>
                  <th className="px-4 py-3.5">Schedule</th>
                  <th className="px-4 py-3.5">Chief complaint</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Loading visits...
                    </td>
                  </tr>
                ) : visibleVisits.length === 0 ? (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No {activeTab} visits found.
                    </td>
                  </tr>
                ) : (
                  visibleVisits.map((visit) => (
                    <tr
                      key={visit.id}
                      className="align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {visit.patient_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {visit.patient_phone}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{formatDate(visit.visit_date)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {visit.visit_time?.slice(0, 5)}
                        </p>
                      </td>
                      <td className="max-w-[280px] px-4 py-4 text-sm text-slate-700">
                        <p className="line-clamp-2">
                          {visit.chief_complaint || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge value={visit.status} />
                      </td>
                      <td className="px-4 py-4">
                        {renderActions(visit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal === "details" && selectedVisit && (
        <Modal
          title="Visit details"
          description={`Doctor visit #${selectedVisit.id}`}
          onClose={closeModal}
        >
          <div className="space-y-6">
            <StatusBadge value={selectedVisit.status} />

            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DetailItem
                label="Patient"
                value={selectedVisit.patient_name}
              />
              <DetailItem
                label="Phone"
                value={selectedVisit.patient_phone}
              />
              <DetailItem
                label="Address"
                value={selectedVisit.patient_address}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Visit date"
                value={formatDate(selectedVisit.visit_date)}
              />
              <DetailItem
                label="Visit time"
                value={selectedVisit.visit_time?.slice(0, 5)}
              />
              <DetailItem
                label="Chief complaint"
                value={selectedVisit.chief_complaint}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Remarks"
                value={selectedVisit.remarks}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Completed"
                value={formatDateTime(selectedVisit.completed_at)}
              />
            </dl>

            {selectedVisit.status === "scheduled" && (
              <section className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-bold text-slate-900">
                  Visit session
                </h3>
                {sessionLoading ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Verifying attendance and patient location...
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
                    <DetailItem
                      label="Status"
                      value={
                        session?.session_status ||
                        selectedVisit.session_status
                      }
                    />
                    <DetailItem
                      label="Punch In"
                      value={formatDateTime(
                        session?.punch_in_time ||
                          selectedVisit.punch_in_time
                      )}
                    />
                    <DetailItem
                      label="Duration"
                      value={formatDuration(sessionElapsed(session))}
                    />
                  </div>
                )}
                {session?.eligibility_message && (
                  <p className="mt-3 text-xs text-slate-600">
                    {session.eligibility_message}
                  </p>
                )}
                {sessionError && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
                    <span>{sessionError}</span>
                    <button
                      type="button"
                      onClick={() => loadSession(selectedVisit)}
                      className="font-bold text-blue-700"
                    >
                      Retry
                    </button>
                  </div>
                )}
                <div className="mt-4">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Completion remarks
                  </label>
                  <textarea
                    rows="3"
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </section>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
              {session?.can_punch_in && (
                <button
                  type="button"
                  disabled={actionId !== null}
                  onClick={handlePunchIn}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <FaPlay />
                  {actionId === `punch-in-${selectedVisit.id}`
                    ? "Punching In..."
                    : "Punch In"}
                </button>
              )}
              {session?.can_punch_out && (
                <button
                  type="button"
                  disabled={actionId !== null}
                  onClick={handlePunchOut}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
                >
                  <FaStopCircle />
                  {actionId === `punch-out-${selectedVisit.id}`
                    ? "Punching Out..."
                    : "Punch Out"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

    </DoctorLayout>
  )
}


export default DoctorVisitsPage
