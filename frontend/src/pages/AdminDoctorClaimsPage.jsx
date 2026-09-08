import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaCheckCircle,
  FaDownload,
  FaEye,
  FaFileInvoiceDollar,
  FaTimesCircle,
  FaUserMd,
} from "react-icons/fa"

import AdminLayout from "../layouts/AdminLayout"
import {
  approveDoctorClaim,
  downloadDoctorClaimProof,
  getAdminDoctorClaimHistory,
  getDoctorClaim,
  rejectDoctorClaim,
} from "../services/doctorClaimService"


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"

const initialFilters = {
  status: "",
  from_date: "",
  to_date: "",
  doctor_id: "",
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
  const dateValue = value.includes?.("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dateValue)
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


const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)


function Modal({ title, description, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
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
    pending: "border-blue-200 bg-blue-50 text-blue-700",
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


function AdminDoctorClaimsPage() {
  const [claims, setClaims] = useState([])
  const [doctors, setDoctors] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [selectedClaim, setSelectedClaim] = useState(null)
  const [modal, setModal] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [filters, setFilters] = useState(initialFilters)

  const doctorNames = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.id, doctor.name])),
    [doctors]
  )

  const getDoctorName = (doctorId, responseName = null) =>
    responseName ||
    doctorNames.get(doctorId) ||
    `Doctor #${doctorId}`

  const statusCounts = useMemo(
    () => ({
      pending: claims.filter((claim) => claim.status === "pending").length,
      approved: claims.filter((claim) => claim.status === "approved")
        .length,
      rejected: claims.filter((claim) => claim.status === "rejected")
        .length,
    }),
    [claims]
  )

  const loadClaims = async (activeFilters = filters) => {
    const token = localStorage.getItem("token")
    const data = await getAdminDoctorClaimHistory(
      token,
      activeFilters
    )
    setClaims(data || [])
    setDoctors((current) => {
      const doctorMap = new Map(
        current.map((doctor) => [doctor.id, doctor])
      )
      ;(data || []).forEach((claim) => {
        doctorMap.set(claim.doctor_id, {
          id: claim.doctor_id,
          name: claim.doctor_name,
        })
      })
      return [...doctorMap.values()]
    })
  }

  useEffect(() => {
    const token = localStorage.getItem("token")

    getAdminDoctorClaimHistory(token)
      .then((claimData) => {
        setClaims(claimData || [])
        const doctorMap = new Map()
        ;(claimData || []).forEach((claim) => {
          doctorMap.set(claim.doctor_id, {
            id: claim.doctor_id,
            name: claim.doctor_name,
          })
        })
        setDoctors([...doctorMap.values()])
      })
      .catch((error) => {
        toast.error(
          getErrorMessage(error, "Failed to load doctor claim history")
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
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
      await loadClaims(filters)
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
      await loadClaims(initialFilters)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to clear filters"))
    } finally {
      setIsLoading(false)
    }
  }

  const closeModal = () => {
    if (actionId !== null) return
    setModal(null)
    setSelectedClaim(null)
    setRejectionReason("")
  }

  const openDetails = async (claim) => {
    try {
      setActionId(`view-${claim.id}`)
      const token = localStorage.getItem("token")
      const data = await getDoctorClaim(claim.id, token)
      setSelectedClaim(data)
      setModal("details")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to load claim details"))
    } finally {
      setActionId(null)
    }
  }

  const approveClaim = async (claim) => {
    const shouldApprove = window.confirm(
      `Approve claim #${claim.id} for ${formatCurrency(claim.total_amount)}?`
    )
    if (!shouldApprove) return

    try {
      setActionId(`approve-${claim.id}`)
      const token = localStorage.getItem("token")
      await approveDoctorClaim(claim.id, token)
      await loadClaims()
      if (selectedClaim?.id === claim.id) {
        setModal(null)
        setSelectedClaim(null)
      }
      toast.success("Doctor claim approved")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to approve claim"))
    } finally {
      setActionId(null)
    }
  }

  const openRejectModal = (claim) => {
    setSelectedClaim(claim)
    setRejectionReason("")
    setModal("reject")
  }

  const submitRejection = async (event) => {
    event.preventDefault()
    if (!selectedClaim) return

    try {
      setActionId(`reject-${selectedClaim.id}`)
      const token = localStorage.getItem("token")
      await rejectDoctorClaim(
        selectedClaim.id,
        rejectionReason.trim(),
        token
      )
      await loadClaims()
      setModal(null)
      setSelectedClaim(null)
      setRejectionReason("")
      toast.success("Doctor claim rejected")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to reject claim"))
    } finally {
      setActionId(null)
    }
  }

  const downloadProof = async (claim, expense) => {
    try {
      setActionId(`proof-${expense.id}`)
      const token = localStorage.getItem("token")
      const { blob, filename } = await downloadDoctorClaimProof(
        claim.id,
        expense.id,
        token
      )
      const proofUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement("a")
      downloadLink.href = proofUrl
      downloadLink.download = filename
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      URL.revokeObjectURL(proofUrl)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to download proof"))
    } finally {
      setActionId(null)
    }
  }

  const renderActions = (claim, mobile = false) => {
    const isViewing = actionId === `view-${claim.id}`
    const isApproving = actionId === `approve-${claim.id}`

    return (
      <div
        className={`flex flex-wrap gap-2 ${
          mobile
            ? claim.status === "pending"
              ? "grid grid-cols-3"
              : "grid"
            : "justify-end"
        }`}
      >
        <button
          type="button"
          disabled={isViewing}
          onClick={() => openDetails(claim)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <FaEye />
          {isViewing ? "Loading" : "View"}
        </button>
        {claim.status === "pending" && (
          <>
            <button
              type="button"
              disabled={isApproving}
              onClick={() => approveClaim(claim)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <FaCheckCircle />
              {isApproving ? "Approving" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => openRejectModal(claim)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              <FaTimesCircle />
              Reject
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Doctor Claims History
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review pending, approved, and rejected doctor expense claims.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Pending
              </span>
              <FaFileInvoiceDollar className="text-blue-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {statusCounts.pending}
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

        <form
          onSubmit={applyFilters}
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="Filter by claim status"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="submitted">Submitted</option>
            </select>
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
            <input
              type="date"
              name="from_date"
              value={filters.from_date}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="Claims from date"
            />
            <input
              type="date"
              name="to_date"
              value={filters.to_date}
              onChange={handleFilterChange}
              className={inputClass}
              aria-label="Claims to date"
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
              Loading doctor claims...
            </div>
          ) : claims.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No doctor claims match the selected filters.
            </div>
          ) : (
            claims.map((claim) => (
              <article
                key={claim.id}
                className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p className="font-bold text-slate-900">
                      {getDoctorName(
                        claim.doctor_id,
                        claim.doctor_name
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Claim #{claim.id}
                    </p>
                  </div>
                  <StatusBadge value={claim.status} />
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Date</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {formatDate(claim.claim_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Expenses</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {claim.expense_count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Total</dt>
                    <dd className="mt-0.5 font-bold text-slate-900">
                      {formatCurrency(claim.total_amount)}
                    </dd>
                  </div>
                </dl>
                {renderActions(claim, true)}
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px]">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3.5">Doctor</th>
                  <th className="px-4 py-3.5">Claim date</th>
                  <th className="px-4 py-3.5">Total amount</th>
                  <th className="px-4 py-3.5">Expenses</th>
                  <th className="px-4 py-3.5">Status</th>
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
                      Loading doctor claims...
                    </td>
                  </tr>
                ) : claims.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No doctor claims match the selected filters.
                    </td>
                  </tr>
                ) : (
                  claims.map((claim) => (
                    <tr
                      key={claim.id}
                      className="align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                            <FaUserMd />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {getDoctorName(
                                claim.doctor_id,
                                claim.doctor_name
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              Claim #{claim.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {formatDate(claim.claim_date)}
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900">
                        {formatCurrency(claim.total_amount)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {claim.expense_count}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge value={claim.status} />
                      </td>
                      <td className="px-4 py-4">
                        {renderActions(claim)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal === "details" && selectedClaim && (
        <Modal
          title={`Doctor claim #${selectedClaim.id}`}
          description={`${getDoctorName(selectedClaim.doctor_id)} · ${formatDate(selectedClaim.claim_date)}`}
          onClose={closeModal}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Status
                </p>
                <div className="mt-2">
                  <StatusBadge value={selectedClaim.status} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Expenses
                </p>
                <p className="mt-2 font-bold text-slate-900">
                  {selectedClaim.expense_count}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Total
                </p>
                <p className="mt-2 font-bold text-slate-900">
                  {formatCurrency(selectedClaim.total_amount)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Submitted
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-700">
                  {formatDateTime(selectedClaim.submitted_at)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                Included expenses
              </h3>
              <div className="space-y-2">
                {selectedClaim.expenses?.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {expense.from_location} to {expense.to_location}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-slate-500">
                        {expense.transport_mode} ·{" "}
                        {formatDate(expense.expense_date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-slate-900">
                        {formatCurrency(expense.approved_amount ?? expense.fare)}
                        {expense.approved_amount != null && Number(expense.approved_amount) !== Number(expense.fare) && (
                          <span className="block text-[10px] font-medium text-slate-500">Submitted {formatCurrency(expense.fare)}</span>
                        )}
                      </p>
                      {expense.proof_file && (
                        <button
                          type="button"
                          disabled={
                            actionId === `proof-${expense.id}`
                          }
                          onClick={() =>
                            downloadProof(selectedClaim, expense)
                          }
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800 disabled:opacity-50"
                        >
                          <FaDownload />
                          {actionId === `proof-${expense.id}`
                            ? "Downloading..."
                            : "Download proof"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedClaim.status === "approved" && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                Approved {formatDateTime(selectedClaim.approved_at)}
              </div>
            )}

            {selectedClaim.status === "rejected" && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
                <p className="font-semibold">Rejection reason</p>
                <p className="mt-1">
                  {selectedClaim.rejection_reason ||
                    "No rejection reason provided."}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
              {selectedClaim.status === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => openRejectModal(selectedClaim)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => approveClaim(selectedClaim)}
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {modal === "reject" && selectedClaim && (
        <Modal
          title="Reject doctor claim"
          description={`Record the rejection reason for claim #${selectedClaim.id}.`}
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
                onChange={(event) =>
                  setRejectionReason(event.target.value)
                }
                className={`${inputClass} resize-none`}
                placeholder="Enter a clear reason"
              />
            </div>
            <div className="flex justify-end gap-3">
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
                  actionId === `reject-${selectedClaim.id}` ||
                  !rejectionReason.trim()
                }
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionId === `reject-${selectedClaim.id}`
                  ? "Rejecting..."
                  : "Reject claim"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  )
}


export default AdminDoctorClaimsPage
