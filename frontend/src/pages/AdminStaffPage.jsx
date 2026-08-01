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
  getDoctorsForManagement,
  getTherapistsForManagement,
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
  const isEditing = Boolean(form.id)

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

    setSaving(true)
    try {
      if (type === "therapist") {
        if (isEditing) {
          await updateTherapist(form.id, {
            username: displayName,
            email: form.email.trim(),
            is_active: form.is_active,
            password: form.password || null,
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
                onChange={(event) => change("is_active", event.target.checked)}
              />
              Active profile
            </label>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
            Cancel
          </button>
          <button disabled={saving} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
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
