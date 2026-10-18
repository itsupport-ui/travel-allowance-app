import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"

import DoctorLayout from "../layouts/DoctorLayout"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import {
  getMyDoctorTasks,
  punchInDoctorTask,
  punchOutDoctorTask,
} from "../services/doctorTaskService"
import {
  getMyLocationExceptions,
  requestLocationException,
} from "../services/locationExceptionService"
import { getErrorMessage } from "../services/http"

const SCOPES = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "history", label: "History" },
]

const TYPE_LABELS = {
  clinic_training: "Clinic training",
  patient_visit: "Patient visit",
  other: "Other work",
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const captureLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported by this browser"))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "—"

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—"

const coordinatesFrom = (position) => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  gps_accuracy_m: Math.max(position.coords.accuracy || 1, 1),
  device_timestamp: new Date(position.timestamp).toISOString(),
})

function TaskCard({ task, exceptions, onChanged }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [notes, setNotes] = useState("")
  const [exceptionReason, setExceptionReason] = useState("")
  const [showException, setShowException] = useState(false)

  const action = task.can_punch_in ? "punch_in" : "punch_out"
  const active = task.can_punch_in || task.can_punch_out
  const exception = exceptions.find(
    (request) =>
      request.target_type === "doctor_task" &&
      request.target_id === task.id &&
      request.action === action &&
      ["pending", "approved"].includes(request.status),
  )
  const approvedExceptionId = exception?.status === "approved" ? exception.id : null

  const run = async (work, successMessage, failureMessage) => {
    try {
      setBusy(true)
      await work()
      toast.success(successMessage)
      await onChanged()
    } catch (error) {
      toast.error(getErrorMessage(error, failureMessage))
    } finally {
      setBusy(false)
    }
  }

  const handlePunchIn = () => {
    if (!window.confirm(`Punch in for "${task.title}"?`)) return
    run(
      async () => {
        const position = await captureLocation()
        await punchInDoctorTask(task.id, {
          ...coordinatesFrom(position),
          location_exception_id: approvedExceptionId,
        })
      },
      "Task started",
      "Unable to punch in",
    )
  }

  const handlePunchOut = () => {
    if (!photo) {
      toast.error("Add a proof photo before punching out")
      return
    }
    if (!window.confirm("Punch out and complete this task?")) return
    run(
      async () => {
        const position = await captureLocation()
        await punchOutDoctorTask(
          task.id,
          {
            ...coordinatesFrom(position),
            location_exception_id: approvedExceptionId,
            notes: notes.trim(),
          },
          photo,
        )
        setPhoto(null)
        setNotes("")
      },
      "Task completed",
      "Unable to punch out",
    )
  }

  const handleException = (event) => {
    event.preventDefault()
    if (exceptionReason.trim().length < 10) {
      toast.error("Explain the GPS issue in at least 10 characters")
      return
    }
    run(
      async () => {
        const position = await captureLocation()
        const { gps_accuracy_m, device_timestamp, ...rest } = coordinatesFrom(position)
        await requestLocationException(
          {
            target_type: "doctor_task",
            target_id: task.id,
            action,
            reason: exceptionReason.trim(),
            gps_accuracy_m,
            device_timestamp,
            ...rest,
          },
          localStorage.getItem("token"),
        )
        setExceptionReason("")
        setShowException(false)
      },
      "Exception request sent for approval",
      "Unable to send the exception request",
    )
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{task.title}</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {TYPE_LABELS[task.task_type]} · {formatDate(task.scheduled_date)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {task.place
              ? `${task.place.name} — ${task.place.address}`
              : [task.patient_name, task.patient_address].filter(Boolean).join(" — ")}
          </p>
          {task.notes && <p className="mt-2 text-sm text-slate-600">{task.notes}</p>}
        </div>
        <StatusBadge status={task.status} />
      </div>

      {(task.punch_in_time || task.punch_out_time) && (
        <p className="mt-3 text-xs text-slate-500">
          In {formatTime(task.punch_in_time)} · Out {formatTime(task.punch_out_time)}
          {task.status === "completed" && task.has_proof && " · Proof submitted"}
        </p>
      )}

      {task.punch_via_visit && task.status !== "cancelled" && (
        <button
          type="button"
          onClick={() => navigate("/doctor/visits")}
          className="mt-4 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          Open in Visits
        </button>
      )}

      {active && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {task.can_punch_out && (
            <>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Proof photo
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm"
                />
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes about the completed work"
                className={inputClass}
              />
            </>
          )}

          {exception?.status === "pending" && (
            <p className="text-xs font-medium text-amber-700">
              Your GPS exception request is waiting for approval.
            </p>
          )}
          {approvedExceptionId && (
            <p className="text-xs font-medium text-emerald-700">
              A one-time GPS exception is approved and will be used on your next punch.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (task.can_punch_out && !photo)}
              onClick={task.can_punch_in ? handlePunchIn : handlePunchOut}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Working..." : task.can_punch_in ? "Punch In" : "Punch Out"}
            </button>
            {!exception && (
              <button
                type="button"
                onClick={() => setShowException((value) => !value)}
                className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50"
              >
                Trouble with GPS?
              </button>
            )}
          </div>

          {showException && !exception && (
            <form onSubmit={handleException} className="space-y-2 rounded-xl bg-amber-50 p-3">
              <textarea
                rows={2}
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
                placeholder="Explain why the normal GPS check cannot be completed"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Request GPS exception
              </button>
            </form>
          )}
        </div>
      )}

      {task.status === "assigned" && !task.can_punch_in && !task.punch_via_visit && (
        <p className="mt-3 text-xs text-slate-500">Punch In is available on the task date.</p>
      )}
    </div>
  )
}

function DoctorTasksPage() {
  const [scope, setScope] = useState("today")
  const [tasks, setTasks] = useState([])
  const [exceptions, setExceptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getMyDoctorTasks(scope),
      getMyLocationExceptions().catch(() => []),
    ])
      .then(([taskList, exceptionList]) => {
        if (cancelled) return
        setError("")
        setTasks(taskList)
        setExceptions(exceptionList)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, "Unable to load your tasks"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scope, reloadKey])

  const changeScope = (value) => {
    setLoading(true)
    setScope(value)
  }

  const heading = useMemo(() => SCOPES.find((item) => item.value === scope)?.label, [scope])

  return (
    <DoctorLayout>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <header>
          <h1 className="text-2xl font-black text-slate-900">My Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Clinic training, patient visits and other assigned work. Punch in and out at each one.
          </p>
        </header>

        <div className="flex gap-2">
          {SCOPES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => changeScope(item.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                scope === item.value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <PageState
          loading={loading}
          error={error}
          empty={!loading && !error && tasks.length === 0}
          onRetry={() => {
            setLoading(true)
            reload()
          }}
          emptyTitle={`No ${heading?.toLowerCase()} tasks`}
          emptyText="Tasks assigned to you will appear here."
        />

        {!loading && !error && (
          <div className="space-y-4">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} exceptions={exceptions} onChanged={reload} />
            ))}
          </div>
        )}
      </div>
    </DoctorLayout>
  )
}

export default DoctorTasksPage
