import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import { getScheduleFormOptions } from "../services/adminOperationsService"
import {
  cancelDoctorTask,
  createDoctorTask,
  createPlace,
  fetchTaskProofBlob,
  getManagedDoctorTasks,
  getPlaces,
  setPlaceActive,
} from "../services/doctorTaskService"
import { getErrorMessage } from "../services/http"

const TYPE_LABELS = {
  clinic_training: "Clinic training",
  patient_visit: "Patient visit",
  other: "Other work",
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
const labelClass = "block text-xs font-bold uppercase tracking-wide text-slate-500"

const today = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

const emptyTaskForm = () => ({
  task_type: "clinic_training",
  doctor_id: "",
  title: "",
  scheduled_date: today(),
  place_id: "",
  notes: "",
  patient_name: "",
  patient_phone: "",
  patient_address: "",
  visit_time: "",
})

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "—"

function TaskForm({ doctors, places, onCreated }) {
  const [form, setForm] = useState(emptyTaskForm)
  const [saving, setSaving] = useState(false)
  const isVisit = form.task_type === "patient_visit"
  const change = (name) => (event) =>
    setForm((current) => ({ ...current, [name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    if (!form.doctor_id) return toast.error("Select a doctor")
    if (isVisit) {
      if (!form.patient_name.trim() || !form.patient_phone.trim() || !form.patient_address.trim()) {
        return toast.error("Enter the patient's name, phone and address")
      }
      if (!form.visit_time) return toast.error("Enter the visit time")
    } else if (!form.place_id) {
      return toast.error("Select a place (add one under Places if needed)")
    }

    try {
      setSaving(true)
      await createDoctorTask({
        task_type: form.task_type,
        doctor_id: Number(form.doctor_id),
        title: form.title.trim(),
        scheduled_date: form.scheduled_date,
        notes: form.notes.trim() || null,
        place_id: isVisit ? null : Number(form.place_id),
        patient_name: isVisit ? form.patient_name.trim() : null,
        patient_phone: isVisit ? form.patient_phone.trim() : null,
        patient_address: isVisit ? form.patient_address.trim() : null,
        visit_time: isVisit ? `${form.visit_time}:00` : null,
      })
      toast.success("Task assigned")
      setForm(emptyTaskForm())
      onCreated()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to assign the task"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Assign a task</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Task type
          <select value={form.task_type} onChange={change("task_type")} className={`${inputClass} mt-1`}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Doctor
          <select value={form.doctor_id} onChange={change("doctor_id")} className={`${inputClass} mt-1`} required>
            <option value="">Select doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Title
          <input
            value={form.title}
            onChange={change("title")}
            minLength={3}
            required
            placeholder="e.g. Train clinic doctors on stroke rehab"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className={labelClass}>
          Date
          <input type="date" min={today()} value={form.scheduled_date} onChange={change("scheduled_date")} className={`${inputClass} mt-1`} required />
        </label>
        {isVisit ? (
          <label className={labelClass}>
            Visit time
            <input type="time" value={form.visit_time} onChange={change("visit_time")} className={`${inputClass} mt-1`} />
          </label>
        ) : (
          <label className={labelClass}>
            Place
            <select value={form.place_id} onChange={change("place_id")} className={`${inputClass} mt-1`}>
              <option value="">Select place</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>{place.name}</option>
              ))}
            </select>
          </label>
        )}
        {isVisit && (
          <>
            <label className={labelClass}>
              Patient name
              <input value={form.patient_name} onChange={change("patient_name")} className={`${inputClass} mt-1`} />
            </label>
            <label className={labelClass}>
              Patient phone
              <input value={form.patient_phone} onChange={change("patient_phone")} maxLength={20} className={`${inputClass} mt-1`} />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Patient address
              <textarea rows={2} value={form.patient_address} onChange={change("patient_address")} className={`${inputClass} mt-1`} />
            </label>
          </>
        )}
        <label className={`${labelClass} md:col-span-2`}>
          Notes
          <textarea rows={2} value={form.notes} onChange={change("notes")} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? "Assigning..." : "Assign task"}
      </button>
    </form>
  )
}

function TasksSection({ doctors, places }) {
  const [tasks, setTasks] = useState([])
  const [date, setDate] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    getManagedDoctorTasks(date ? { scheduled_date: date } : undefined)
      .then((loaded) => {
        if (cancelled) return
        setError("")
        setTasks(loaded)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, "Unable to load tasks"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, reloadKey])

  const changeDate = (value) => {
    setLoading(true)
    setDate(value)
  }

  const handleCancel = async (task) => {
    const reason = window.prompt(`Reason for cancelling "${task.title}" (min 5 characters)`)
    if (reason === null) return
    if (reason.trim().length < 5) {
      toast.error("Enter at least 5 characters")
      return
    }
    try {
      await cancelDoctorTask(task.id, reason.trim())
      toast.success("Task cancelled")
      reload()
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "Unable to cancel the task"))
    }
  }

  const viewProof = async (task) => {
    try {
      const blob = await fetchTaskProofBlob(task.id)
      window.open(URL.createObjectURL(blob), "_blank", "noopener")
    } catch (proofError) {
      toast.error(getErrorMessage(proofError, "Unable to open the proof"))
    }
  }

  return (
    <div className="space-y-5">
      <TaskForm doctors={doctors} places={places} onCreated={reload} />

      <div className="flex items-end gap-3">
        <label className={labelClass}>
          Filter by date
          <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {date && (
          <button type="button" onClick={() => changeDate("")} className="pb-2.5 text-sm font-semibold text-blue-700">
            Clear
          </button>
        )}
      </div>

      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && tasks.length === 0}
        onRetry={() => {
          setLoading(true)
          reload()
        }}
        emptyTitle="No tasks"
        emptyText="Assigned tasks appear here."
      />

      {!loading && !error && tasks.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-100 bg-slate-50/80">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Where</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">{TYPE_LABELS[task.task_type]}</p>
                  </td>
                  <td className="px-4 py-3">{task.doctor_name || `#${task.doctor_id}`}</td>
                  <td className="px-4 py-3">{formatDate(task.scheduled_date)}</td>
                  <td className="px-4 py-3">{task.place?.name || task.patient_name || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    {task.has_proof && (
                      <button type="button" onClick={() => viewProof(task)} className="text-xs font-bold text-blue-700">
                        View proof
                      </button>
                    )}
                    {task.status === "assigned" && (
                      <button type="button" onClick={() => handleCancel(task)} className="text-xs font-bold text-rose-700">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PlacesSection({ places, onChanged }) {
  const [form, setForm] = useState({ name: "", address: "", place_type: "clinic", radius_m: "" })
  const [saving, setSaving] = useState(false)
  const change = (name) => (event) =>
    setForm((current) => ({ ...current, [name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const radius = form.radius_m.trim() ? Number(form.radius_m) : null
    if (radius !== null && !(radius >= 25 && radius <= 5000)) {
      toast.error("Radius must be between 25 and 5000 metres")
      return
    }
    try {
      setSaving(true)
      await createPlace({
        name: form.name.trim(),
        address: form.address.trim(),
        place_type: form.place_type,
        radius_m: radius,
      })
      toast.success("Place saved")
      setForm({ name: "", address: "", place_type: "clinic", radius_m: "" })
      onChanged()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to save the place"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (place) => {
    if (!window.confirm(`Remove ${place.name}? Existing tasks keep it; new tasks cannot use it.`)) return
    try {
      await setPlaceActive(place.id, false)
      onChanged()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to remove the place"))
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Add a place</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Name
            <input value={form.name} onChange={change("name")} minLength={2} required className={`${inputClass} mt-1`} />
          </label>
          <label className={labelClass}>
            Type
            <select value={form.place_type} onChange={change("place_type")} className={`${inputClass} mt-1`}>
              <option value="clinic">Clinic</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Address (located on the map automatically)
            <textarea rows={2} value={form.address} onChange={change("address")} minLength={3} required className={`${inputClass} mt-1`} />
          </label>
          <label className={labelClass}>
            Allowed radius in metres (optional)
            <input type="number" min="25" max="5000" value={form.radius_m} onChange={change("radius_m")} placeholder="Standard radius" className={`${inputClass} mt-1`} />
          </label>
        </div>
        <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? "Saving..." : "Save place"}
        </button>
      </form>

      <PageState
        empty={places.length === 0}
        emptyTitle="No places yet"
        emptyText="Saved places appear here and in the task form."
      />
      <div className="space-y-3">
        {places.map((place) => (
          <div key={place.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div>
              <p className="font-semibold text-slate-900">{place.name}</p>
              <p className="text-xs text-slate-500">{place.address}</p>
              <p className="text-xs text-slate-500">
                Radius {place.radius_m ? `${Math.round(place.radius_m)} m` : "standard"}
              </p>
            </div>
            <button type="button" onClick={() => remove(place)} className="text-xs font-bold text-rose-700">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminDoctorTasksPage() {
  const [tab, setTab] = useState("tasks")
  const [doctors, setDoctors] = useState([])
  const [places, setPlaces] = useState([])

  const [placesKey, setPlacesKey] = useState(0)
  const loadPlaces = useCallback(() => setPlacesKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    getPlaces()
      .then((loaded) => {
        if (!cancelled) setPlaces(loaded)
      })
      .catch((error) => toast.error(getErrorMessage(error, "Unable to load places")))
    return () => {
      cancelled = true
    }
  }, [placesKey])

  useEffect(() => {
    getScheduleFormOptions()
      .then((options) => setDoctors(options.doctors || []))
      .catch((error) => toast.error(getErrorMessage(error, "Unable to load doctors")))
  }, [])

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header>
          <h1 className="text-2xl font-black text-slate-900">Doctor Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign clinic training, patient visits and other work, and manage the places doctors visit.
          </p>
        </header>

        <div className="flex gap-2">
          {[
            ["tasks", "Tasks"],
            ["places", "Places"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "tasks" ? (
          <TasksSection doctors={doctors} places={places} />
        ) : (
          <PlacesSection places={places} onChanged={loadPlaces} />
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminDoctorTasksPage
