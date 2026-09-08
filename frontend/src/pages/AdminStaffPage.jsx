import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import { registerUser } from "../services/authService"
import {
  createDoctorProfile,
  createDoctorUser,
  decideStaffDeactivationOverride,
  getDoctorsForManagement,
  getStaffDeactivationOverrides,
  getStaffDeactivationReadiness,
  getTherapistsForManagement,
  requestStaffDeactivationOverride,
  updateDoctor,
  updateTherapist,
} from "../services/staffService"
import { getErrorMessage } from "../services/http"
import {
  isValidEmail,
  isValidPhone,
  validatePassword,
} from "../utils/validation"

const emptyForm = {
  id: null,
  user_id: null,
  name: "",
  email: "",
  password: "",
  phone: "",
  specialization: "",
  is_active: true,
}

function StaffForm({ type, initialValue, onClose, onSaved }) {
  const [form, setForm] = useState(initialValue || emptyForm)
  const [saving, setSaving] = useState(false)
  const [readiness, setReadiness] = useState(null)
  const [overrideRequest, setOverrideRequest] = useState(null)
  const [deactivationReason, setDeactivationReason] = useState("")
  const [decisionReason, setDecisionReason] = useState("")
  const [checkingReadiness, setCheckingReadiness] = useState(false)
  const [overrideAction, setOverrideAction] = useState("")
  const [deactivationError, setDeactivationError] = useState("")
  const isEditing = Boolean(form.id)
  const isDeactivating = Boolean(
    isEditing && initialValue?.is_active && !form.is_active,
  )

  const loadDeactivationState = useCallback(async (force = false) => {
    if (!force && !isDeactivating) {
      setReadiness(null)
      setOverrideRequest(null)
      setDeactivationError("")
      return
    }
    setCheckingReadiness(true)
    setDeactivationError("")
    try {
      const [nextReadiness, requests] = await Promise.all([
        getStaffDeactivationReadiness(type, form.id),
        getStaffDeactivationOverrides(type, form.id),
      ])
      setReadiness(nextReadiness)
      setOverrideRequest(
        requests.find((request) =>
          ["pending", "approved"].includes(request.status),
        ) || null,
      )
    } catch (requestError) {
      setDeactivationError(
        getErrorMessage(requestError, "Unable to check deactivation readiness"),
      )
    } finally {
      setCheckingReadiness(false)
    }
  }, [form.id, isDeactivating, type])

  const change = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const displayName = form.name.trim()
    if (displayName.length < 2) {
      toast.error("Name must contain at least 2 characters")
      return
    }
    if (!isValidEmail(form.email)) {
      toast.error("Enter a valid email address")
      return
    }
    if (!isValidPhone(form.phone)) {
      toast.error("Enter a valid phone number")
      return
    }
    const passwordError = validatePassword(form.password, !isEditing)
    if (passwordError) {
      toast.error(passwordError)
      return
    }
    if (isDeactivating) {
      if (checkingReadiness || !readiness) {
        toast.error("Wait for the deactivation readiness check to finish")
        return
      }
      if (readiness.readiness_state === "hard_blocked") {
        toast.error("Close active work before deactivating this profile")
        return
      }
      if (deactivationReason.trim().length < 10) {
        toast.error("Enter a deactivation reason of at least 10 characters")
        return
      }
      if (
        readiness.readiness_state === "override_required" &&
        overrideRequest?.status !== "approved"
      ) {
        toast.error("An approved override is required for the open impacts")
        return
      }
    }

    setSaving(true)
    try {
      if (type === "therapist") {
        if (isEditing) {
          await updateTherapist(form.id, {
            username: displayName,
            email: form.email.trim(),
            is_active: form.is_active,
            password: form.password || null,
            deactivation_reason: isDeactivating
              ? deactivationReason.trim()
              : null,
            override_request_id:
              isDeactivating && overrideRequest?.status === "approved"
                ? overrideRequest.id
                : null,
          })
        } else {
          await registerUser(
            {
              username: displayName,
              email: form.email.trim(),
              password: form.password,
              role: "therapist",
            },
            localStorage.getItem("token"),
          )
        }
      } else if (isEditing) {
        await updateDoctor(form.id, {
          user_id: form.user_id,
          name: displayName,
          email: form.email.trim(),
          password: form.password || null,
          phone: form.phone.trim() || null,
          specialization: form.specialization.trim() || null,
          active: form.is_active,
          deactivation_reason: isDeactivating
            ? deactivationReason.trim()
            : null,
          override_request_id:
            isDeactivating && overrideRequest?.status === "approved"
              ? overrideRequest.id
              : null,
        })
      } else {
        const user = await createDoctorUser({
          username: displayName,
          email: form.email.trim(),
          password: form.password,
        })
        await createDoctorProfile({
          user_id: user.id,
          name: displayName,
          phone: form.phone.trim() || null,
          specialization: form.specialization.trim() || null,
        })
      }
      toast.success(`${type === "doctor" ? "Doctor" : "Therapist"} ${isEditing ? "updated" : "created"}`)
      onSaved()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to save staff profile"))
    } finally {
      setSaving(false)
    }
  }

  const requestOverride = async () => {
    if (deactivationReason.trim().length < 10) {
      toast.error("Enter a handover reason of at least 10 characters")
      return
    }
    setOverrideAction("requesting")
    try {
      const request = await requestStaffDeactivationOverride({
        staff_role: type,
        staff_id: form.id,
        reason: deactivationReason.trim(),
        evidence_refs: [],
      })
      setOverrideRequest(request)
      toast.success("Override submitted for review")
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to request override"))
      await loadDeactivationState()
    } finally {
      setOverrideAction("")
    }
  }

  const decideOverride = async (decision) => {
    if (!overrideRequest) return
    if (decisionReason.trim().length < 5) {
      toast.error("Enter a review note of at least 5 characters")
      return
    }
    setOverrideAction(decision)
    try {
      const request = await decideStaffDeactivationOverride(
        overrideRequest.id,
        {
          decision,
          reason: decisionReason.trim(),
          version: overrideRequest.version,
        },
      )
      setOverrideRequest(decision === "rejected" ? null : request)
      toast.success(
        decision === "rejected"
          ? "Override rejected; it can be corrected and requested again"
          : "Override approved",
      )
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to review override"))
      await loadDeactivationState()
    } finally {
      setOverrideAction("")
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close form" />
      <form onSubmit={submit} className="relative z-10 w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-black capitalize text-slate-900">
          {isEditing ? "Edit" : "Add"} {type}
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            Full name
            <input
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              required
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => change("email", event.target.value)}
              required
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            {isEditing ? "New password (optional)" : "Temporary password"}
            <input
              type="password"
              value={form.password}
              onChange={(event) => change("password", event.target.value)}
              required={!isEditing}
              minLength={isEditing ? undefined : 8}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal"
            />
          </label>
          {type === "doctor" && (
            <>
              <label className="text-xs font-bold text-slate-600">
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => change("phone", event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                Specialization
                <input
                  value={form.specialization}
                  onChange={(event) => change("specialization", event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal"
                />
              </label>
            </>
          )}
          {isEditing && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => {
                  const nextActive = event.target.checked
                  change("is_active", nextActive)
                  if (initialValue?.is_active && !nextActive) {
                    loadDeactivationState(true)
                  } else {
                    setReadiness(null)
                    setOverrideRequest(null)
                    setDeactivationError("")
                  }
                }}
              />
              Active profile
            </label>
          )}
          {isDeactivating && (
            <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-amber-950">Deactivation safety check</h3>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Active clinical work cannot be overridden. Other open records require a documented approval before access is removed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadDeactivationState}
                  disabled={checkingReadiness}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 disabled:opacity-50"
                >
                  {checkingReadiness ? "Checking..." : "Refresh"}
                </button>
              </div>

              {deactivationError && (
                <p role="alert" className="rounded-md bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {deactivationError}
                </p>
              )}

              {readiness && (
                <>
                  <p className="text-xs font-bold text-amber-950">
                    Status: {readiness.readiness_state.replaceAll("_", " ")}
                  </p>
                  {[...readiness.hard_blockers, ...readiness.operational_impacts].map((item) => (
                    <div key={item.code} className="rounded-md border border-amber-200 bg-white p-3">
                      <p className="text-xs font-black text-slate-900">
                        {item.code.replaceAll("_", " ")} · {item.count}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{item.message}</p>
                    </div>
                  ))}

                  {readiness.readiness_state !== "hard_blocked" && (
                    <label className="block text-xs font-bold text-slate-700">
                      Deactivation and handover reason
                      <textarea
                        value={deactivationReason}
                        onChange={(event) => setDeactivationReason(event.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Explain why access is ending and who owns any remaining follow-up."
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal"
                      />
                    </label>
                  )}

                  {readiness.readiness_state === "override_required" && !overrideRequest && (
                    <button
                      type="button"
                      onClick={requestOverride}
                      disabled={Boolean(overrideAction)}
                      className="rounded-md bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {overrideAction === "requesting" ? "Requesting..." : "Request documented override"}
                    </button>
                  )}

                  {overrideRequest && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-black text-blue-950">
                        Override #{overrideRequest.id}: {overrideRequest.status}
                      </p>
                      {overrideRequest.status === "pending" && (
                        <div className="mt-3 space-y-2">
                          <label className="block text-xs font-bold text-blue-950">
                            Reviewer note
                            <textarea
                              value={decisionReason}
                              onChange={(event) => setDecisionReason(event.target.value)}
                              rows={2}
                              maxLength={500}
                              className="mt-1.5 w-full rounded-md border border-blue-200 bg-white px-3 py-2 font-normal"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => decideOverride("approved")}
                              disabled={Boolean(overrideAction)}
                              className="rounded-md bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {overrideAction === "approved" ? "Approving..." : "Approve override"}
                            </button>
                            <button
                              type="button"
                              onClick={() => decideOverride("rejected")}
                              disabled={Boolean(overrideAction)}
                              className="rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                            >
                              {overrideAction === "rejected" ? "Rejecting..." : "Reject"}
                            </button>
                          </div>
                        </div>
                      )}
                      {overrideRequest.status === "approved" && (
                        <p className="mt-1 text-xs text-blue-800">
                          Approved for one deactivation while the reviewed conditions remain unchanged.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
            Cancel
          </button>
          <button
            disabled={
              saving ||
              checkingReadiness ||
              (isDeactivating && readiness?.readiness_state === "hard_blocked") ||
              (isDeactivating && readiness?.readiness_state === "override_required" && overrideRequest?.status !== "approved")
            }
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  )
}

function AdminStaffPage() {
  const [type, setType] = useState("therapist")
  const [therapists, setTherapists] = useState([])
  const [doctors, setDoctors] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editor, setEditor] = useState(null)

  const loadStaff = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [therapistData, doctorData] = await Promise.all([
        getTherapistsForManagement(),
        getDoctorsForManagement(),
      ])
      setTherapists(therapistData)
      setDoctors(doctorData)
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load staff"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load both staff directories when the management screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStaff()
  }, [loadStaff])

  const staff = useMemo(() => {
    const source = type === "therapist" ? therapists : doctors
    const query = search.trim().toLowerCase()
    if (!query) return source
    return source.filter((item) =>
      [item.username, item.name, item.email, item.specialization]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    )
  }, [doctors, search, therapists, type])

  const editStaff = (item) => {
    setEditor({
      id: item.id,
      user_id: item.user_id,
      name: item.username || item.name || "",
      email: item.email || "",
      password: "",
      phone: item.phone || "",
      specialization: item.specialization || "",
      is_active: item.is_active ?? item.active ?? true,
    })
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Clinical Staff</h1>
            <p className="mt-1 text-sm text-slate-500">Manage therapist and doctor access and profiles.</p>
          </div>
          <button
            type="button"
            onClick={() => setEditor(emptyForm)}
            className="rounded-md bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
          >
            Add {type}
          </button>
        </header>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1">
              {["therapist", "doctor"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  className={`rounded-md px-4 py-2 text-xs font-bold capitalize ${
                    type === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item}s ({item === "therapist" ? therapists.length : doctors.length})
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search staff"
              className="rounded-md border border-slate-300 px-3 py-2 text-xs sm:w-64"
            />
          </div>

          <PageState loading={loading} error={error} empty={!loading && !error && !staff.length} onRetry={loadStaff} />
          {!loading && !error && staff.map((item) => {
            const active = item.is_active ?? item.active
            return (
              <article key={item.id} className="flex flex-col gap-4 border-b border-slate-200 p-4 last:border-0 sm:flex-row sm:items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                  {(item.username || item.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-slate-900">{item.username || item.name}</h2>
                    <StatusBadge status={active ? "active" : "inactive"} />
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.email || "No email available"}</p>
                  {item.specialization && <p className="mt-1 text-xs font-semibold text-blue-700">{item.specialization}</p>}
                </div>
                {item.phone && <p className="text-xs text-slate-500">{item.phone}</p>}
                {type === "therapist" && (
                  <Link
                    to={`/admin/schedules?view=today&therapist_id=${item.id}`}
                    className="rounded-md border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    Today&apos;s schedules
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => editStaff(item)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  View / Edit
                </button>
              </article>
            )
          })}
        </section>
      </div>

      {editor && (
        <StaffForm
          type={type}
          initialValue={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            loadStaff()
          }}
        />
      )}
    </AdminLayout>
  )
}

export default AdminStaffPage
