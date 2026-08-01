import { useCallback, useEffect, useState } from "react"
import AdminLayout from "../layouts/AdminLayout"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import {
  getAdminReportOverview,
  getScheduleFormOptions,
} from "../services/adminOperationsService"
import { getErrorMessage } from "../services/http"

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
})

function AdminReportsPage() {
  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
    therapist_id: "",
    status: "all",
  })
  const [therapists, setTherapists] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    getScheduleFormOptions()
      .then((result) => setTherapists(result.therapists))
      .catch(() => setTherapists([]))
  }, [])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== ""),
      )
      setData(await getAdminReportOverview(params))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to generate report"))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    // Initial and filter-driven synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReport()
  }, [loadReport])

  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const kpis = data?.kpis || {}
  const maxTrendValue = Math.max(
    1,
    ...(data?.trends || []).map((point) => point.completed_treatments),
  )

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-black text-slate-900">Operational Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Treatment, travel, and reimbursement performance in one view.
          </p>
        </header>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
          <input
            type="date"
            value={filters.from_date}
            onChange={(event) => setFilter("from_date", event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs"
            aria-label="Report from date"
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(event) => setFilter("to_date", event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs"
            aria-label="Report to date"
          />
          <select
            value={filters.therapist_id}
            onChange={(event) => setFilter("therapist_id", event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs"
            aria-label="Report therapist"
          >
            <option value="">All therapists</option>
            {therapists.map((therapist) => (
              <option key={therapist.id} value={therapist.id}>{therapist.name}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs"
            aria-label="Report claim status"
          >
            <option value="all">All claim statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            type="button"
            onClick={() => setFilters({ from_date: "", to_date: "", therapist_id: "", status: "all" })}
            className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Clear filters
          </button>
        </section>

        <PageState loading={loading} error={error} onRetry={loadReport} />

        {!loading && !error && data && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">{data.period_label}</p>
              <p className="text-[10px] text-slate-400">
                Generated {new Date(data.generated_at).toLocaleString()}
              </p>
            </div>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Today's treatments", kpis.todays_treatments],
                ["Completed", kpis.completed_treatments],
                ["Patients visited", kpis.patients_visited],
                ["Active therapists", kpis.active_therapists],
                ["Total claims", kpis.total_claims],
                ["Pending claims", kpis.pending_claims],
                ["Total distance", `${kpis.total_km || 0} km`],
                ["Travel amount", money.format(kpis.total_travel_amount || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                <h2 className="text-sm font-bold text-slate-900">Completed treatment trend</h2>
                <p className="mt-1 text-xs text-slate-500">{data.trend_period_label}</p>
                <div className="mt-6 flex h-52 items-end gap-2 overflow-x-auto">
                  {data.trends.map((point) => (
                    <div key={point.date} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[9px] font-bold text-slate-500">{point.completed_treatments}</span>
                      <div
                        className="w-full max-w-12 rounded-t bg-blue-600"
                        style={{ height: `${Math.max(4, (point.completed_treatments / maxTrendValue) * 150)}px` }}
                        title={`${point.completed_treatments} completed on ${point.date}`}
                      />
                      <span className="text-[8px] text-slate-400">{point.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Claims by status</h2>
                <div className="mt-4 space-y-3">
                  {data.claims_by_status.map((item) => (
                    <div key={item.status} className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <StatusBadge status={item.status} />
                      <span className="text-lg font-black text-slate-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <h2 className="border-b border-slate-200 p-4 text-sm font-bold text-slate-900">Top therapists</h2>
                {data.top_therapists.length ? data.top_therapists.map((item) => (
                  <div key={item.therapist_id} className="grid grid-cols-3 gap-3 border-b border-slate-100 p-4 text-xs last:border-0">
                    <span className="font-bold text-slate-800">{item.therapist_name}</span>
                    <span className="text-slate-500">{item.completed_treatments} treatments</span>
                    <span className="text-right text-slate-500">{item.total_km} km</span>
                  </div>
                )) : (
                  <p className="p-6 text-center text-xs text-slate-500">No therapist activity in this period.</p>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <h2 className="border-b border-slate-200 p-4 text-sm font-bold text-slate-900">Recent activity</h2>
                {data.recent_activity.length ? data.recent_activity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{item.description}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{item.therapist_name} · {new Date(item.occurred_at).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                )) : (
                  <p className="p-6 text-center text-xs text-slate-500">No recent activity.</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminReportsPage
