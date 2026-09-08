import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Link } from "react-router-dom"

import {
  decideLocationException,
  getLocationExceptions,
} from "../../services/locationExceptionService"
import { getErrorMessage } from "../../services/http"
import { buildFollowUpLink } from "../../utils/followUpLink"


const statusClasses = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  used: "bg-blue-100 text-blue-800",
  expired: "bg-slate-100 text-slate-700",
}


export default function LocationExceptionReviewPanel() {
  const [status, setStatus] = useState("pending")
  const [requests, setRequests] = useState([])
  const [reasons, setReasons] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const token = localStorage.getItem("token")
      setRequests(await getLocationExceptions(status, token))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load location exceptions"))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    // Fetch the selected server-owned review queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests()
  }, [loadRequests])

  const decide = async (request, decision) => {
    const reason = (reasons[request.id] || "").trim()
    if (reason.length < 5) {
      toast.error("Add a review reason of at least 5 characters")
      return
    }
    try {
      setBusyId(request.id)
      const token = localStorage.getItem("token")
      await decideLocationException(
        request.id,
        { decision, reason, version: request.version },
        token,
      )
      toast.success(`Location exception ${decision}`)
      setReasons((current) => ({ ...current, [request.id]: "" }))
      await loadRequests()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to review request"))
      await loadRequests()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Location exception review</h2>
          <p className="mt-1 text-xs text-slate-500">
            Review one-time field attendance exceptions. Decisions retain the requester, evidence, reviewer, reason, and timestamps.
          </p>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Location exception status filter">
          {["pending", "approved", "used", "rejected", "expired"].map((value) => (
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
              {value}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Loading exception requests...</p>
      ) : error ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
          <span>{error}</span>
          <button type="button" className="font-bold underline" onClick={loadRequests}>Retry</button>
        </div>
      ) : requests.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
          No {status} location exceptions.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {request.requester_name || `Staff #${request.requested_by}`}
                    <span className="ml-2 text-xs font-medium capitalize text-slate-500">{request.staff_role}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {request.action.replace("_", " ")} · {request.target_type.replaceAll("_", " ")} #{request.target_id}
                  </p>
                </div>
                <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClasses[request.status] || statusClasses.expired}`}>
                  {request.status}
                </span>
              </div>
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-700">{request.reason}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div><dt className="text-slate-400">Requested</dt><dd className="mt-1 font-semibold text-slate-700">{new Date(request.requested_at).toLocaleString()}</dd></div>
                <div><dt className="text-slate-400">GPS quality</dt><dd className="mt-1 font-semibold capitalize text-slate-700">{request.evidence_quality} ({Math.round(request.gps_accuracy_m)} m)</dd></div>
                <div><dt className="text-slate-400">Distance</dt><dd className="mt-1 font-semibold text-slate-700">{request.distance_km == null ? "Unavailable" : `${request.distance_km.toFixed(2)} km`}</dd></div>
                <div><dt className="text-slate-400">Policy</dt><dd className="mt-1 font-semibold text-slate-700">v{request.location_policy_version} · {request.geofence_radius_m} m radius</dd></div>
              </dl>
              <Link to={buildFollowUpLink({ domain: "location", entityType: "location_exception", entityId: request.id, title: "Review field location exception" })} className="mt-3 inline-block text-xs font-bold text-blue-700 underline">
                Create follow-up
              </Link>
              {request.decision_reason && (
                <p className="mt-3 text-xs text-slate-600">
                  <span className="font-bold">Decision:</span> {request.decision_reason}
                  {request.reviewer_name ? ` — ${request.reviewer_name}` : ""}
                </p>
              )}
              {request.status === "pending" && (
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <label className="sr-only" htmlFor={`review-reason-${request.id}`}>Review reason</label>
                  <input
                    id={`review-reason-${request.id}`}
                    value={reasons[request.id] || ""}
                    maxLength="500"
                    onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                    placeholder="Required review reason"
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => decide(request, "rejected")}
                    className="rounded-md border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => decide(request, "approved")}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {busyId === request.id ? "Saving..." : "Approve once"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
