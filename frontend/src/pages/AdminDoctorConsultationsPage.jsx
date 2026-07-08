import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"
import {
  confirmDoctorConsultation,
  createDoctorConsultation,
  createVisitFromConsultation,
  getConsultationDoctors,
  getDoctorConsultations,
  rejectDoctorConsultation,
} from "../services/doctorConsultationService"


const getLocalDate = () => {
  const now = new Date()
  const localTime = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )
  return localTime.toISOString().slice(0, 10)
}


const initialConsultationForm = {
  patient_name: "",
  patient_phone: "",
  patient_address: "",
  doctor_id: "",
  scheduled_date: "",
  scheduled_time: "",
  purpose: "",
  notes: "",
}


const initialFilters = {
  doctor_id: "",
  status: "",
  patient_decision: "",
  from_date: "",
  to_date: "",
}

const actionablePatientDecisions = new Set(["pending", "follow_up"])

const getConsultationVisitId = (consultation) =>
  consultation.visit_id ?? consultation.doctor_visit_id ?? null

const isConsultationConverted = (consultation, convertedIds) =>
  Boolean(consultation.has_visit) ||
  Boolean(getConsultationVisitId(consultation)) ||
  convertedIds.has(consultation.id)


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"


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


function StatusBadge({ value, type = "status" }) {
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
  const label = normalized.replaceAll("_", " ")

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${
        colorMap[normalized] || colorMap.pending
      }`}
      title={type}
    >
      {label}
    </span>
  )
}


function AdminDoctorConsultationsPage() {
  const [consultations, setConsultations] = useState([])
  const [doctors, setDoctors] = useState([])
  const [filters, setFilters] = useState(initialFilters)
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedConsultation, setSelectedConsultation] = useState(null)
  const [consultationForm, setConsultationForm] = useState(
    initialConsultationForm
  )
  const [rejectionReason, setRejectionReason] = useState("")
  const [visitForm, setVisitForm] = useState({
    visit_date: "",
    visit_time: "",
    remarks: "",
  })
  const [convertedIds, setConvertedIds] = useState(() => new Set())

  const doctorNames = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.id, doctor.name])),
    [doctors]
  )

  const getErrorMessage = (error, fallback) => {
    const detail = error.response?.data?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail.map((item) => item.msg).join(", ")
    }
    return fallback
  }

  const loadConsultations = async (activeFilters = filters) => {
    const token = localStorage.getItem("token")
    const data = await getDoctorConsultations(token, activeFilters)
    setConsultations(data || [])
  }

  useEffect(() => {
    const loadPage = async () => {
      try {
        const token = localStorage.getItem("token")
        const [consultationData, doctorData] = await Promise.all([
          getDoctorConsultations(token),
          getConsultationDoctors(token),
        ])
        setConsultations(consultationData || [])
        setDoctors(doctorData || [])
      } catch (error) {
        toast.error(
          getErrorMessage(error, "Failed to load doctor consultations")
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadPage()
  }, [])

  const handleFilterChange = (event) => {
    setFilters((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const applyFilters = async (event) => {
    event.preventDefault()
    try {
      setIsLoading(true)
      await loadConsultations(filters)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to apply filters"))
    } finally {
      setIsLoading(false)
    }
  }

  const clearFilters = async () => {
    setFilters(initialFilters)
    try {
      setIsLoading(true)
      await loadConsultations(initialFilters)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to clear filters"))
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setConsultationForm(initialConsultationForm)
    setModal("create")
  }

  const openRejectModal = (consultation) => {
    setSelectedConsultation(consultation)
    setRejectionReason("")
    setModal("reject")
  }

  const openVisitModal = (consultation) => {
    if (isConsultationConverted(consultation, convertedIds)) {
      toast("Visit already created")
      return
    }
    setSelectedConsultation(consultation)
    setVisitForm({
      visit_date: "",
      visit_time: "",
      remarks: "",
    })
    setModal("visit")
  }

  const closeModal = () => {
    if (actionId !== null) return
    setModal(null)
    setSelectedConsultation(null)
  }

  const handleConsultationChange = (event) => {
    setConsultationForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const submitConsultation = async (event) => {
    event.preventDefault()
    try {
      setActionId("create")
      const token = localStorage.getItem("token")
      await createDoctorConsultation(
        {
          ...consultationForm,
          doctor_id: Number(consultationForm.doctor_id),
          notes: consultationForm.notes || null,
        },
        token
      )
      toast.success("Consultation scheduled")
      setModal(null)
      setConsultationForm(initialConsultationForm)
      await loadConsultations()
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to schedule consultation")
      )
    } finally {
      setActionId(null)
    }
  }

  const confirmConsultation = async (consultation) => {
    const shouldConfirm = window.confirm(
      `Confirm the patient decision for ${consultation.patient_name}?`
    )
    if (!shouldConfirm) return

    try {
      setActionId(consultation.id)
      const token = localStorage.getItem("token")
      await confirmDoctorConsultation(consultation.id, token)
      toast.success("Consultation confirmed")
      await loadConsultations()
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to confirm consultation")
      )
    } finally {
      setActionId(null)
    }
  }

  const submitRejection = async (event) => {
    event.preventDefault()
    try {
      setActionId(selectedConsultation.id)
      const token = localStorage.getItem("token")
      await rejectDoctorConsultation(
        selectedConsultation.id,
        rejectionReason,
        token
      )
      toast.success("Consultation rejected")
      setModal(null)
      setSelectedConsultation(null)
      await loadConsultations()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to reject consultation"))
    } finally {
      setActionId(null)
    }
  }

  const submitVisit = async (event) => {
    event.preventDefault()
    try {
      setActionId(selectedConsultation.id)
      const token = localStorage.getItem("token")
      const visit = await createVisitFromConsultation(
        selectedConsultation.id,
        {
          ...visitForm,
          remarks: visitForm.remarks || null,
        },
        token
      )
      setConvertedIds((current) => {
        const next = new Set(current)
        next.add(selectedConsultation.id)
        return next
      })
      toast.success(`Doctor visit #${visit.id} created`)
      setModal(null)
      setSelectedConsultation(null)
      await loadConsultations()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create doctor visit"))
    } finally {
      setActionId(null)
    }
  }

  const formatDate = (value) => {
    if (!value) return "—"
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`))
  }

  const renderActions = (consultation, mobile = false) => {
    const isBusy = actionId === consultation.id
    const converted = isConsultationConverted(consultation, convertedIds)
    const isActionableDecision = actionablePatientDecisions.has(
      consultation.patient_decision
    )
    const canUpdateDecision =
      consultation.status === "completed" &&
      !converted &&
      isActionableDecision

    return (
      <div
        className={`flex flex-wrap gap-2 ${
          mobile ? "grid grid-cols-2" : "justify-end"
        }`}
      >
        {canUpdateDecision && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => confirmConsultation(consultation)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            Confirm
          </button>
        )}
        {canUpdateDecision && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => openRejectModal(consultation)}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            Reject
          </button>
        )}
        {consultation.patient_decision === "confirmed" && (
          <button
            type="button"
            disabled={isBusy || converted}
            onClick={() => openVisitModal(consultation)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {converted ? "Visit already created" : "Create Visit"}
          </button>
        )}
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Doctor Consultations
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Schedule calls, review patient decisions, and create confirmed visits.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            + New Consultation
          </button>
        </div>

        <form
          onSubmit={applyFilters}
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <select
              name="doctor_id"
              value={filters.doctor_id}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="Filter by doctor"
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              name="patient_decision"
              value={filters.patient_decision}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="Filter by patient decision"
            >
              <option value="">All decisions</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
              <option value="follow_up">Follow up</option>
            </select>
            <input
              type="date"
              name="from_date"
              value={filters.from_date}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="From date"
            />
            <input
              type="date"
              name="to_date"
              value={filters.to_date}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="To date"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Clear
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Apply Filters
            </button>
          </div>
        </form>

        <div className="space-y-4 md:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
              Loading consultations...
            </div>
          ) : consultations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No consultations match the selected filters.
            </div>
          ) : (
            consultations.map((consultation) => (
              <article
                key={consultation.id}
                className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {consultation.patient_name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {consultation.patient_phone}
                    </p>
                  </div>
                  <StatusBadge value={consultation.status} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Doctor</dt>
                    <dd className="mt-0.5 font-medium text-slate-700">
                      {doctorNames.get(consultation.doctor_id) ||
                        `Doctor #${consultation.doctor_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Scheduled</dt>
                    <dd className="mt-0.5 font-medium text-slate-700">
                      {formatDate(consultation.scheduled_date)} ·{" "}
                      {consultation.scheduled_time?.slice(0, 5)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-400">Purpose</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {consultation.purpose}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="mb-1 text-xs text-slate-400">
                      Patient decision
                    </dt>
                    <dd>
                      <StatusBadge
                        value={consultation.patient_decision}
                        type="decision"
                      />
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
            <table className="w-full min-w-[1000px]">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3.5">Patient</th>
                  <th className="px-4 py-3.5">Doctor</th>
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
                      colSpan="7"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Loading consultations...
                    </td>
                  </tr>
                ) : consultations.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No consultations match the selected filters.
                    </td>
                  </tr>
                ) : (
                  consultations.map((consultation) => (
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
                        {doctorNames.get(consultation.doctor_id) ||
                          `Doctor #${consultation.doctor_id}`}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{formatDate(consultation.scheduled_date)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {consultation.scheduled_time?.slice(0, 5)}
                        </p>
                      </td>
                      <td className="max-w-[240px] px-4 py-4 text-sm text-slate-700">
                        <p className="line-clamp-2">{consultation.purpose}</p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge value={consultation.status} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge
                          value={consultation.patient_decision}
                          type="decision"
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

      {modal === "create" && (
        <Modal
          title="Schedule consultation"
          description="Create a call request and assign it to a doctor."
          onClose={closeModal}
        >
          <form onSubmit={submitConsultation} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Patient name</label>
                <input
                  required
                  name="patient_name"
                  value={consultationForm.patient_name}
                  onChange={handleConsultationChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Patient phone</label>
                <input
                  required
                  type="tel"
                  name="patient_phone"
                  value={consultationForm.patient_phone}
                  onChange={handleConsultationChange}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Patient address</label>
              <textarea
                required
                rows="2"
                name="patient_address"
                value={consultationForm.patient_address}
                onChange={handleConsultationChange}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Assigned doctor</label>
              <select
                required
                name="doctor_id"
                value={consultationForm.doctor_id}
                onChange={handleConsultationChange}
                className={inputClass}
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Scheduled date</label>
                <input
                  required
                  type="date"
                  min={getLocalDate()}
                  name="scheduled_date"
                  value={consultationForm.scheduled_date}
                  onChange={handleConsultationChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Scheduled time</label>
                <input
                  required
                  type="time"
                  name="scheduled_time"
                  value={consultationForm.scheduled_time}
                  onChange={handleConsultationChange}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Purpose</label>
              <textarea
                required
                rows="3"
                name="purpose"
                value={consultationForm.purpose}
                onChange={handleConsultationChange}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                rows="2"
                name="notes"
                value={consultationForm.notes}
                onChange={handleConsultationChange}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionId === "create"}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionId === "create" ? "Scheduling..." : "Schedule"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "reject" && selectedConsultation && (
        <Modal
          title="Reject consultation"
          description={`Record why ${selectedConsultation.patient_name}'s consultation is being rejected.`}
          onClose={closeModal}
        >
          <form onSubmit={submitRejection} className="space-y-4">
            <div>
              <label className={labelClass}>Rejection reason</label>
              <textarea
                required
                minLength="1"
                rows="4"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                className={`${inputClass} resize-none`}
                placeholder="Enter a clear reason"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  actionId === selectedConsultation.id ||
                  !rejectionReason.trim()
                }
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actionId === selectedConsultation.id
                  ? "Rejecting..."
                  : "Reject consultation"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "visit" && selectedConsultation && (
        <Modal
          title="Create doctor visit"
          description={`Convert the confirmed consultation for ${selectedConsultation.patient_name}.`}
          onClose={closeModal}
        >
          <form onSubmit={submitVisit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Visit date</label>
                <input
                  required
                  type="date"
                  min={getLocalDate()}
                  value={visitForm.visit_date}
                  onChange={(event) =>
                    setVisitForm((current) => ({
                      ...current,
                      visit_date: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Visit time</label>
                <input
                  required
                  type="time"
                  value={visitForm.visit_time}
                  onChange={(event) =>
                    setVisitForm((current) => ({
                      ...current,
                      visit_time: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Remarks (optional)</label>
              <textarea
                rows="3"
                value={visitForm.remarks}
                onChange={(event) =>
                  setVisitForm((current) => ({
                    ...current,
                    remarks: event.target.value,
                  }))
                }
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              Patient and doctor details will be copied from the consultation.
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionId === selectedConsultation.id}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionId === selectedConsultation.id
                  ? "Creating..."
                  : "Create visit"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  )
}


export default AdminDoctorConsultationsPage
