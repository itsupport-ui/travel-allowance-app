import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import PageState from "../components/ui/PageState"
import { getAdminSummary } from "../services/adminDashboardService"

const toneClasses = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  slate: "border-slate-200 bg-slate-100 text-slate-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
}

function AdminDashboard() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const token = localStorage.getItem("token")
      const adminSummary = await getAdminSummary(token)
      setSummary(adminSummary)
    } catch {
      setError("Failed to load dashboard metrics")
      toast.error("Failed to load dashboard metrics")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load the dashboard aggregates on entry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard()
  }, [loadDashboard])

  const metrics = useMemo(
    () => [
      {
        label: "Scheduled today",
        value: summary?.todays_schedules || 0,
        route: "/admin/schedules?view=today",
        tone: "blue",
      },
      {
        label: "Completed today",
        value: summary?.completed_treatments || 0,
        route: "/admin/schedules?view=completed",
        tone: "green",
      },
      {
        label: "Missed schedules",
        value: summary?.missed_clinical_activities || 0,
        route: "/admin/schedule/missed",
        tone: "rose",
      },
      {
        label: "Open follow-ups",
        value: summary?.open_follow_ups || 0,
        route: "/admin/follow-ups",
        tone: "slate",
      },
      {
        label: "Pending claims",
        value: summary?.pending_claims || 0,
        route: "/admin/reports",
        tone: "amber",
      },
      {
        label: "Approved claims",
        value: summary?.approved_claims || 0,
        route: "/admin/reports",
        tone: "green",
      },
      {
        label: "Active clinical staff",
        value: summary?.total_clinical_staff || 0,
        route: "/admin/staff",
        tone: "blue",
      },
      {
        label: "Today's claims",
        value: summary?.todays_claims || 0,
        route: "/admin/reports",
        tone: "violet",
      },
    ],
    [summary],
  )

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review clinical workload, staffing, and reimbursement activity.
          </p>
        </header>

        <PageState loading={loading} error={error} onRetry={loadDashboard} />

        {!loading && !error && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((metric) => (
              <Link
                key={metric.label}
                to={metric.route}
                className={`group min-h-28 rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
                  toneClasses[metric.tone]
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70 sm:text-xs">
                  {metric.label}
                </p>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-3xl font-black sm:text-4xl">{metric.value}</p>
                  <span className="text-xs font-bold opacity-0 transition group-hover:opacity-70">
                    View
                  </span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminDashboard
