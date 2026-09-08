import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"
import {
  getLocationPolicy,
  getLocationPolicyHistory,
  getReimbursementPolicyHistory,
  getSettings,
  updateLocationPolicy,
  updateSettings,
} from "../services/settingsService"

const todayInIndia = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())

const isValidAmount = (value) => {
  const normalized = String(value).trim()
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) && Number(normalized) >= 0
}

const isNumberInRange = (value, minimum, maximum) => {
  const number = Number(value)
  return String(value).trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum
}

const toLocationForm = (policy) => ({
  geofence_radius_m: String(policy.geofence_radius_m),
  gps_accuracy_threshold_m: String(policy.gps_accuracy_threshold_m),
  evidence_max_age_minutes: String(policy.evidence_max_age_minutes),
  approval_valid_hours: String(policy.approval_valid_hours),
  max_evidence_movement_m: String(policy.max_evidence_movement_m),
})

function SettingsPage() {
  const [perKmRate, setPerKmRate] = useState("")
  const [dailyAllowance, setDailyAllowance] = useState("")
  const [doctorReceiptThreshold, setDoctorReceiptThreshold] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState(todayInIndia())
  const [currentPolicy, setCurrentPolicy] = useState(null)
  const [reimbursementHistory, setReimbursementHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locationPolicy, setLocationPolicy] = useState(null)
  const [locationHistory, setLocationHistory] = useState([])
  const [locationForm, setLocationForm] = useState({
    geofence_radius_m: "250",
    gps_accuracy_threshold_m: "250",
    evidence_max_age_minutes: "15",
    approval_valid_hours: "8",
    max_evidence_movement_m: "250",
  })
  const [locationEffectiveFrom, setLocationEffectiveFrom] = useState(todayInIndia())
  const [locationSaving, setLocationSaving] = useState(false)

  async function fetchSettings() {
    try {
      const token = localStorage.getItem("token")
      const [data, reimbursementPolicies, currentLocationPolicy, policyHistory] = await Promise.all([
        getSettings(token),
        getReimbursementPolicyHistory(token),
        getLocationPolicy(token),
        getLocationPolicyHistory(token),
      ])
      setCurrentPolicy(data)
      setReimbursementHistory(reimbursementPolicies)
      setPerKmRate(String(data.per_km_rate))
      setDailyAllowance(String(data.daily_allowance))
      setDoctorReceiptThreshold(String(data.doctor_receipt_threshold))
      setLocationPolicy(currentLocationPolicy)
      setLocationForm(toLocationForm(currentLocationPolicy))
      setLocationHistory(policyHistory)
    } catch {
      toast.error("Failed to load reimbursement settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial API hydration; state changes occur after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings()
  }, [])

  const formIsValid = useMemo(
    () =>
      isValidAmount(perKmRate) &&
      isValidAmount(dailyAllowance) &&
      isValidAmount(doctorReceiptThreshold) &&
      Boolean(effectiveFrom),
    [dailyAllowance, doctorReceiptThreshold, effectiveFrom, perKmRate]
  )

  const locationFormIsValid = useMemo(() => {
    const radius = Number(locationForm.geofence_radius_m)
    const accuracy = Number(locationForm.gps_accuracy_threshold_m)
    return (
      isNumberInRange(locationForm.geofence_radius_m, 50, 1000) &&
      isNumberInRange(locationForm.gps_accuracy_threshold_m, 10, 1000) &&
      accuracy <= radius * 2 &&
      isNumberInRange(locationForm.evidence_max_age_minutes, 1, 60) &&
      Number.isInteger(Number(locationForm.evidence_max_age_minutes)) &&
      isNumberInRange(locationForm.approval_valid_hours, 1, 24) &&
      Number.isInteger(Number(locationForm.approval_valid_hours)) &&
      isNumberInRange(locationForm.max_evidence_movement_m, 25, 1000) &&
      Boolean(locationEffectiveFrom) &&
      locationEffectiveFrom >= todayInIndia()
    )
  }, [locationEffectiveFrom, locationForm])

  const handleSave = async () => {
    if (!formIsValid || saving) return

    setSaving(true)
    try {
      const token = localStorage.getItem("token")
      await updateSettings(
        {
          per_km_rate: Number(perKmRate),
          daily_allowance: Number(dailyAllowance),
          doctor_receipt_threshold: Number(doctorReceiptThreshold),
          effective_from: effectiveFrom
        },
        token
      )
      await fetchSettings()
      toast.success(
        effectiveFrom > todayInIndia()
          ? `Rates scheduled for ${effectiveFrom}`
          : "New reimbursement policy is active"
      )
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === "string" ? detail : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  const handleLocationSave = async () => {
    if (!locationFormIsValid || locationSaving) return
    setLocationSaving(true)
    try {
      const token = localStorage.getItem("token")
      const saved = await updateLocationPolicy(
        {
          geofence_radius_m: Number(locationForm.geofence_radius_m),
          gps_accuracy_threshold_m: Number(locationForm.gps_accuracy_threshold_m),
          evidence_max_age_minutes: Number(locationForm.evidence_max_age_minutes),
          approval_valid_hours: Number(locationForm.approval_valid_hours),
          max_evidence_movement_m: Number(locationForm.max_evidence_movement_m),
          effective_from: locationEffectiveFrom,
        },
        token,
      )
      setLocationPolicy(saved)
      setLocationForm(toLocationForm(saved))
      setLocationHistory(await getLocationPolicyHistory(token))
      toast.success(
        locationEffectiveFrom > todayInIndia()
          ? `Location policy scheduled for ${locationEffectiveFrom}`
          : "New location policy is active",
      )
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === "string" ? detail : "Location policy update failed")
    } finally {
      setLocationSaving(false)
    }
  }

  const setLocationField = (name, value) => {
    setLocationForm((current) => ({ ...current, [name]: value }))
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">
          Policy Settings
        </h1>
        <p className="mb-6 text-sm leading-6 text-gray-600">
          Rate changes create a new policy version. Existing travel entries and
          claims keep the rates and totals saved when they were created.
        </p>

        {currentPolicy && (
          <div
            className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"
            role="status"
          >
            <div className="font-semibold">
              Active policy: version {currentPolicy.version}
            </div>
            <div className="mt-1 text-blue-800">
              Effective from {currentPolicy.effective_from} · Rounding: half up
              to 2 decimal places
            </div>
          </div>
        )}

        <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <fieldset disabled={loading || saving} className="space-y-6">
            <legend className="sr-only">Reimbursement policy rates</legend>

            <div>
              <label
                htmlFor="per-km-rate"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Per-kilometre rate (INR)
              </label>
              <input
                id="per-km-rate"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={perKmRate}
                onChange={(event) => setPerKmRate(event.target.value)}
                placeholder="0.00"
                aria-describedby="rate-help"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p id="rate-help" className="mt-1.5 text-xs text-gray-500">
                Enter a non-negative amount with no more than two decimal places.
              </p>
            </div>

            <div>
              <label
                htmlFor="daily-allowance"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Daily allowance (INR)
              </label>
              <input
                id="daily-allowance"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={dailyAllowance}
                onChange={(event) => setDailyAllowance(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="doctor-receipt-threshold"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Doctor receipt threshold (INR)
              </label>
              <input
                id="doctor-receipt-threshold"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={doctorReceiptThreshold}
                onChange={(event) => setDoctorReceiptThreshold(event.target.value)}
                placeholder="500.00"
                aria-describedby="receipt-threshold-help"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p id="receipt-threshold-help" className="mt-1.5 text-xs text-gray-500">
                Actual-fare expenses at or above this amount require a receipt.
                Manual exceptions, toll/parking, and authorized-other expenses always require one.
              </p>
            </div>

            <div>
              <label
                htmlFor="effective-from"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Effective date (Asia/Kolkata)
              </label>
              <input
                id="effective-from"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Choose today for an immediate change, or a future date to
                schedule it.
              </p>
            </div>
          </fieldset>

          {!formIsValid && !loading && (
            <p className="text-sm text-red-700" role="alert">
              Complete all fields using valid non-negative amounts with up to
              two decimal places.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!formIsValid || loading || saving}
            className="w-full rounded-lg bg-blue-600 px-8 py-3.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Saving policy..." : "Save new policy version"}
          </button>
        </div>

        <section className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white" aria-labelledby="reimbursement-history-title">
          <h2 id="reimbursement-history-title" className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
            Reimbursement policy history
          </h2>
          {reimbursementHistory.length ? (
            <ul className="divide-y divide-gray-100">
              {reimbursementHistory.map((policy) => (
                <li key={policy.id} className="grid gap-2 px-5 py-4 text-xs text-gray-600 sm:grid-cols-4">
                  <p className="font-bold text-gray-900">Version {policy.version}</p>
                  <p>{policy.effective_from} to {policy.effective_to || "current"}</p>
                  <p>INR {Number(policy.per_km_rate).toFixed(2)}/km Â· allowance INR {Number(policy.daily_allowance).toFixed(2)}</p>
                  <p className="sm:text-right">Receipt from INR {Number(policy.doctor_receipt_threshold).toFixed(2)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-gray-500">No reimbursement policy history is available.</p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-gray-900">Field Location Policy</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            These versioned controls govern patient-radius verification and the evidence lifetime for one-time exception approvals. Existing exception requests retain their original policy snapshot.
          </p>

          {locationPolicy && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
              <p className="font-semibold">Active location policy: version {locationPolicy.version}</p>
              <p className="mt-1 text-amber-800">
                {locationPolicy.geofence_radius_m} m radius · GPS threshold {locationPolicy.gps_accuracy_threshold_m} m · effective {locationPolicy.effective_from}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
            <fieldset disabled={loading || locationSaving} className="grid gap-5 sm:grid-cols-2">
              <legend className="sr-only">Field location policy</legend>
              {[
                ["geofence_radius_m", "Patient geofence radius", "m", 50, 1000, "Allowed distance from the patient location."],
                ["gps_accuracy_threshold_m", "GPS accuracy threshold", "m", 10, 1000, "Accuracy at or below this value is considered usable."],
                ["evidence_max_age_minutes", "Evidence maximum age", "minutes", 1, 60, "Freshness required when requesting an exception."],
                ["approval_valid_hours", "Approval validity", "hours", 1, 24, "Maximum time before an unused approval expires."],
                ["max_evidence_movement_m", "Approved evidence movement", "m", 25, 1000, "Maximum movement allowed before fresh review is required."],
              ].map(([name, label, unit, min, max, help]) => (
                <div key={name}>
                  <label htmlFor={name} className="mb-2 block text-sm font-semibold text-gray-700">
                    {label} ({unit})
                  </label>
                  <input
                    id={name}
                    type="number"
                    min={min}
                    max={max}
                    step="1"
                    value={locationForm[name]}
                    onChange={(event) => setLocationField(name, event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">{help} Allowed range: {min}–{max}.</p>
                </div>
              ))}
              <div>
                <label htmlFor="location-effective-from" className="mb-2 block text-sm font-semibold text-gray-700">
                  Effective date (Asia/Kolkata)
                </label>
                <input
                  id="location-effective-from"
                  type="date"
                  min={todayInIndia()}
                  value={locationEffectiveFrom}
                  onChange={(event) => setLocationEffectiveFrom(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </fieldset>

            {!locationFormIsValid && !loading && (
              <p className="text-sm text-red-700" role="alert">
                Enter values within the displayed ranges. GPS accuracy cannot exceed twice the geofence radius, and the effective date cannot be in the past.
              </p>
            )}
            <button
              type="button"
              onClick={handleLocationSave}
              disabled={!locationFormIsValid || loading || locationSaving}
              className="rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locationSaving ? "Saving policy..." : "Save new location policy version"}
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">Location policy history</h3>
            {locationHistory.length ? (
              <ul className="divide-y divide-gray-100">
                {locationHistory.map((policy) => (
                  <li key={policy.id} className="grid gap-2 px-5 py-4 text-xs text-gray-600 sm:grid-cols-3">
                    <p className="font-bold text-gray-900">Version {policy.version}</p>
                    <p>{policy.effective_from} to {policy.effective_to || "current"}</p>
                    <p className="sm:text-right">{policy.geofence_radius_m} m radius · {policy.gps_accuracy_threshold_m} m GPS</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-gray-500">No location policy history is available.</p>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}

export default SettingsPage
