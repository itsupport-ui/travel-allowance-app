import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import toast from "react-hot-toast"
import {
  FaCalendarPlus,
  FaClock,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaSearch,
  FaUserMd,
  FaUserNurse,
} from "react-icons/fa"
import AdminLayout from "../layouts/AdminLayout"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import PageState from "../components/ui/PageState"
import Pagination from "../components/ui/Pagination"
import StatusBadge from "../components/ui/StatusBadge"
import {
  cancelAdminSchedule,
  getAdminSchedules,
  getScheduleFormOptions,
} from "../services/adminOperationsService"
import { getErrorMessage } from "../services/http"

const views = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

const ScheduleSummaryCard = memo(function ScheduleSummaryCard({
  label,
  value,
  tone,
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  }
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">{value || 0}</p>
    </div>
  )
})

const ScheduleCard = memo(function ScheduleCard({
  schedule,
  onCancel,
}) {
  const canEdit = schedule.available_actions?.includes("edit")
  const canCancel = schedule.available_actions?.includes("cancel")

  return (
    <article className="border-b border-slate-200 bg-white p-4 last:border-b-0 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-36 items-start gap-3">
          <div className="rounded-md bg-slate-900 px-3 py-2 text-center text-white">
            <div className="text-sm font-black">
              {String(schedule.start_time).slice(0, 5)}
            </div>
            <div className="text-[9px] uppercase text-slate-300">
              {schedule.occurrence_date || "Recurring"}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {schedule.patient_name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <FaMapMarkerAlt className="text-slate-400" />
              {schedule.area || "Address unavailable"}
            </p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Treatment</p>
            <p className="mt-1 font-semibold text-slate-700">{schedule.treatment_name}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
              <FaUserNurse /> Therapist
            </p>
            <p className="mt-1 font-semibold text-slate-700">{schedule.therapist_name}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
              <FaUserMd /> Doctor
            </p>
            <p className="mt-1 font-semibold text-slate-700">{schedule.doctor_name}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
              <FaClock /> Duration
            </p>
            <p className="mt-1 font-semibold text-slate-700">
              {schedule.duration_minutes} minutes
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:w-64 xl:justify-end">
          <StatusBadge status={schedule.operational_status} />
          <StatusBadge status={schedule.priority} />
          {schedule.has_conflict && (
            <span
              title="This therapist has an overlapping appointment"
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-700"
            >
              <FaExclamationTriangle /> Conflict
            </span>
          )}
          <div className="mt-1 flex w-full gap-2 xl:justify-end">
            <Link
              to={`/admin/schedule/${schedule.id}`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              View
            </Link>
            {(canEdit || canCancel) && (
              <>
                {canEdit && <>
                  <Link
                    to={`/admin/schedule/edit/${schedule.id}`}
                    className="rounded-md border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/admin/schedule/edit/${schedule.id}?reschedule=1`}
                    className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50"
                  >
                    Reschedule
                  </Link>
                </>}
                {canCancel && <button
                    type="button"
                    onClick={() => onCancel(schedule)}
                    className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                  >
                    Cancel
                  </button>}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
})

function AdminSchedulesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialView = searchParams.get("view") || "today"
  const initialTherapist = searchParams.get("therapist_id") || ""
  const [filters, setFilters] = useState({
    view: views.some((item) => item.value === initialView) ? initialView : "today",
    search: "",
    therapist_id: initialTherapist,
    doctor_id: "",
    priority: "",
    sort: "time",
    page: 1,
    page_size: 20,
  })
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [data, setData] = useState(null)
  const [options, setOptions] = useState({ doctors: [], therapists: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      350,
    )
    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    getScheduleFormOptions()
      .then(setOptions)
      .catch((requestError) => {
        toast.error(getErrorMessage(requestError, "Failed to load schedule filters"))
      })
  }, [])

  const query = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({ ...filters, search: debouncedSearch }).filter(
          ([, value]) => value !== "",
        ),
      ),
    [filters, debouncedSearch],
  )

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setData(await getAdminSchedules(query))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load schedules"))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    // Initial and filter-driven synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSchedules()
  }, [loadSchedules])

  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value, page: 1 }))
    if (name === "view" || name === "therapist_id") {
      const nextParams = new URLSearchParams(searchParams)
      if (value) nextParams.set(name, value)
      else nextParams.delete(name)
      setSearchParams(nextParams)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelAdminSchedule(cancelTarget.id)
      toast.success("Schedule cancelled")
      setCancelTarget(null)
      loadSchedules()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to cancel schedule"))
    } finally {
      setCancelling(false)
    }
  }

  const summary = data?.summary || {}

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Schedule Operations</h1>
            <p className="mt-1 text-sm text-slate-500">
              Monitor assignments, workload, timing, and appointment conflicts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin/schedule/create")}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
          >
            <FaCalendarPlus /> Create schedule
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ScheduleSummaryCard label="Today's visits" value={summary.today} tone="blue" />
          <ScheduleSummaryCard label="In progress" value={summary.in_progress} tone="green" />
          <ScheduleSummaryCard label="High priority" value={summary.high_priority_today} tone="amber" />
          <ScheduleSummaryCard label="Conflicts" value={summary.conflicts} tone="rose" />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {views.map((view) => (
                <button
                  key={view.value}
                  type="button"
                  onClick={() => setFilter("view", view.value)}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-bold ${
                    filters.view === view.value
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {view.label}
                  {view.value === "upcoming" && ` (${summary.upcoming || 0})`}
                  {view.value === "completed" && ` (${summary.completed || 0})`}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="relative md:col-span-2">
                <FaSearch className="absolute left-3 top-3 text-xs text-slate-400" />
                <span className="sr-only">Search schedules</span>
                <input
                  value={filters.search}
                  onChange={(event) => setFilter("search", event.target.value)}
                  placeholder="Search patient, treatment, area, or staff"
                  className="w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <select
                value={filters.therapist_id}
                onChange={(event) => setFilter("therapist_id", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs"
                aria-label="Filter by therapist"
              >
                <option value="">All therapists</option>
                {options.therapists.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                value={filters.doctor_id}
                onChange={(event) => setFilter("doctor_id", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs"
                aria-label="Filter by doctor"
              >
                <option value="">All doctors</option>
                {options.doctors.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                value={filters.priority}
                onChange={(event) => setFilter("priority", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs"
                aria-label="Filter by priority"
              >
                <option value="">All priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <select
                value={filters.sort}
                onChange={(event) => setFilter("sort", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs"
                aria-label="Sort schedules"
              >
                <option value="time">Time</option>
                <option value="priority">Priority</option>
                <option value="patient">Patient</option>
                <option value="therapist">Therapist</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          <PageState
            loading={loading}
            error={error}
            empty={!loading && !error && !data?.items?.length}
            onRetry={loadSchedules}
            emptyTitle="No schedules in this view"
          />
          {!loading && !error && data?.items?.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onCancel={setCancelTarget}
            />
          ))}
          {!loading && !error && data?.total_pages > 1 && (
            <div className="p-4">
              <Pagination
                page={data.page}
                totalPages={data.total_pages}
                onChange={(page) => setFilters((current) => ({ ...current, page }))}
              />
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this appointment?"
        message={
          cancelTarget
            ? `${cancelTarget.patient_name}'s appointment will be removed from the therapist's active workload.`
            : ""
        }
        confirmLabel="Cancel appointment"
        destructive
        busy={cancelling}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
      />
    </AdminLayout>
  )
}

export default AdminSchedulesPage
