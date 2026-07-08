import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaCalendarDay,
  FaCheckCircle,
  FaClock,
  FaEye,
  FaFileInvoiceDollar,
  FaReceipt,
  FaTimesCircle,
} from "react-icons/fa"

import DoctorLayout from "../layouts/DoctorLayout"
import {
  getDoctorClaim,
  getMyDoctorClaims,
  submitDoctorClaim,
} from "../services/doctorClaimService"
import { getTodayDoctorExpenses } from "../services/doctorExpenseService"


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
    draft: "border-amber-200 bg-amber-50 text-amber-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
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


function DoctorClaimsPage() {
  const [todayExpenses, setTodayExpenses] = useState([])
  const [claims, setClaims] = useState([])
  const [activeTab, setActiveTab] = useState("today")
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [selectedClaim, setSelectedClaim] = useState(null)

  const loadClaimsPage = async () => {
    const token = localStorage.getItem("token")
    const [expenseData, claimData] = await Promise.all([
      getTodayDoctorExpenses(token),
      getMyDoctorClaims(token),
    ])
    setTodayExpenses(expenseData || [])
    setClaims(claimData || [])
  }

  useEffect(() => {
    const token = localStorage.getItem("token")

    Promise.all([
      getTodayDoctorExpenses(token),
      getMyDoctorClaims(token),
    ])
      .then(([expenseData, claimData]) => {
        setTodayExpenses(expenseData || [])
        setClaims(claimData || [])
      })
      .catch((error) => {
        toast.error(
          getErrorMessage(error, "Failed to load doctor claims")
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const eligibleExpenses = useMemo(
    () =>
      todayExpenses.filter(
        (expense) =>
          expense.status === "draft" && expense.claim_id == null
      ),
    [todayExpenses]
  )

  const eligibleTotal = useMemo(
    () =>
      eligibleExpenses.reduce(
        (total, expense) => total + Number(expense.fare || 0),
        0
      ),
    [eligibleExpenses]
  )

  const todayClaim = useMemo(() => {
    const today = new Date()
    const localToday = new Date(
      today.getTime() - today.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 10)
    return claims.find((claim) => claim.claim_date === localToday)
  }, [claims])

  const sortedClaims = useMemo(
    () =>
      [...claims].sort((left, right) => {
        const dateComparison = right.claim_date.localeCompare(
          left.claim_date
        )
        if (dateComparison !== 0) return dateComparison
        return new Date(right.created_at) - new Date(left.created_at)
      }),
    [claims]
  )

  const canSubmit =
    eligibleExpenses.length > 0 &&
    (!todayClaim || todayClaim.status === "rejected")

  const handleSubmitClaim = async () => {
    const shouldSubmit = window.confirm(
      `Submit ${eligibleExpenses.length} expense(s) totalling ${formatCurrency(eligibleTotal)} for approval?`
    )
    if (!shouldSubmit) return

    try {
      setActionId("submit")
      const token = localStorage.getItem("token")
      await submitDoctorClaim(token)
      await loadClaimsPage()
      setActiveTab("history")
      toast.success("Claim submitted")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to submit claim"))
    } finally {
      setActionId(null)
    }
  }

  const openClaimDetails = async (claim) => {
    try {
      setActionId(`view-${claim.id}`)
      const token = localStorage.getItem("token")
      const data = await getDoctorClaim(claim.id, token)
      setSelectedClaim(data)
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to load claim details")
      )
    } finally {
      setActionId(null)
    }
  }

  const closeDetails = () => {
    if (actionId !== null) return
    setSelectedClaim(null)
  }

  return (
    <DoctorLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Doctor Claims
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Submit today&apos;s draft expenses and monitor approvals.
            </p>
          </div>
          <button
            type="button"
            disabled={!canSubmit || actionId === "submit"}
            onClick={handleSubmitClaim}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <FaFileInvoiceDollar />
            {actionId === "submit" ? "Submitting..." : "Submit Claim"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Eligible today
              </span>
              <FaReceipt className="text-blue-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {eligibleExpenses.length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Claim total
              </span>
              <FaFileInvoiceDollar className="text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {formatCurrency(eligibleTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Today&apos;s claim
              </span>
              <FaCalendarDay className="text-slate-400" />
            </div>
            <div className="mt-3">
              {todayClaim ? (
                <StatusBadge value={todayClaim.status} />
              ) : (
                <span className="text-sm font-semibold text-slate-400">
                  Not submitted
                </span>
              )}
            </div>
          </div>
        </div>

        {todayClaim && todayClaim.status !== "rejected" && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Today&apos;s claim has already been submitted and is currently{" "}
            <strong>{todayClaim.status}</strong>.
          </div>
        )}

        {todayClaim?.status === "rejected" &&
          eligibleExpenses.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The rejected claim can be resubmitted with today&apos;s draft
              expenses.
            </div>
          )}

        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === "today"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Today&apos;s Expenses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === "history"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Claim History
          </button>
        </div>

        {activeTab === "today" ? (
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-slate-100 bg-slate-50/80">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3.5">Route</th>
                    <th className="px-4 py-3.5">Transport</th>
                    <th className="px-4 py-3.5">Fare</th>
                    <th className="px-4 py-3.5">Receipt</th>
                    <th className="px-4 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-4 py-10 text-center text-sm text-slate-500"
                      >
                        Loading expenses...
                      </td>
                    </tr>
                  ) : todayExpenses.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-4 py-10 text-center text-sm text-slate-500"
                      >
                        No expenses recorded for today.
                      </td>
                    </tr>
                  ) : (
                    todayExpenses.map((expense) => (
                      <tr
                        key={expense.id}
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {expense.from_location}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            to {expense.to_location}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm capitalize text-slate-700">
                          {expense.transport_mode}
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-900">
                          {formatCurrency(expense.fare)}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {expense.proof_file ? "Attached" : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge value={expense.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
                Loading claim history...
              </div>
            ) : sortedClaims.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No claims submitted yet.
              </div>
            ) : (
              sortedClaims.map((claim) => {
                const isViewing = actionId === `view-${claim.id}`

                return (
                  <article
                    key={claim.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                        <FaFileInvoiceDollar />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-bold text-slate-900">
                            Claim #{claim.id}
                          </h2>
                          <StatusBadge value={claim.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(claim.claim_date)} ·{" "}
                          {claim.expense_count} expense(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <p className="text-lg font-extrabold text-slate-900">
                        {formatCurrency(claim.total_amount)}
                      </p>
                      <button
                        type="button"
                        disabled={isViewing}
                        onClick={() => openClaimDetails(claim)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        <FaEye />
                        {isViewing ? "Loading..." : "View"}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        )}
      </div>

      {selectedClaim && (
        <Modal
          title={`Claim #${selectedClaim.id}`}
          description={`Submitted for ${formatDate(selectedClaim.claim_date)}`}
          onClose={closeDetails}
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

            {selectedClaim.status === "approved" && (
              <div className="flex gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
                <FaCheckCircle className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Claim approved</p>
                  <p className="mt-1 text-xs">
                    Approved {formatDateTime(selectedClaim.approved_at)}
                  </p>
                </div>
              </div>
            )}

            {selectedClaim.status === "pending" && (
              <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-800">
                <FaClock className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Awaiting admin review</p>
                  <p className="mt-1 text-xs">
                    Approval status will update after review.
                  </p>
                </div>
              </div>
            )}

            {selectedClaim.status === "rejected" && (
              <div className="flex gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-rose-800">
                <FaTimesCircle className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Claim rejected</p>
                  <p className="mt-1 text-sm">
                    {selectedClaim.rejection_reason ||
                      "No rejection reason provided."}
                  </p>
                </div>
              </div>
            )}

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
                    <p className="shrink-0 font-bold text-slate-900">
                      {formatCurrency(expense.fare)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeDetails}
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


export default DoctorClaimsPage
