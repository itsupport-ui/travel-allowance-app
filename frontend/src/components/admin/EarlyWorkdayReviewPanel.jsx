import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Link } from "react-router-dom"

import { getErrorMessage } from "../../services/http"
import {
  decideEarlyWorkdayClosure,
  getEarlyWorkdayClosures,
} from "../../services/workdayExceptionService"
import { buildFollowUpLink } from "../../utils/followUpLink"


const statusClasses = {
  pending: "bg-amber-100 text-amber-900",
  acknowledged: "bg-emerald-100 text-emerald-800",
  follow_up_required: "bg-rose-100 text-rose-800",
}


const formatStatus = (value) => value.replaceAll("_", " ")


export default function EarlyWorkdayReviewPanel() {
  const [status, setStatus] = useState("pending")
  const [role, setRole] = useState("all")
  const [items, setItems] = useState([])
  const [reasons, setReasons] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyKey, setBusyKey] = useState("")

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const token = localStorage.getItem("token")
      setItems(await getEarlyWorkdayClosures(status, role, token))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load early closures"))
    } finally {
      setLoading(false)
    }
  }, [role, status])

  useEffect(() => {
    // Fetch the selected server-owned review queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems()
  }, [loadItems])

  const decide = async (item, decision) => {
    const key = `${item.staff_role}-${item.workday_id}`
    const reason = (reasons[key] || "").trim()
    if (reason.length < 5) {
      toast.error("Add a review note of at least 5 characters")
      return
    }
    try {
      setBusyKey(key)
      const token = localStorage.getItem("token")
      await decideEarlyWorkdayClosure(
        item.staff_role,
        item.workday_id,
        { decision, reason, version: item.version },
        token,
      )
      toast.success(
        decision === "acknowledged"
          ? "Early closure acknowledged"
          : "Early closure marked for follow-up",
      )
      setReasons((current) => ({ ...current, [key]: "" }))
      await loadItems()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to save review"))
      await loadItems()
    } finally {
      setBusyKey("")
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Early workday closure review</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            A closure cannot be reversed by review. Acknowledge supported cases or flag a follow-up while retaining the staff reason and attendance record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="early-closure-role">Staff role</label>
          <select
            id="early-closure-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
          >
            <option value="all">All staff</option>
            <option value="doctor">Doctors</option>
            <option value="therapist">Therapists</option>
          </select>
          <div className="flex flex-wrap gap-1" aria-label="Early closure review status filter">
            {["pending", "acknowledged", "follow_up_required"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold capitalize ${
                  status === value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {formatStatus(value)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Loading early closures...</p>
      ) : error ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
          <span>{error}</span>
          <button type="button" className="font-bold underline" onClick={loadItems}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
          No {formatStatus(status)} early closures for this staff filter.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const key = `${item.staff_role}-${item.workday_id}`
            return (
              <li key={key} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {item.staff_name}
                      <span className="ml-2 text-xs font-medium capitalize text-slate-500">{item.staff_role}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {new Date(`${item.business_date}T00:00:00`).toLocaleDateString()} · {item.total_work_minutes} minutes worked
                    </p>
                  </div>
                  <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClasses[item.review_status] || statusClasses.pending}`}>
                    {formatStatus(item.review_status)}
                  </span>
                </div>
                <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  <span className="font-bold">Staff reason:</span> {item.staff_reason}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div><dt className="text-slate-400">Started</dt><dd className="mt-1 font-semibold text-slate-700">{new Date(item.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>
                  <div><dt className="text-slate-400">Ended</dt><dd className="mt-1 font-semibold text-slate-700">{new Date(item.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>
                  <div><dt className="text-slate-400">Completed</dt><dd className="mt-1 font-semibold text-slate-700">{item.completed_activities}</dd></div>
                  <div><dt className="text-slate-400">Pending</dt><dd className="mt-1 font-semibold text-slate-700">{item.pending_activities}</dd></div>
                </dl>
                <Link to={buildFollowUpLink({ domain: "attendance", entityType: `${item.staff_role}_workday`, entityId: item.workday_id, title: "Review early workday closure" })} className="mt-3 inline-block text-xs font-bold text-blue-700 underline">
                  Create follow-up
                </Link>
                {item.review_reason && (
                  <p className="mt-3 text-xs text-slate-600">
                    <span className="font-bold">Review:</span> {item.review_reason}
                    {item.reviewer_name ? ` — ${item.reviewer_name}` : ""}
                  </p>
                )}
                {item.review_status === "pending" && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <label className="sr-only" htmlFor={`early-review-${key}`}>Required review note</label>
                    <input
                      id={`early-review-${key}`}
                      value={reasons[key] || ""}
                      maxLength="500"
                      onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="Required review note"
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide(item, "follow_up_required")}
                      className="rounded-md border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
                    >
                      Needs follow-up
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide(item, "acknowledged")}
                      className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busyKey === key ? "Saving..." : "Acknowledge"}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
