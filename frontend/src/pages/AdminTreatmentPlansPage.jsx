import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"
import {
  approveTreatmentPlan,
  createScheduleFromTreatmentPlan,
  getApprovedTreatmentPlans,
  getPendingTreatmentPlans,
  getTherapistsForTreatmentPlan,
  rejectTreatmentPlan,
} from "../services/treatmentPlanService"


const getLocalDate = () => {
  const now = new Date()
  const localTime = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )
  return localTime.toISOString().slice(0, 10)
}


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"

const getScheduleCount = (plan) => Number(plan.schedule_count || 0)

const isScheduleGenerated = (plan, generatedPlanIds) =>
  Boolean(plan.has_schedule) ||
  getScheduleCount(plan) > 0 ||
  generatedPlanIds.has(plan.id)

const getScheduleGeneratedLabel = (plan) => {
  const count = getScheduleCount(plan)
  if (count > 0) {
    return `${count} ${count === 1 ? "schedule" : "schedules"} generated`
  }
  return "Schedule already generated"
}


function Modal({ title, description, onClose, size = "max-w-2xl", children }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[92vh] w-full ${size} overflow-y-auto rounded-2xl bg-white shadow-2xl`}
      >
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


function StatusBadge({ status }) {
  const approved = status === "approved"
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${
        approved
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {status === "submitted" ? "Pending review" : status}
    </span>
  )
}


function DetailItem({ label, value, full = false }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
        {value || "—"}
      </dd>
    </div>
  )
}


function AdminTreatmentPlansPage() {
  const [pendingPlans, setPendingPlans] = useState([])
  const [approvedPlans, setApprovedPlans] = useState([])
  const [therapists, setTherapists] = useState([])
  const [activeTab, setActiveTab] = useState("pending")
  const [isLoading, setIsLoading] = useState(true)
  const [actionKey, setActionKey] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [generatedPlanIds, setGeneratedPlanIds] = useState(
    () => new Set()
  )
  const [scheduleForm, setScheduleForm] = useState({
    therapist_id: "",
    date_mode: "treatment_date",
    session_date: "",
    number_of_sessions: "1",
    in_time: "",
    out_time: "",
    priority: "normal",
    instructions: "",
    transport_mode: "vehicle",
  })

  const visiblePlans = useMemo(
    () => (activeTab === "pending" ? pendingPlans : approvedPlans),
    [activeTab, approvedPlans, pendingPlans]
  )

  const getErrorMessage = (error, fallback) => {
    const detail = error.response?.data?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail.map((item) => item.msg).join(", ")
    }
    return fallback
  }

  const loadPlans = async () => {
    const token = localStorage.getItem("token")
    const [pending, approved] = await Promise.all([
      getPendingTreatmentPlans(token),
      getApprovedTreatmentPlans(token),
    ])
    setPendingPlans(pending || [])
    setApprovedPlans(approved || [])
  }

  useEffect(() => {
    const loadPage = async () => {
      try {
        const token = localStorage.getItem("token")
        const [pending, approved, therapistData] = await Promise.all([
          getPendingTreatmentPlans(token),
          getApprovedTreatmentPlans(token),
          getTherapistsForTreatmentPlan(token),
        ])
        setPendingPlans(pending || [])
        setApprovedPlans(approved || [])
        setTherapists(therapistData || [])
      } catch (error) {
        toast.error(
          getErrorMessage(error, "Failed to load treatment plans")
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadPage()
  }, [])

  const openReview = (plan) => {
    setSelectedPlan(plan)
    setModal("review")
  }

  const openReject = (plan) => {
    setSelectedPlan(plan)
    setRejectionReason("")
    setModal("reject")
  }

  const openSchedule = (plan) => {
    if (isScheduleGenerated(plan, generatedPlanIds)) {
      toast("Schedule already generated")
      return
    }
    setSelectedPlan(plan)
    setScheduleForm({
      therapist_id: "",
      date_mode: "treatment_date",
      session_date: "",
      number_of_sessions: String(plan.sessions_required || 1),
      in_time: "",
      out_time: "",
      priority: "normal",
      instructions: plan.special_instructions || "",
      transport_mode: "vehicle",
    })
    setModal("schedule")
  }

  const closeModal = () => {
    if (actionKey !== null) return
    setModal(null)
    setSelectedPlan(null)
  }

  const approvePlan = async (plan) => {
    const shouldApprove = window.confirm(
      `Approve the treatment plan for ${plan.patient_name}?`
    )
    if (!shouldApprove) return

    try {
      setActionKey(`approve-${plan.id}`)
      const token = localStorage.getItem("token")
      await approveTreatmentPlan(plan.id, token)
      toast.success("Treatment plan approved")
      await loadPlans()
      setActiveTab("approved")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to approve plan"))
    } finally {
      setActionKey(null)
    }
  }

  const submitRejection = async (event) => {
    event.preventDefault()
    try {
      setActionKey(`reject-${selectedPlan.id}`)
      const token = localStorage.getItem("token")
      await rejectTreatmentPlan(
        selectedPlan.id,
        rejectionReason.trim(),
        token
      )
      toast.success("Treatment plan rejected")
      setModal(null)
      setSelectedPlan(null)
      await loadPlans()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to reject plan"))
    } finally {
      setActionKey(null)
    }
  }

  const handleScheduleChange = (event) => {
    setScheduleForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const submitSchedule = async (event) => {
    event.preventDefault()
    if (
      selectedPlan &&
      isScheduleGenerated(selectedPlan, generatedPlanIds)
    ) {
      toast("Schedule already generated")
      setModal(null)
      setSelectedPlan(null)
      return
    }
    if (
      scheduleForm.out_time &&
      scheduleForm.in_time &&
      scheduleForm.out_time <= scheduleForm.in_time
    ) {
      toast.error("Out time must be later than in time")
      return
    }

    try {
      setActionKey(`schedule-${selectedPlan.id}`)
      const token = localStorage.getItem("token")
      const usesTreatmentDate =
        scheduleForm.date_mode === "treatment_date"
      const schedules = await createScheduleFromTreatmentPlan(
        selectedPlan.id,
        {
          therapist_id: Number(scheduleForm.therapist_id),
          treatment_date: usesTreatmentDate
            ? scheduleForm.session_date
            : null,
          start_date: usesTreatmentDate
            ? null
            : scheduleForm.session_date,
          number_of_sessions: Number(
            scheduleForm.number_of_sessions
          ),
          in_time: scheduleForm.in_time,
          out_time: scheduleForm.out_time,
          priority: scheduleForm.priority,
          instructions: scheduleForm.instructions,
          transport_mode: scheduleForm.transport_mode,
        },
        token
      )
      setGeneratedPlanIds((current) => {
        const next = new Set(current)
        next.add(selectedPlan.id)
        return next
      })
      toast.success(
        `${schedules.length} treatment ${
          schedules.length === 1 ? "session" : "sessions"
        } scheduled`
      )
      setModal(null)
      setSelectedPlan(null)
      await loadPlans()
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to generate treatment schedule")
      )
    } finally {
      setActionKey(null)
    }
  }

  const formatDate = (value) => {
    if (!value) return "—"
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value))
  }

  const renderActions = (plan, mobile = false) => {
    const generated = isScheduleGenerated(plan, generatedPlanIds)
    return (
      <div
        className={`flex flex-wrap gap-2 ${
          mobile ? "grid grid-cols-2" : "justify-end"
        }`}
      >
        <button
          type="button"
          onClick={() => openReview(plan)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Review
        </button>
        {activeTab === "pending" ? (
          <>
            <button
              type="button"
              disabled={actionKey === `approve-${plan.id}`}
              onClick={() => approvePlan(plan)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={actionKey === `reject-${plan.id}`}
              onClick={() => openReject(plan)}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={actionKey === `schedule-${plan.id}` || generated}
            onClick={() => openSchedule(plan)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {generated
              ? getScheduleGeneratedLabel(plan)
              : "Generate Schedule"}
          </button>
        )}
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Treatment Plans
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review doctor submissions and assign approved treatment sessions.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === "pending"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Pending
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs">
              {pendingPlans.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("approved")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === "approved"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Approved
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs">
              {approvedPlans.length}
            </span>
          </button>
        </div>

        <div className="space-y-4 md:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
              Loading treatment plans...
            </div>
          ) : visiblePlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No {activeTab} treatment plans found.
            </div>
          ) : (
            visiblePlans.map((plan) => (
              <article
                key={plan.id}
                className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {plan.patient_name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {plan.doctor_name || `Doctor #${plan.doctor_id}`}
                    </p>
                  </div>
                  <StatusBadge status={plan.status} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="Diagnosis" value={plan.diagnosis} />
                  <DetailItem
                    label="Sessions"
                    value={plan.sessions_required}
                  />
                  <DetailItem label="Frequency" value={plan.frequency} />
                  <DetailItem label="Duration" value={plan.duration} />
                  <DetailItem
                    label="Treatment"
                    value={plan.treatment_plan}
                    full
                  />
                </dl>
                {renderActions(plan, true)}
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
                  <th className="px-4 py-3.5">Diagnosis</th>
                  <th className="px-4 py-3.5">Treatment</th>
                  <th className="px-4 py-3.5">Sessions</th>
                  <th className="px-4 py-3.5">Status</th>
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
                      Loading treatment plans...
                    </td>
                  </tr>
                ) : visiblePlans.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No {activeTab} treatment plans found.
                    </td>
                  </tr>
                ) : (
                  visiblePlans.map((plan) => (
                    <tr
                      key={plan.id}
                      className="align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {plan.patient_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Visit #{plan.doctor_visit_id}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {plan.doctor_name || `Doctor #${plan.doctor_id}`}
                      </td>
                      <td className="max-w-[190px] px-4 py-4 text-sm text-slate-700">
                        <p className="line-clamp-2">
                          {plan.diagnosis || "—"}
                        </p>
                      </td>
                      <td className="max-w-[220px] px-4 py-4 text-sm text-slate-700">
                        <p className="line-clamp-2">
                          {plan.treatment_plan || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{plan.sessions_required || "—"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {plan.frequency || "Not specified"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={plan.status} />
                      </td>
                      <td className="px-4 py-4">
                        {renderActions(plan)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal === "review" && selectedPlan && (
        <Modal
          title={`Treatment plan #${selectedPlan.id}`}
          description={`Review the submitted plan for ${selectedPlan.patient_name}.`}
          onClose={closeModal}
          size="max-w-3xl"
        >
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DetailItem
              label="Doctor"
              value={
                selectedPlan.doctor_name ||
                `Doctor #${selectedPlan.doctor_id}`
              }
            />
            <DetailItem
              label="Patient"
              value={selectedPlan.patient_name}
            />
            <DetailItem
              label="Chief complaint"
              value={selectedPlan.chief_complaint}
              full
            />
            <DetailItem
              label="Diagnosis"
              value={selectedPlan.diagnosis}
              full
            />
            <DetailItem
              label="Proposed treatment"
              value={selectedPlan.treatment_plan}
              full
            />
            <DetailItem
              label="Medicines"
              value={selectedPlan.medicines}
              full
            />
            <DetailItem
              label="Required sessions"
              value={selectedPlan.sessions_required}
            />
            <DetailItem
              label="Frequency"
              value={selectedPlan.frequency}
            />
            <DetailItem
              label="Duration"
              value={selectedPlan.duration}
            />
            <DetailItem
              label="Created"
              value={formatDate(selectedPlan.created_at)}
            />
            <DetailItem
              label="Special instructions"
              value={selectedPlan.special_instructions}
              full
            />
            <DetailItem
              label="Remarks"
              value={selectedPlan.remarks}
              full
            />
          </dl>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {modal === "reject" && selectedPlan && (
        <Modal
          title="Reject treatment plan"
          description={`Return ${selectedPlan.patient_name}'s plan to the doctor.`}
          onClose={closeModal}
        >
          <form onSubmit={submitRejection} className="space-y-4">
            <div>
              <label className={labelClass}>Rejection reason</label>
              <textarea
                required
                rows="4"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                className={`${inputClass} resize-none`}
                placeholder="Explain what must be corrected"
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
                  actionKey === `reject-${selectedPlan.id}` ||
                  !rejectionReason.trim()
                }
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actionKey === `reject-${selectedPlan.id}`
                  ? "Rejecting..."
                  : "Reject plan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "schedule" && selectedPlan && (
        <Modal
          title="Generate therapist schedule"
          description={`Create sessions from ${selectedPlan.patient_name}'s approved plan.`}
          onClose={closeModal}
        >
          <form onSubmit={submitSchedule} className="space-y-4">
            <div>
              <label className={labelClass}>Therapist</label>
              <select
                required
                name="therapist_id"
                value={scheduleForm.therapist_id}
                onChange={handleScheduleChange}
                className={inputClass}
              >
                <option value="">Select therapist</option>
                {therapists.map((therapist) => (
                  <option key={therapist.id} value={therapist.id}>
                    {therapist.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Date input</label>
                <select
                  name="date_mode"
                  value={scheduleForm.date_mode}
                  onChange={handleScheduleChange}
                  className={inputClass}
                >
                  <option value="treatment_date">Treatment date</option>
                  <option value="start_date">Start date</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>First session date</label>
                <input
                  required
                  type="date"
                  min={getLocalDate()}
                  name="session_date"
                  value={scheduleForm.session_date}
                  onChange={handleScheduleChange}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Sessions</label>
                <input
                  required
                  type="number"
                  min="1"
                  name="number_of_sessions"
                  value={scheduleForm.number_of_sessions}
                  onChange={handleScheduleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>In time</label>
                <input
                  required
                  type="time"
                  name="in_time"
                  value={scheduleForm.in_time}
                  onChange={handleScheduleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Out time</label>
                <input
                  required
                  type="time"
                  name="out_time"
                  value={scheduleForm.out_time}
                  onChange={handleScheduleChange}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Priority</label>
                <select
                  name="priority"
                  value={scheduleForm.priority}
                  onChange={handleScheduleChange}
                  className={inputClass}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Transport mode</label>
                <select
                  name="transport_mode"
                  value={scheduleForm.transport_mode}
                  onChange={handleScheduleChange}
                  className={inputClass}
                >
                  <option value="vehicle">Vehicle</option>
                  <option value="auto">Auto</option>
                  <option value="bus">Bus</option>
                  <option value="metro">Metro</option>
                  <option value="cab">Cab</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Instructions</label>
              <textarea
                required
                rows="3"
                name="instructions"
                value={scheduleForm.instructions}
                onChange={handleScheduleChange}
                className={`${inputClass} resize-none`}
                placeholder="Enter treatment instructions"
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
                disabled={actionKey === `schedule-${selectedPlan.id}`}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionKey === `schedule-${selectedPlan.id}`
                  ? "Generating..."
                  : "Generate schedule"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  )
}


export default AdminTreatmentPlansPage
