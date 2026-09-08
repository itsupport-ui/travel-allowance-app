import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaEye,
  FaPhoneAlt,
  FaSearch,
} from "react-icons/fa"

import DoctorLayout from "../layouts/DoctorLayout"
import {
  ConsultationLifecycleDialog,
  ConsultationTimeline,
} from "../components/consultations/ConsultationLifecycleDialog"
import {
  cancelDoctorConsultation,
  completeDoctorConsultation,
  getDoctorConsultation,
  getDoctorConsultationHistory,
  getMyDoctorConsultations,
  rescheduleDoctorConsultation,
  scheduleDoctorConsultationFollowUp,
} from "../services/doctorConsultationService"


const initialCompletionForm = {
  call_outcome: "",
  preliminary_diagnosis: "",
  proposed_treatment: "",
  estimated_amount: "",
  patient_decision: "pending",
  follow_up_date: "",
  follow_up_time: "",
  follow_up_reason: "",
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"


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
  const normalized = value || "pending"
  const colorMap = {
    scheduled: "border-blue-200 bg-blue-50 text-blue-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-slate-200 bg-slate-100 text-slate-600",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
    follow_up: "border-violet-200 bg-violet-50 text-violet-700",
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${
        colorMap[normalized] || colorMap.pending
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


function DoctorConsultationsPage() {
  const [consultations, setConsultations] = useState([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedConsultation, setSelectedConsultation] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [lifecycleMode, setLifecycleMode] = useState(null)
  const [completionForm, setCompletionForm] = useState(
    initialCompletionForm
  )

  useEffect(() => {
    const token = localStorage.getItem("token")

    getMyDoctorConsultations(token)
      .then((data) => {
        setConsultations(data || [])
      })
      .catch((error) => {
        toast.error(
          getErrorMessage(error, "Failed to load assigned consultations")
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const filteredConsultations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return consultations.filter((consultation) => {
      const matchesSearch =
        !normalizedSearch ||
        consultation.patient_name
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        consultation.patient_phone
          ?.toLowerCase()
          .includes(normalizedSearch)
      const matchesStatus =
        !statusFilter || consultation.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [consultations, search, statusFilter])

  const closeModal = () => {
    if (actionId !== null) return
    setModal(null)
    setSelectedConsultation(null)
    setHistory([])
  }

  const openDetails = async (consultation) => {
    try {
      setActionId(`view-${consultation.id}`)
      setHistoryLoading(true)
      const token = localStorage.getItem("token")
      const [data, eventData] = await Promise.all([
        getDoctorConsultation(consultation.id, token),
        getDoctorConsultationHistory(consultation.id, token),
      ])
      setSelectedConsultation(data)
      setHistory(eventData || [])
      setModal("details")
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to load consultation details")
      )
    } finally {
      setActionId(null)
      setHistoryLoading(false)
    }
  }

  const openCompleteModal = (consultation) => {
    setSelectedConsultation(consultation)
    setCompletionForm(initialCompletionForm)
    setModal("complete")
  }

  const handleCompletionChange = (event) => {
    setCompletionForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const openLifecycleModal = (consultation, mode) => {
    setModal(null)
    setSelectedConsultation(consultation)
    setLifecycleMode(mode)
  }

  const closeLifecycleModal = () => {
    if (actionId !== null) return
    setLifecycleMode(null)
    setSelectedConsultation(null)
  }

  const submitLifecycle = async (payload) => {
    if (!selectedConsultation || !lifecycleMode) return
    try {
      setActionId(`lifecycle-${selectedConsultation.id}`)
      const token = localStorage.getItem("token")
      if (lifecycleMode === "cancel") {
        await cancelDoctorConsultation(
          selectedConsultation.id,
          payload,
          token
        )
        toast.success("Consultation cancelled with history retained")
      } else if (lifecycleMode === "reschedule") {
        await rescheduleDoctorConsultation(
          selectedConsultation.id,
          payload,
          token
        )
        toast.success("Replacement consultation scheduled")
      } else {
        await scheduleDoctorConsultationFollowUp(
          selectedConsultation.id,
          payload,
          token
        )
        toast.success("Follow-up consultation scheduled")
      }
      const data = await getMyDoctorConsultations(token)
      setConsultations(data || [])
      setLifecycleMode(null)
      setSelectedConsultation(null)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update consultation"))
    } finally {
      setActionId(null)
    }
  }

  const submitCompletion = async (event) => {
    event.preventDefault()
    if (!selectedConsultation) return

    try {
      setActionId(`complete-${selectedConsultation.id}`)
      const token = localStorage.getItem("token")
      const updatedConsultation = await completeDoctorConsultation(
        selectedConsultation.id,
        {
          call_outcome: completionForm.call_outcome.trim(),
          preliminary_diagnosis:
            completionForm.preliminary_diagnosis.trim() || null,
          proposed_treatment:
            completionForm.proposed_treatment.trim() || null,
          estimated_amount:
            completionForm.estimated_amount === ""
              ? null
              : Number(completionForm.estimated_amount),
          patient_decision: completionForm.patient_decision,
          follow_up_date:
            completionForm.patient_decision === "follow_up"
              ? completionForm.follow_up_date
              : null,
          follow_up_time:
            completionForm.patient_decision === "follow_up"
              ? completionForm.follow_up_time
              : null,
          follow_up_reason:
            completionForm.patient_decision === "follow_up"
              ? completionForm.follow_up_reason.trim()
              : null,
          lifecycle_version: selectedConsultation.lifecycle_version,
        },
        token
      )

      setConsultations((current) =>
        current.map((consultation) =>
          consultation.id === updatedConsultation.id
            ? updatedConsultation
            : consultation
        )
      )
      setModal(null)
      setSelectedConsultation(null)
      toast.success("Consultation completed")
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to complete consultation")
      )
    } finally {
      setActionId(null)
    }
  }

  const renderActions = (consultation, mobile = false) => {
    const isViewing = actionId === `view-${consultation.id}`
    const actions = new Set(
      consultation.available_actions ||
        (consultation.status === "scheduled" ? ["complete"] : [])
    )

    return (
      <div
        className={`flex gap-2 ${
          mobile ? "grid grid-cols-2" : "justify-end"
        }`}
      >
        <button
          type="button"
          disabled={isViewing}
          onClick={() => openDetails(consultation)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <FaEye />
          {isViewing ? "Loading..." : "View"}
        </button>
        {actions.has("complete") && (
          <button
            type="button"
            onClick={() => openCompleteModal(consultation)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            <FaCheckCircle />
            Complete
          </button>
        )}
        {actions.has("reschedule") && (
          <button
            type="button"
            onClick={() => openLifecycleModal(consultation, "reschedule")}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Reschedule
          </button>
        )}
        {actions.has("cancel") && (
          <button
            type="button"
            onClick={() => openLifecycleModal(consultation, "cancel")}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Cancel
          </button>
        )}
        {actions.has("schedule_follow_up") && (
          <button
            type="button"
            onClick={() => openLifecycleModal(consultation, "follow_up")}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"
          >
            Schedule follow-up
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
            My Consultations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review assigned patient calls and record consultation outcomes.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative">
              <span className="sr-only">Search patient</span>
              <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient name or phone"
                className={`${inputClass} pl-10`}
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
              aria-label="Filter by consultation status"
            >
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 md:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
              Loading consultations...
            </div>
          ) : filteredConsultations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No consultations match the selected filters.
            </div>
          ) : (
            filteredConsultations.map((consultation) => (
              <article
                key={consultation.id}
                className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {consultation.patient_name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <FaPhoneAlt />
                      {consultation.patient_phone}
                    </p>
                  </div>
                  <StatusBadge value={consultation.status} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Scheduled</dt>
                    <dd className="mt-0.5 font-medium text-slate-700">
                      {formatDate(consultation.scheduled_date)}
                    </dd>
                    <dd className="text-xs text-slate-500">
                      {consultation.scheduled_time?.slice(0, 5)}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-xs text-slate-400">
                      Patient decision
                    </dt>
                    <dd>
                      <StatusBadge
                        value={consultation.patient_decision}
                      />
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-400">Purpose</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {consultation.purpose}
                    </dd>
                  </div>
                </dl>
                {renderActions(consultation, true)}
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3.5">Patient</th>
                  <th className="px-4 py-3.5">Schedule</th>
                  <th className="px-4 py-3.5">Purpose</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Decision</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Loading consultations...
                    </td>
                  </tr>
                ) : filteredConsultations.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No consultations match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredConsultations.map((consultation) => (
                    <tr
                      key={consultation.id}
                      className="align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {consultation.patient_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {consultation.patient_phone}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{formatDate(consultation.scheduled_date)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {consultation.scheduled_time?.slice(0, 5)}
                        </p>
                      </td>
                      <td className="max-w-[260px] px-4 py-4 text-sm text-slate-700">
                        <p className="line-clamp-2">
                          {consultation.purpose}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge value={consultation.status} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge
                          value={consultation.patient_decision}
                        />
                      </td>
                      <td className="px-4 py-4">
                        {renderActions(consultation)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal === "details" && selectedConsultation && (
        <Modal
          title="Consultation details"
          description={`Consultation #${selectedConsultation.id}`}
          onClose={closeModal}
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={selectedConsultation.status} />
              <StatusBadge
                value={selectedConsultation.patient_decision}
              />
            </div>

            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DetailItem
                label="Patient"
                value={selectedConsultation.patient_name}
              />
              <DetailItem
                label="Phone"
                value={selectedConsultation.patient_phone}
              />
              <DetailItem
                label="Address"
                value={selectedConsultation.patient_address}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Scheduled"
                value={`${formatDate(
                  selectedConsultation.scheduled_date
                )} · ${selectedConsultation.scheduled_time?.slice(0, 5)}`}
              />
              <DetailItem
                label="Completed"
                value={formatDateTime(selectedConsultation.completed_at)}
              />
              <DetailItem
                label="Purpose"
                value={selectedConsultation.purpose}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Notes"
                value={selectedConsultation.notes}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Call outcome"
                value={selectedConsultation.call_outcome}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Preliminary diagnosis"
                value={selectedConsultation.preliminary_diagnosis}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Proposed treatment"
                value={selectedConsultation.proposed_treatment}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Estimated amount"
                value={
                  selectedConsultation.estimated_amount == null
                    ? "—"
                    : `₹${Number(
                        selectedConsultation.estimated_amount
                      ).toLocaleString("en-IN")}`
                }
              />
              {selectedConsultation.follow_up_date && (
                <DetailItem
                  label="Follow-up due"
                  value={`${formatDate(
                    selectedConsultation.follow_up_date
                  )} · ${selectedConsultation.follow_up_time?.slice(0, 5)}`}
                />
              )}
              {selectedConsultation.follow_up_reason && (
                <DetailItem
                  label="Follow-up reason"
                  value={selectedConsultation.follow_up_reason}
                />
              )}
              {selectedConsultation.cancellation_reason && (
                <DetailItem
                  label="Cancellation"
                  value={`${selectedConsultation.cancellation_code?.replaceAll(
                    "_",
                    " "
                  )}: ${selectedConsultation.cancellation_reason}`}
                  className="sm:col-span-2"
                />
              )}
            </dl>

            <section className="border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-sm font-bold text-slate-900">
                Lifecycle history
              </h3>
              <ConsultationTimeline
                events={history}
                loading={historyLoading}
              />
            </section>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
              {selectedConsultation.status === "scheduled" && (
                <button
                  type="button"
                  onClick={() =>
                    openCompleteModal(selectedConsultation)
                  }
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  Complete consultation
                </button>
              )}
              {selectedConsultation.available_actions?.includes(
                "schedule_follow_up"
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    openLifecycleModal(selectedConsultation, "follow_up")
                  }
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
                >
                  Schedule follow-up
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {modal === "complete" && selectedConsultation && (
        <Modal
          title="Complete consultation"
          description={`Record the call outcome for ${selectedConsultation.patient_name}.`}
          onClose={closeModal}
        >
          <form onSubmit={submitCompletion} className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              <div className="flex items-center gap-2 font-semibold">
                <FaCalendarAlt />
                {formatDate(selectedConsultation.scheduled_date)} at{" "}
                {selectedConsultation.scheduled_time?.slice(0, 5)}
              </div>
              <p className="mt-1 text-xs text-blue-700">
                {selectedConsultation.purpose}
              </p>
            </div>

            <div>
              <label className={labelClass}>Call outcome</label>
              <textarea
                required
                minLength="1"
                rows="3"
                name="call_outcome"
                value={completionForm.call_outcome}
                onChange={handleCompletionChange}
                className={`${inputClass} resize-none`}
                placeholder="Describe the outcome of the patient call"
              />
            </div>

            <div>
              <label className={labelClass}>
                Preliminary diagnosis (optional)
              </label>
              <textarea
                rows="3"
                name="preliminary_diagnosis"
                value={completionForm.preliminary_diagnosis}
                onChange={handleCompletionChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className={labelClass}>
                Proposed treatment (optional)
              </label>
              <textarea
                rows="3"
                name="proposed_treatment"
                value={completionForm.proposed_treatment}
                onChange={handleCompletionChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Estimated amount (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="estimated_amount"
                  value={completionForm.estimated_amount}
                  onChange={handleCompletionChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Patient decision</label>
                <select
                  required
                  name="patient_decision"
                  value={completionForm.patient_decision}
                  onChange={handleCompletionChange}
                  className={inputClass}
                >
                  <option value="pending">Pending confirmation</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                  <option value="follow_up">Follow up</option>
                </select>
              </div>
            </div>

            {completionForm.patient_decision === "follow_up" && (
              <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-sm font-semibold text-violet-900">
                  Set a clear follow-up task
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Follow-up date</label>
                    <input
                      required
                      type="date"
                      name="follow_up_date"
                      value={completionForm.follow_up_date}
                      onChange={handleCompletionChange}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Follow-up time</label>
                    <input
                      required
                      type="time"
                      name="follow_up_time"
                      value={completionForm.follow_up_time}
                      onChange={handleCompletionChange}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Follow-up reason</label>
                  <textarea
                    required
                    minLength="3"
                    rows="2"
                    name="follow_up_reason"
                    value={completionForm.follow_up_reason}
                    onChange={handleCompletionChange}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>
            )}

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
                  actionId ===
                    `complete-${selectedConsultation.id}` ||
                  !completionForm.call_outcome.trim()
                }
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionId ===
                `complete-${selectedConsultation.id}`
                  ? "Saving..."
                  : "Complete consultation"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {lifecycleMode && selectedConsultation && (
        <ConsultationLifecycleDialog
          consultation={selectedConsultation}
          mode={lifecycleMode}
          busy={
            actionId === `lifecycle-${selectedConsultation.id}`
          }
          onClose={closeLifecycleModal}
          onSubmit={submitLifecycle}
        />
      )}
    </DoctorLayout>
  )
}


export default DoctorConsultationsPage
