import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaCheckCircle,
  FaClock,
  FaEye,
  FaFileMedical,
  FaPlus,
  FaSearch,
  FaTimesCircle,
} from "react-icons/fa"

import DoctorLayout from "../layouts/DoctorLayout"
import { getMyDoctorVisits } from "../services/doctorVisitService"
import {
  createTreatmentPlan,
  getMyTreatmentPlans,
  getTreatmentPlan,
} from "../services/treatmentPlanService"


const initialPlanForm = {
  doctor_visit_id: "",
  diagnosis: "",
  chief_complaint: "",
  treatment_plan: "",
  medicines: "",
  sessions_required: "",
  frequency: "",
  duration: "",
  special_instructions: "",
  remarks: "",
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


const nullableText = (value) => value.trim() || null


const formatDate = (value) => {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}


function Modal({ title, description, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-2xl"
        }`}
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


function StatusBadge({ value }) {
  const normalized = value || "pending"
  const colorMap = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    draft: "border-slate-200 bg-slate-100 text-slate-600",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
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
        {value ?? "—"}
      </dd>
    </div>
  )
}


function DoctorTreatmentPlansPage() {
  const [plans, setPlans] = useState([])
  const [visits, setVisits] = useState([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [planForm, setPlanForm] = useState(initialPlanForm)

  useEffect(() => {
    const token = localStorage.getItem("token")

    Promise.all([
      getMyTreatmentPlans(token),
      getMyDoctorVisits(token),
    ])
      .then(([planData, visitData]) => {
        setPlans(planData || [])
        setVisits(visitData || [])
      })
      .catch((error) => {
        toast.error(
          getErrorMessage(error, "Failed to load treatment plans")
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const eligibleVisits = useMemo(() => {
    const plannedVisitIds = new Set(
      plans.map((plan) => plan.doctor_visit_id)
    )

    return visits.filter(
      (visit) =>
        visit.status === "visited" && !plannedVisitIds.has(visit.id)
    )
  }, [plans, visits])

  const filteredPlans = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return plans
      .filter((plan) => {
        const matchesPatient =
          !normalizedSearch ||
          plan.patient_name?.toLowerCase().includes(normalizedSearch)
        const matchesStatus =
          !statusFilter || plan.status === statusFilter
        return matchesPatient && matchesStatus
      })
      .sort(
        (left, right) =>
          new Date(right.created_at) - new Date(left.created_at)
      )
  }, [plans, search, statusFilter])

  const statusCounts = useMemo(
    () => ({
      submitted: plans.filter((plan) => plan.status === "submitted")
        .length,
      approved: plans.filter((plan) => plan.status === "approved").length,
      rejected: plans.filter((plan) => plan.status === "rejected").length,
    }),
    [plans]
  )

  const selectedVisit = useMemo(
    () =>
      eligibleVisits.find(
        (visit) => visit.id === Number(planForm.doctor_visit_id)
      ),
    [eligibleVisits, planForm.doctor_visit_id]
  )

  const closeModal = () => {
    if (actionId !== null) return
    setModal(null)
    setSelectedPlan(null)
  }

  const openCreateModal = () => {
    setPlanForm(initialPlanForm)
    setModal("create")
  }

  const openDetails = async (plan) => {
    try {
      setActionId(`view-${plan.id}`)
      const token = localStorage.getItem("token")
      const data = await getTreatmentPlan(plan.id, token)
      setSelectedPlan(data)
      setModal("details")
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to load treatment plan details")
      )
    } finally {
      setActionId(null)
    }
  }

  const handlePlanChange = (event) => {
    const { name, value } = event.target
    setPlanForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "doctor_visit_id"
        ? {
            chief_complaint:
              eligibleVisits.find(
                (visit) => visit.id === Number(value)
              )?.chief_complaint || "",
          }
        : {}),
    }))
  }

  const submitPlan = async (event) => {
    event.preventDefault()
    if (!selectedVisit) return

    try {
      setActionId("create")
      const token = localStorage.getItem("token")
      const createdPlan = await createTreatmentPlan(
        {
          id: 0,
          doctor_visit_id: selectedVisit.id,
          doctor_id: selectedVisit.doctor_id,
          patient_name: selectedVisit.patient_name,
          diagnosis: nullableText(planForm.diagnosis),
          chief_complaint: nullableText(planForm.chief_complaint),
          treatment_plan: nullableText(planForm.treatment_plan),
          medicines: nullableText(planForm.medicines),
          sessions_required:
            planForm.sessions_required === ""
              ? null
              : Number(planForm.sessions_required),
          frequency: nullableText(planForm.frequency),
          duration: nullableText(planForm.duration),
          special_instructions: nullableText(
            planForm.special_instructions
          ),
          remarks: nullableText(planForm.remarks),
        },
        token
      )

      setPlans((current) => [createdPlan, ...current])
      setModal(null)
      setPlanForm(initialPlanForm)
      toast.success("Treatment plan submitted")
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to submit treatment plan")
      )
    } finally {
      setActionId(null)
    }
  }

  const renderActions = (plan, mobile = false) => {
    const isViewing = actionId === `view-${plan.id}`

    return (
      <div className={mobile ? "grid" : "flex justify-end"}>
        <button
          type="button"
          disabled={isViewing}
          onClick={() => openDetails(plan)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <FaEye />
          {isViewing ? "Loading..." : "View plan"}
        </button>
      </div>
    )
  }

  return (
    <DoctorLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Treatment Plans
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Create plans for completed visits and monitor approval status.
            </p>
          </div>
          <button
            type="button"
            disabled={eligibleVisits.length === 0}
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title={
              eligibleVisits.length === 0
                ? "No eligible visited appointments"
                : "Create treatment plan"
            }
          >
            <FaPlus />
            New Treatment Plan
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Awaiting review
              </span>
              <FaClock className="text-blue-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {statusCounts.submitted}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Approved
              </span>
              <FaCheckCircle className="text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {statusCounts.approved}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Rejected
              </span>
              <FaTimesCircle className="text-rose-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {statusCounts.rejected}
            </p>
          </div>
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
                placeholder="Search patient"
                className={`${inputClass} pl-10`}
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
              aria-label="Filter by approval status"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 md:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
              Loading treatment plans...
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No treatment plans found.
            </div>
          ) : (
            filteredPlans.map((plan) => (
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
                      Visit #{plan.doctor_visit_id}
                    </p>
                  </div>
                  <StatusBadge value={plan.status} />
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Diagnosis</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {plan.diagnosis || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Created</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {formatDate(plan.created_at)}
                    </dd>
                  </div>
                </dl>
                {renderActions(plan, true)}
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
                  <th className="px-4 py-3.5">Diagnosis</th>
                  <th className="px-4 py-3.5">Sessions</th>
                  <th className="px-4 py-3.5">Created</th>
                  <th className="px-4 py-3.5">Approval status</th>
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
                      Loading treatment plans...
                    </td>
                  </tr>
                ) : filteredPlans.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No treatment plans found.
                    </td>
                  </tr>
                ) : (
                  filteredPlans.map((plan) => (
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
                      <td className="max-w-[260px] px-4 py-4 text-sm text-slate-700">
                        <p className="line-clamp-2">
                          {plan.diagnosis || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {plan.sessions_required ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {formatDate(plan.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge value={plan.status} />
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

      {modal === "create" && (
        <Modal
          title="Create treatment plan"
          description="Review and edit every field before submitting. Submitted plans are read-only."
          onClose={closeModal}
          wide
        >
          <form onSubmit={submitPlan} className="space-y-5">
            <div>
              <label className={labelClass}>Completed doctor visit</label>
              <select
                required
                name="doctor_visit_id"
                value={planForm.doctor_visit_id}
                onChange={handlePlanChange}
                className={inputClass}
              >
                <option value="">Select patient visit</option>
                {eligibleVisits.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visit.patient_name} · {formatDate(visit.visit_date)}
                  </option>
                ))}
              </select>
            </div>

            {selectedVisit && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="font-semibold text-blue-900">
                  {selectedVisit.patient_name}
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  Visit #{selectedVisit.id} ·{" "}
                  {formatDate(selectedVisit.visit_date)} at{" "}
                  {selectedVisit.visit_time?.slice(0, 5)}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Diagnosis</label>
                <textarea
                  rows="3"
                  name="diagnosis"
                  value={planForm.diagnosis}
                  onChange={handlePlanChange}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div>
                <label className={labelClass}>Chief complaint</label>
                <textarea
                  rows="3"
                  name="chief_complaint"
                  value={planForm.chief_complaint}
                  onChange={handlePlanChange}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Treatment plan</label>
              <textarea
                rows="4"
                name="treatment_plan"
                value={planForm.treatment_plan}
                onChange={handlePlanChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className={labelClass}>Medicines</label>
              <textarea
                rows="3"
                name="medicines"
                value={planForm.medicines}
                onChange={handlePlanChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Sessions required</label>
                <input
                  type="number"
                  min="1"
                  name="sessions_required"
                  value={planForm.sessions_required}
                  onChange={handlePlanChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Frequency</label>
                <input
                  name="frequency"
                  value={planForm.frequency}
                  onChange={handlePlanChange}
                  className={inputClass}
                  placeholder="e.g. 3 times weekly"
                />
              </div>
              <div>
                <label className={labelClass}>Duration</label>
                <input
                  name="duration"
                  value={planForm.duration}
                  onChange={handlePlanChange}
                  className={inputClass}
                  placeholder="e.g. 4 weeks"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Special instructions</label>
              <textarea
                rows="3"
                name="special_instructions"
                value={planForm.special_instructions}
                onChange={handlePlanChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <textarea
                rows="3"
                name="remarks"
                value={planForm.remarks}
                onChange={handlePlanChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Submitting sends this plan for admin approval. The backend
              does not provide a doctor edit endpoint after submission.
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
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
                  actionId === "create" ||
                  !planForm.doctor_visit_id
                }
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionId === "create"
                  ? "Submitting..."
                  : "Submit for approval"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "details" && selectedPlan && (
        <Modal
          title="Treatment plan details"
          description={`Plan #${selectedPlan.id} · Visit #${selectedPlan.doctor_visit_id}`}
          onClose={closeModal}
          wide
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 p-3 text-blue-600">
                  <FaFileMedical />
                </div>
                <div>
                  <p className="font-bold text-slate-900">
                    {selectedPlan.patient_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Created {formatDate(selectedPlan.created_at)}
                  </p>
                </div>
              </div>
              <StatusBadge value={selectedPlan.status} />
            </div>

            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DetailItem
                label="Diagnosis"
                value={selectedPlan.diagnosis}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Chief complaint"
                value={selectedPlan.chief_complaint}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Treatment plan"
                value={selectedPlan.treatment_plan}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Medicines"
                value={selectedPlan.medicines}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Sessions required"
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
                label="Last updated"
                value={formatDate(selectedPlan.updated_at)}
              />
              <DetailItem
                label="Special instructions"
                value={selectedPlan.special_instructions}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Remarks"
                value={selectedPlan.remarks}
                className="sm:col-span-2"
              />
            </dl>

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </DoctorLayout>
  )
}


export default DoctorTreatmentPlansPage
