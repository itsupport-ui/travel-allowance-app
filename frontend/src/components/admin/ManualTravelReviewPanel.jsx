import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Link } from "react-router-dom"

import { getErrorMessage } from "../../services/http"
import {
  decideManualTravel,
  getManualTravelReviews,
  openTravelInvoice,
} from "../../services/travelService"
import { buildFollowUpLink } from "../../utils/followUpLink"


const statuses = ["pending", "approved", "changes_requested", "cancelled"]


export default function ManualTravelReviewPanel() {
  const [status, setStatus] = useState("pending")
  const [items, setItems] = useState([])
  const [reasons, setReasons] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setItems(await getManualTravelReviews(status, localStorage.getItem("token")))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load manual travel reviews"))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    // Fetch the selected server-owned financial review queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const decide = async (item, decision) => {
    const reason = (reasons[item.id] || "").trim()
    if (reason.length < 5) {
      toast.error("Add a review note of at least 5 characters")
      return
    }
    try {
      setBusyId(item.id)
      await decideManualTravel(
        item.id,
        { decision, reason, version: item.manual_review_version },
        localStorage.getItem("token"),
      )
      toast.success(
        decision === "approved"
          ? "Manual travel approved"
          : "Corrections requested",
      )
      setReasons((current) => ({ ...current, [item.id]: "" }))
      await load()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to save travel review"))
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const viewProof = async (item) => {
    try {
      await openTravelInvoice(item.id, localStorage.getItem("token"))
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to open invoice"))
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Manual travel review</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Review therapist-entered financial evidence before it becomes claim-eligible. Request changes instead of creating a rejection dead end.
          </p>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Manual travel review status filter">
          {statuses.map((value) => (
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
              {value.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Loading manual travel...</p>
      ) : error ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
          <span>{error}</span>
          <button type="button" className="font-bold underline" onClick={load}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
          No {status.replaceAll("_", " ")} manual travel entries.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {item.therapist_name || `Therapist #${item.therapist_id}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {item.travel_date} · {item.transport_mode} · {item.total_km} km · INR {Number(item.travel_fare).toFixed(2)}
                  </p>
                </div>
                <span className="self-start rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold capitalize text-amber-900">
                  {(item.manual_review_status || "pending").replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                <span className="font-bold">Reason:</span> {item.manual_reason}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div><dt className="text-slate-400">From</dt><dd className="mt-1 font-semibold text-slate-700">{item.from_address}</dd></div>
                <div><dt className="text-slate-400">To</dt><dd className="mt-1 font-semibold text-slate-700">{item.to_address}</dd></div>
                <div><dt className="text-slate-400">Revision</dt><dd className="mt-1 font-semibold text-slate-700">{item.manual_revision}</dd></div>
                <div><dt className="text-slate-400">Proof</dt><dd className="mt-1 font-semibold text-slate-700">{item.invoice_file ? "Attached" : "Not required/attached"}</dd></div>
              </dl>
              {item.invoice_file && (
                <button type="button" onClick={() => viewProof(item)} className="mt-3 text-xs font-bold text-blue-700 underline">
                  View invoice
                </button>
              )}
              <Link to={buildFollowUpLink({ domain: "travel", entityType: "therapist_travel", entityId: item.id, title: "Review manual therapist travel" })} className="ml-3 mt-3 inline-block text-xs font-bold text-blue-700 underline">
                Create follow-up
              </Link>
              {item.manual_review_reason && (
                <p className="mt-3 text-xs text-slate-600"><span className="font-bold">Review:</span> {item.manual_review_reason}</p>
              )}
              {item.manual_review_status === "pending" && (
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <label className="sr-only" htmlFor={`manual-review-${item.id}`}>Manual travel review note</label>
                  <input
                    id={`manual-review-${item.id}`}
                    value={reasons[item.id] || ""}
                    maxLength="500"
                    onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Required review note"
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button type="button" disabled={busyId !== null} onClick={() => decide(item, "changes_requested")} className="rounded-md border border-amber-400 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">
                    Request changes
                  </button>
                  <button type="button" disabled={busyId !== null} onClick={() => decide(item, "approved")} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busyId === item.id ? "Saving..." : "Approve"}
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
