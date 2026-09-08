import { useState } from "react"


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"

const modeCopy = {
  cancel: {
    title: "Cancel consultation",
    description: "Keep the original appointment in history with a clear reason.",
    submit: "Cancel consultation",
  },
  follow_up: {
    title: "Schedule follow-up",
    description: "Create a linked appointment without losing the completed call.",
    submit: "Schedule follow-up",
  },
  reschedule: {
    title: "Reschedule consultation",
    description: "Cancel this appointment and create a linked replacement.",
    submit: "Create replacement",
  },
}


export function ConsultationLifecycleDialog({
  consultation,
  mode,
  busy,
  onClose,
  onSubmit,
}) {
  const copy = modeCopy[mode]
  const [form, setForm] = useState(() => ({
      cancellation_code: "patient_cancelled",
      scheduled_date:
        mode === "follow_up" ? consultation?.follow_up_date || "" : "",
      scheduled_time:
        mode === "follow_up"
          ? consultation?.follow_up_time?.slice(0, 5) || ""
          : "",
      reason:
        mode === "follow_up" ? consultation?.follow_up_reason || "" : "",
    }))

  if (!consultation || !copy) return null
  const needsSchedule = mode === "reschedule" || mode === "follow_up"

  const submit = (event) => {
    event.preventDefault()
    const payload = {
      lifecycle_version: consultation.lifecycle_version,
      reason: form.reason.trim(),
    }
    if (mode === "cancel") {
      payload.cancellation_code = form.cancellation_code
    } else {
      payload.scheduled_date = form.scheduled_date
      payload.scheduled_time = form.scheduled_time
    }
    onSubmit(payload)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-lifecycle-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2
            id="consultation-lifecycle-title"
            className="text-lg font-bold text-slate-900"
          >
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{copy.description}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">
              {consultation.patient_name}
            </p>
            <p className="mt-1 text-slate-600">
              {consultation.scheduled_date} at{" "}
              {consultation.scheduled_time?.slice(0, 5)}
            </p>
          </div>

          {mode === "cancel" && (
            <div>
              <label className={labelClass} htmlFor="cancellation-code">
                Cancellation category
              </label>
              <select
                id="cancellation-code"
                value={form.cancellation_code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    cancellation_code: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="patient_cancelled">Patient cancelled</option>
                <option value="doctor_unavailable">Doctor unavailable</option>
                <option value="duplicate">Duplicate booking</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}

          {needsSchedule && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="lifecycle-date">
                  New date
                </label>
                <input
                  id="lifecycle-date"
                  required
                  type="date"
                  value={form.scheduled_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduled_date: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lifecycle-time">
                  New time
                </label>
                <input
                  id="lifecycle-time"
                  required
                  type="time"
                  value={form.scheduled_time}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduled_time: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="lifecycle-reason">
              {mode === "follow_up" ? "Follow-up reason" : "Reason"}
            </label>
            <textarea
              id="lifecycle-reason"
              required
              minLength={mode === "follow_up" ? 3 : 5}
              rows="3"
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              className={`${inputClass} resize-none`}
              placeholder="Record enough context for the care team"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Keep current appointment
            </button>
            <button
              type="submit"
              disabled={busy || !form.reason.trim()}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                mode === "cancel"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {busy ? "Saving..." : copy.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


const eventLabels = {
  cancelled: "Appointment cancelled",
  completed: "Consultation completed",
  confirmed: "Patient decision confirmed",
  created: "Consultation scheduled",
  created_from_follow_up: "Follow-up appointment created",
  created_from_reschedule: "Replacement appointment created",
  follow_up_scheduled: "Follow-up scheduled",
  rejected: "Patient decision rejected",
  rescheduled: "Appointment rescheduled",
  visit_created: "Doctor visit created",
}


export function ConsultationTimeline({ events = [], loading = false }) {
  if (loading) {
    return <p className="text-sm text-slate-500">Loading history...</p>
  }
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No lifecycle history recorded.</p>
  }

  return (
    <ol className="space-y-3" aria-label="Consultation history">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-blue-200 pl-3">
          <p className="text-sm font-semibold text-slate-800">
            {eventLabels[event.event_type] ||
              event.event_type.replaceAll("_", " ")}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(event.created_at))}
            {event.reason ? ` · ${event.reason}` : ""}
          </p>
        </li>
      ))}
    </ol>
  )
}
