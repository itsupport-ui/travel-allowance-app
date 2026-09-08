import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import PageState from "../components/ui/PageState"
import Pagination from "../components/ui/Pagination"
import StatusBadge from "../components/ui/StatusBadge"
import { getAdminClaimReview } from "../services/adminOperationsService"
import { approveClaim, rejectClaim } from "../services/claimService"
import { getErrorMessage } from "../services/http"

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
})

function AdminClaimsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get("status")
  const [filters, setFilters] = useState({
    status: ["pending", "approved", "rejected", "all"].includes(initialStatus)
      ? initialStatus
      : "pending",
    search: "",
    sort: "newest",
    from_date: "",
    to_date: "",
    page: 1,
    page_size: 20,
  })
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [decision, setDecision] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      350,
    )
    return () => window.clearTimeout(timer)
  }, [filters.search])

  const query = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({ ...filters, search: debouncedSearch }).filter(
          ([, value]) => value !== "",
        ),
      ),
    [filters, debouncedSearch],
  )

  const loadClaims = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setData(await getAdminClaimReview(query))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load claims"))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    // Initial and filter-driven synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClaims()
  }, [loadClaims])

  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value, page: 1 }))
    if (name === "status") {
      setSearchParams({ status: value })
    }
  }

  const applyDecision = async () => {
    setSaving(true)
    try {
      const token = localStorage.getItem("token")
      if (decision.action === "approve") {
        await approveClaim(decision.claim.id, token)
      } else {
        await rejectClaim(decision.claim.id, token, rejectionReason.trim())
      }
      toast.success(`Claim ${decision.action}d`)
      setDecision(null)
      setRejectionReason("")
      loadClaims()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to update claim"))
    } finally {
      setSaving(false)
    }
  }

  const summary = data?.summary || {}

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-black text-slate-900">Claims Review</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review therapist travel evidence, distance, and reimbursement totals.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Pending claims", summary.pending_claims, "text-amber-700"],
            ["Pending amount", money.format(summary.pending_amount || 0), "text-blue-700"],
            ["High value", summary.high_value_claims, "text-rose-700"],
            ["Average distance", `${summary.average_distance || 0} km`, "text-emerald-700"],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
              <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={filters.search}
              onChange={(event) => setFilter("search", event.target.value)}
              placeholder="Search claim, therapist, or patient"
              className="rounded-md border border-slate-300 px-3 py-2.5 text-xs xl:col-span-2"
            />
            <select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs"
              aria-label="Claim status"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All statuses</option>
            </select>
            <input
              type="date"
              value={filters.from_date}
              onChange={(event) => setFilter("from_date", event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs"
              aria-label="Claims from date"
            />
            <input
              type="date"
              min={filters.from_date}
              value={filters.to_date}
              onChange={(event) => setFilter("to_date", event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs"
              aria-label="Claims to date"
            />
            <select
              value={filters.sort}
              onChange={(event) => setFilter("sort", event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs"
              aria-label="Sort claims"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest_amount">Highest amount</option>
              <option value="longest_distance">Longest distance</option>
              <option value="therapist_name">Therapist</option>
            </select>
          </div>

          <PageState
            loading={loading}
            error={error}
            empty={!loading && !error && !data?.items?.length}
            onRetry={loadClaims}
            emptyTitle="No claims match these filters"
          />

          {!loading && !error && data?.items?.map((claim) => (
            <article
              key={claim.id}
              className="border-b border-slate-200 p-4 last:border-0 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-48">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Claim #{claim.id}
                    </h2>
                    <StatusBadge status={claim.status} />
                    {claim.is_urgent && <StatusBadge status="urgent" label="Review now" />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {claim.therapist_name} · {claim.claim_date}
                  </p>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div><span className="text-slate-400">Patients</span><p className="font-bold text-slate-700">{claim.visited_count}/{claim.patient_count}</p></div>
                  <div><span className="text-slate-400">Distance</span><p className="font-bold text-slate-700">{claim.total_km} km</p></div>
                  <div><span className="text-slate-400">Travel</span><p className="font-bold text-slate-700">{money.format(claim.travel_total)}</p></div>
                  <div><span className="text-slate-400">Grand total</span><p className="font-black text-slate-900">{money.format(claim.grand_total)}</p></div>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/admin/claim/${claim.id}`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </Link>
                  {claim.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectionReason("")
                          setDecision({ action: "approve", claim })
                        }}
                        className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectionReason("")
                          setDecision({ action: "reject", claim })
                        }}
                        className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!loading && !error && data?.total_pages > 1 && (
            <div className="p-4">
              <Pagination
                page={data.page}
                totalPages={data.total_pages}
                onChange={(page) => setFilters((current) => ({ ...current, page }))}
              />
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(decision)}
        title={`${decision?.action === "approve" ? "Approve" : "Reject"} claim?`}
        message={
          decision
            ? `Claim #${decision.claim.id} for ${money.format(decision.claim.grand_total)} will be ${decision.action}d.`
            : ""
        }
        confirmLabel={decision?.action === "approve" ? "Approve claim" : "Reject claim"}
        destructive={decision?.action === "reject"}
        busy={saving}
        confirmDisabled={
          decision?.action === "reject" && !rejectionReason.trim()
        }
        onClose={() => {
          setDecision(null)
          setRejectionReason("")
        }}
        onConfirm={applyDecision}
      >
        {decision?.action === "reject" && (
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            What must the therapist correct?
            <textarea
              autoFocus
              required
              maxLength={500}
              rows={4}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Give a specific, actionable reason"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
            />
            <span className="mt-1 block text-right text-xs font-normal text-slate-400">
              {rejectionReason.length}/500
            </span>
          </label>
        )}
      </ConfirmDialog>
    </AdminLayout>
  )
}

export default AdminClaimsPage
