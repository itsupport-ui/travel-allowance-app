import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaCalendarCheck,
  FaCalendarDay,
  FaClock,
  FaEye,
  FaMapMarkerAlt,
  FaPhoneAlt,
} from "react-icons/fa"

import DoctorLayout from "../layouts/DoctorLayout"
import {
  getDoctorVisit,
  getMyDoctorVisits,
  updateDoctorVisitStatus,
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
  }

  const openDetails = async (visit) => {
    try {
      setActionId(`view-${visit.id}`)
      const token = localStorage.getItem("token")
      const data = await getDoctorVisit(visit.id, token)
      setSelectedVisit(data)
      setModal("details")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to load visit details"))
    } finally {
      setActionId(null)
    }
  }

  const openVisitedModal = (visit) => {
    setSelectedVisit(visit)
    setRemarks(visit.remarks || "")
    setModal("visited")
  }

  const markVisited = async (event) => {
    event.preventDefault()
    if (!selectedVisit) return

    try {
      setActionId(`visited-${selectedVisit.id}`)
      const token = localStorage.getItem("token")
      const updatedVisit = await updateDoctorVisitStatus(
        selectedVisit.id,
        {
          status: "visited",
          remarks: remarks.trim() || null,
        },
        token
      )

      setVisits((current) =>
        current.map((visit) =>
          visit.id === updatedVisit.id ? updatedVisit : visit
        )
      )
      setModal(null)
      setSelectedVisit(null)
      setRemarks("")
      toast.success("Visit marked as visited")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update visit"))
    } finally {
      setActionId(null)
    }
  }

  const renderActions = (visit, mobile = false) => {
    const isViewing = actionId === `view-${visit.id}`
    const canMarkVisited = visit.status === "scheduled"

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
        {canMarkVisited && (
          <button
            type="button"
            onClick={() => openVisitedModal(visit)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            <FaCalendarCheck />
            Mark visited
          </button>
        )}
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

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
              {selectedVisit.status === "scheduled" && (
                <button
                  type="button"
                  onClick={() => openVisitedModal(selectedVisit)}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                >
                  Mark visited
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {modal === "visited" && selectedVisit && (
        <Modal
          title="Mark visit as visited"
          description={`Confirm the completed visit for ${selectedVisit.patient_name}.`}
          onClose={closeModal}
        >
          <form onSubmit={markVisited} className="space-y-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="flex items-center gap-2 font-semibold">
                <FaCalendarCheck />
                {formatDate(selectedVisit.visit_date)} at{" "}
                {selectedVisit.visit_time?.slice(0, 5)}
              </p>
              <p className="mt-2 flex items-start gap-2 text-xs text-emerald-700">
                <FaMapMarkerAlt className="mt-0.5 shrink-0" />
                {selectedVisit.patient_address}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Remarks (optional)
              </label>
              <textarea
                rows="4"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                className={`${inputClass} resize-none`}
                placeholder="Add visit notes or remarks"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  actionId === `visited-${selectedVisit.id}`
                }
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionId === `visited-${selectedVisit.id}`
                  ? "Saving..."
                  : "Confirm visited"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </DoctorLayout>
  )
}


export default DoctorVisitsPage
