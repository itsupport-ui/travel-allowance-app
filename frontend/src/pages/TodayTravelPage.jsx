import { useEffect, useState } from "react"
import TherapistLayout from "../layouts/TherapistLayout"
import { getTodayTravels } from "../services/travelService"
import { useNavigate } from "react-router-dom"
import {
  getClaimPreview,
  submitClaim,
} from "../services/claimService"
import toast from "react-hot-toast"


const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)


const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail
  return typeof detail === "string" ? detail : fallback
}

function TodayTravelPage() {
  const navigate = useNavigate()
  const [travels, setTravels] = useState([])
  const [readiness, setReadiness] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState("")

  const loadPage = async () => {
    const token = localStorage.getItem("token")
    const [travelData, previewData] = await Promise.all([
      getTodayTravels(token),
      getClaimPreview(token),
    ])
    setTravels(travelData)
    setReadiness(previewData)
    setLoadError("")
  }

  useEffect(() => {
    // Initial API hydration; state changes occur after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage()
      .catch((error) => {
        const message = getErrorMessage(
          error,
          "Unable to load today's travel and claim preview."
        )
        setLoadError(message)
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleSubmitClaim = async () => {
    if (!readiness?.can_submit) {
      return
    }
    const action = readiness.submission_mode === "resubmit"
      ? "Resubmit"
      : "Submit"
    const shouldSubmit = window.confirm(
      `${action} ${readiness.eligible_record_count} travel ${
        readiness.eligible_record_count === 1 ? "entry" : "entries"
      } totalling ${formatCurrency(readiness.total_amount)}?`
    )
    if (!shouldSubmit) return

    try {
      setIsSubmitting(true)
      const token = localStorage.getItem("token")
      await submitClaim(token)
      await loadPage()
      toast.success("Claim submitted successfully 🚀")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to submit claim"))
      try {
        await loadPage()
      } catch {
        // Keep the submission error visible; the page-level retry remains.
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <TherapistLayout>
      <div className="w-full max-w-6xl mx-auto px-1 sm:px-4">
        
        {/* Page Title & Main Action Control */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
              Today's Travel
            </h1>
            <p className="text-sm text-gray-500">
              View your logs and submit your daily travel mileage claims.
            </p>
          </div>
          <button
            onClick={handleSubmitClaim}
            disabled={!readiness?.can_submit || isSubmitting}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg transition dynamic-shadow text-center disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting
              ? "Submitting..."
              : readiness?.submission_mode === "resubmit"
                ? "Resubmit Claim"
                : "Submit Claim"}
          </button>
        </div>

        {loadError && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true)
                loadPage()
                  .catch((error) => setLoadError(getErrorMessage(error, "Unable to refresh claim preview.")))
                  .finally(() => setIsLoading(false))
              }}
              className="rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold"
            >
              Try Again
            </button>
          </div>
        )}

        <section
          aria-busy={isLoading}
          className="mb-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"
          data-testid="therapist-claim-readiness"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Today&apos;s claim preview</h2>
              <p className="mt-1 text-sm text-gray-500">
                Server-calculated for {readiness?.business_date || "today"}; eligibility and totals are rechecked when you submit.
              </p>
            </div>
            {readiness && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                readiness.state === "ready"
                  ? "bg-green-100 text-green-800"
                  : readiness.state === "already_submitted"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-amber-100 text-amber-800"
              }`}>
                {readiness.state.replaceAll("_", " ")}
              </span>
            )}
          </div>

          {isLoading && !readiness ? (
            <p className="mt-5 text-sm text-gray-500">Calculating eligible travel and rates...</p>
          ) : readiness ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["Eligible entries", readiness.eligible_record_count],
                  ["Distance", `${readiness.total_km} KM`],
                  ["Travel fare", formatCurrency(readiness.travel_total)],
                  ["Allowance", formatCurrency(readiness.daily_allowance)],
                  ["Claim total", formatCurrency(readiness.total_amount)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500">{label}</p>
                    <p className="mt-1 font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {readiness.policy_version && (
                <p className="mt-3 text-xs text-gray-500">
                  Policy v{readiness.policy_version} · {formatCurrency(readiness.per_km_rate)} per KM · {readiness.rounding_mode}
                </p>
              )}
              {readiness.rejection_reason && readiness.submission_mode === "resubmit" && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                  <strong>Changes requested:</strong> {readiness.rejection_reason}
                </div>
              )}
              {readiness.blocking_reasons.map((blocker) => (
                <div key={blocker.code} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                  {blocker.affected_count > 0 && (
                    <strong>{blocker.affected_count} affected item{blocker.affected_count === 1 ? "" : "s"}. </strong>
                  )}
                  {blocker.message}
                </div>
              ))}
              {readiness.state === "already_submitted" && (
                <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  Today&apos;s claim is already {readiness.existing_claim_status}. Open My Claims to follow its review status.
                </p>
              )}
            </>
          ) : null}
        </section>

        {/* ==================== 1. MOBILE LOGS STACK (Visible on Mobile/Tablet) ==================== */}
        <div className="lg:hidden space-y-4">
          {travels.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-xl shadow-md text-gray-400 text-sm">
              No travel items recorded for today.
            </div>
          ) : (
            travels.map((travel) => (
              <div 
                key={travel.id} 
                className="bg-white rounded-xl shadow-md border border-gray-100 p-5 space-y-4"
              >
                {/* Mobile Card Header */}
                <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                  <div>
                    <span className="text-xs text-gray-400 block font-medium uppercase">Patient</span>
                    <h3 className="font-bold text-gray-800 text-base">
                      {travel.patient_name || "N/A"}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400 block font-medium uppercase">Date</span>
                    <span className="text-sm font-medium text-gray-600">{travel.travel_date}</span>
                  </div>
                </div>

                {/* Route Visual Timeline Details */}
                <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-[9px] before:top-[6px] before:bottom-[6px] before:w-0.5 before:bg-gray-200">
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-50"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">From</span>
                    <p className="text-sm text-gray-700 break-words font-medium">{travel.from_address}</p>
                  </div>
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-50"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">To</span>
                    <p className="text-sm text-gray-700 break-words font-medium">{travel.to_address}</p>
                  </div>
                </div>

                {/* Core Mobile Stats Row */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-3 text-center">
                  <div>
                    <span className="text-xs text-gray-400 block font-medium">Distance</span>
                    <span className="text-sm font-bold text-gray-800">{travel.total_km} KM</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block font-medium">Visited Patient</span>
                    <span className={`text-sm font-bold ${travel.patient_visited ? "text-green-600" : "text-amber-600"}`}>
                      {travel.patient_visited ? "Yes" : "No"}
                    </span>
                  </div>
                </div>

                {/* Core Mobile Action Row */}
                <div className="pt-2">
                  <button
                    onClick={() => navigate(`/travel/${travel.id}`)}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-2.5 rounded-lg text-sm transition text-center"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ==================== 2. DESKTOP ROW VIEW (Visible on Larger Screen Sizes) ==================== */}
        <div className="hidden lg:block bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Patient</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">From</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">To</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">KM</th>
                  <th className="p-4 text-left text-sm font-semibold text-gray-700">Visited</th>
                  <th className="p-4 text-center text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {travels.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-gray-400 text-sm">
                      No travel items recorded for today.
                    </td>
                  </tr>
                ) : (
                  travels.map((travel) => (
                    <tr key={travel.id} className="hover:bg-gray-50/70 transition">
                      <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{travel.travel_date}</td>
                      <td className="p-4 text-sm font-medium text-gray-800">{travel.patient_name || "N/A"}</td>
                      <td className="p-4 text-sm text-gray-600 max-w-xs truncate" title={travel.from_address}>
                        {travel.from_address}
                      </td>
                      <td className="p-4 text-sm text-gray-600 max-w-xs truncate" title={travel.to_address}>
                        {travel.to_address}
                      </td>
                      <td className="p-4 text-sm font-semibold text-gray-800 whitespace-nowrap">{travel.total_km}</td>
                      <td className="p-4 text-sm">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          travel.patient_visited ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {travel.patient_visited ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/travel/${travel.id}`)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1.5 rounded-md hover:bg-blue-50 transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </TherapistLayout>
  )
}

export default TodayTravelPage
