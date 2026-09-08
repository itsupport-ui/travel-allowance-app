import { useCallback, useEffect, useState } from "react"
import {
  FaCalendarCheck,
  FaChartLine,
  FaClipboardList,
  FaClock,
  FaFileDownload,
  FaHourglassHalf,
  FaRoad,
  FaRupeeSign,
  FaUserCheck,
  FaUserFriends,
} from "react-icons/fa"
import AdminLayout from "../layouts/AdminLayout"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import {
  getAdminReportOverview,
  getScheduleFormOptions,
  downloadClaimSnapshot,
  previewClaimRegister,
} from "../services/adminOperationsService"
import { getErrorMessage } from "../services/http"
import {
  getReportExportEvents,
  getReportExportHistory,
  getReportOperationsHealth,
} from "../services/reportCenterService"
import LocationExceptionReviewPanel from "../components/admin/LocationExceptionReviewPanel"
import EarlyWorkdayReviewPanel from "../components/admin/EarlyWorkdayReviewPanel"
import ManualTravelReviewPanel from "../components/admin/ManualTravelReviewPanel"
import ManualDoctorExpenseReviewPanel from "../components/admin/ManualDoctorExpenseReviewPanel"

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
})

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "export", label: "Export Center" },
  { id: "review", label: "Review Queue" },
]

const REPORT_TYPE_LABELS = {
  consolidated_claims: "Claims",
  organization_attendance: "Attendance",
  organization_expenses: "Travel & expenses",
  organization_clinical_activity: "Clinical activity",
  organization_performance: "Performance summary",
  organization_exceptions: "Exceptions",
}

const REPORT_TYPE_ROW_NOUNS = {
  consolidated_claims: "claim",
  organization_attendance: "workday",
  organization_expenses: "entry",
  organization_clinical_activity: "activity",
  organization_performance: "staff member",
  organization_exceptions: "exception",
}

function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
    therapist_id: "",
    status: "all",
  })
  const [therapists, setTherapists] = useState([])
  const [doctors, setDoctors] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [exportRole, setExportRole] = useState("all")
  const [exportStaffId, setExportStaffId] = useState("")
  const [exportReportType, setExportReportType] = useState("consolidated_claims")
  const [exportStatus, setExportStatus] = useState("all")
  const [exporting, setExporting] = useState("")
  const [exportPreview, setExportPreview] = useState(null)
  const [exportError, setExportError] = useState("")
  const [exportHistory, setExportHistory] = useState([])
  const [exportFailures, setExportFailures] = useState([])
  const [operationsHealth, setOperationsHealth] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadExportHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const token = localStorage.getItem("token")
      const [historyResult, eventsResult, healthResult] = await Promise.allSettled([
        getReportExportHistory(token, "organization", 8),
        getReportExportEvents(token, "organization", 20),
        getReportOperationsHealth(token),
      ])
      setExportHistory(historyResult.status === "fulfilled" ? historyResult.value : [])
      setExportFailures(
        eventsResult.status === "fulfilled"
          ? eventsResult.value.filter((item) => item.outcome === "failure")
          : [],
      )
      setOperationsHealth(
        healthResult.status === "fulfilled" ? healthResult.value : null,
      )
    } catch {
      setExportHistory([])
      setExportFailures([])
      setOperationsHealth(null)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    getScheduleFormOptions()
      .then((result) => {
        setTherapists(result.therapists || [])
        setDoctors(result.doctors || [])
      })
      .catch(() => {
        setTherapists([])
        setDoctors([])
      })
  }, [])

  useEffect(() => {
    // Initial synchronization with server-owned organization export history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExportHistory()
  }, [loadExportHistory])

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
    setExportPreview(null)
    setExportError("")
  }

  const exportParams = () => ({
    from_date: filters.from_date || undefined,
    to_date: filters.to_date || undefined,
    status: exportStatus,
    report_type: exportReportType,
    role: exportRole,
    therapist_id:
      exportRole === "therapist" && exportStaffId
        ? exportStaffId
        : undefined,
    doctor_id:
      exportRole === "doctor" && exportStaffId
        ? exportStaffId
        : undefined,
  })

  const previewExport = async () => {
    setExporting("preview")
    setExportError("")
    try {
      setExportPreview(await previewClaimRegister(exportParams()))
    } catch (requestError) {
      setExportError(getErrorMessage(requestError, "Failed to preview report"))
    } finally {
      setExporting("")
    }
  }

  const downloadExport = async (
    format,
    snapshotId = exportPreview?.snapshot_id,
  ) => {
    if (!snapshotId) return
    setExporting(format)
    setExportError("")
    try {
      const response = await downloadClaimSnapshot(
        snapshotId,
        format,
      )
      const disposition = response.headers["content-disposition"] || ""
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
        `organization-report.${format}`
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      await loadExportHistory()
    } catch (requestError) {
      setExportError(getErrorMessage(requestError, `Failed to download ${format.toUpperCase()} report`))
    } finally {
      setExporting("")
    }
  }

  const kpis = data?.kpis || {}
  const maxTrendValue = Math.max(
    1,
    ...(data?.trends || []).map((point) => point.completed_treatments),
  )

  const kpiCards = [
    { label: "Today's treatments", value: kpis.todays_treatments, icon: FaCalendarCheck },
    { label: "Completed", value: kpis.completed_treatments, icon: FaClipboardList },
    { label: "Patients visited", value: kpis.patients_visited, icon: FaUserFriends },
    { label: "Active therapists", value: kpis.active_therapists, icon: FaUserCheck },
    { label: "Total claims", value: kpis.total_claims, icon: FaFileDownload },
    { label: "Pending claims", value: kpis.pending_claims, icon: FaHourglassHalf },
    { label: "Total distance", value: `${kpis.total_km || 0} km`, icon: FaRoad },
    { label: "Travel amount", value: money.format(kpis.total_travel_amount || 0), icon: FaRupeeSign },
  ]

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Operational Reports</h1>
            <p className="mt-1 text-sm text-slate-500">
              Treatment, travel, and reimbursement performance in one view.
            </p>
          </div>
          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm print:hidden">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {activeTab === "overview" && (
          <div className="space-y-6">
            <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
              <label className="text-xs font-bold text-slate-500">
                From date
                <input
                  type="date"
                  value={filters.from_date}
                  onChange={(event) => setFilter("from_date", event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-normal text-slate-800"
                  aria-label="Report from date"
                />
              </label>
              <label className="text-xs font-bold text-slate-500">
                To date
                <input
                  type="date"
                  value={filters.to_date}
                  onChange={(event) => setFilter("to_date", event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-normal text-slate-800"
                  aria-label="Report to date"
                />
              </label>
              <label className="text-xs font-bold text-slate-500">
                Therapist
                <select
                  value={filters.therapist_id}
                  onChange={(event) => setFilter("therapist_id", event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-normal text-slate-800"
                  aria-label="Report therapist"
                >
                  <option value="">All therapists</option>
                  {therapists.map((therapist) => (
                    <option key={therapist.id} value={therapist.id}>{therapist.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">
                Claim status
                <select
                  value={filters.status}
                  onChange={(event) => setFilter("status", event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-normal text-slate-800"
                  aria-label="Report claim status"
                >
                  <option value="all">All claim statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setFilters({ from_date: "", to_date: "", therapist_id: "", status: "all" })
                  setExportPreview(null)
                  setExportError("")
                }}
                className="self-end rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
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
                  {kpiCards.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                        <Icon className="text-sm text-blue-400" aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </section>

                <section className="grid gap-5 xl:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                    <div className="flex items-center gap-2">
                      <FaChartLine className="text-blue-500" aria-hidden="true" />
                      <h2 className="text-sm font-bold text-slate-900">Completed treatment trend</h2>
                    </div>
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
        )}

        {activeTab === "export" && (
          <div className="space-y-6">
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-xs text-blue-900 print:hidden">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {REPORT_TYPE_LABELS[exportReportType]} register
                </p>
                <p className="mt-1 text-blue-700">
                  Server-generated PDF, Excel, and CSV files use one filtered snapshot and exclude patient identity and precise locations.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                  Report type
                  <select
                    value={exportReportType}
                    onChange={(event) => {
                      setExportReportType(event.target.value)
                      setExportStatus("all")
                      setExportPreview(null)
                      setExportError("")
                    }}
                    aria-label="Organization report type"
                    className="mt-1 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-normal normal-case text-slate-800"
                  >
                    <option value="consolidated_claims">Claims</option>
                    <option value="organization_attendance">Attendance</option>
                    <option value="organization_expenses">Travel &amp; expenses</option>
                    <option value="organization_clinical_activity">Clinical activity</option>
                    <option value="organization_performance">Performance summary</option>
                    <option value="organization_exceptions">Exceptions</option>
                  </select>
                </label>
                <label className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                  Staff role
                  <select
                    value={exportRole}
                    onChange={(event) => {
                      setExportRole(event.target.value)
                      setExportStaffId("")
                      setExportPreview(null)
                      setExportError("")
                    }}
                    aria-label="Report staff role"
                    className="mt-1 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-normal normal-case text-slate-800"
                  >
                    <option value="all">Doctors and therapists</option>
                    <option value="therapist">Therapists only</option>
                    <option value="doctor">Doctors only</option>
                  </select>
                </label>
                <label className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                  Staff member
                  <select
                    value={exportStaffId}
                    onChange={(event) => {
                      setExportStaffId(event.target.value)
                      setExportPreview(null)
                      setExportError("")
                    }}
                    disabled={exportRole === "all"}
                    aria-label="Report staff member"
                    className="mt-1 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-normal normal-case text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {exportRole === "doctor"
                        ? "All doctors"
                        : exportRole === "therapist"
                          ? "All therapists"
                          : "Choose a role first"}
                    </option>
                    {(exportRole === "doctor" ? doctors : therapists).map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name || staff.username}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                  Status
                  <select
                    value={exportStatus}
                    onChange={(event) => {
                      setExportStatus(event.target.value)
                      setExportPreview(null)
                      setExportError("")
                    }}
                    aria-label="Report status"
                    disabled={exportReportType === "organization_performance"}
                    className="mt-1 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-normal normal-case text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All statuses</option>
                    {exportReportType === "consolidated_claims" ? (
                      <>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </>
                    ) : exportReportType === "organization_attendance" ? (
                      <>
                        <option value="active">Active</option>
                        <option value="completed">Completed normally</option>
                        <option value="ended_early">Ended early</option>
                      </>
                    ) : exportReportType === "organization_expenses" ? (
                      <>
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                      </>
                    ) : exportReportType === "organization_clinical_activity" ? (
                      <>
                        <option value="scheduled">Scheduled</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                        <option value="missed">Missed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="pending">Pending plan</option>
                        <option value="submitted">Submitted plan</option>
                        <option value="approved">Approved plan</option>
                        <option value="rejected">Rejected plan</option>
                      </>
                    ) : exportReportType === "organization_performance" ? null : (
                      <>
                        <option value="open">Open</option>
                        <option value="needs_review">Needs review</option>
                        <option value="needs_correction">Needs correction</option>
                        <option value="missed">Missed</option>
                        <option value="manual">Manual entry</option>
                      </>
                    )}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-blue-200 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                  1. Preview, then download
                </p>
                <button
                  type="button"
                  onClick={previewExport}
                  disabled={Boolean(exporting)}
                  className="rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {exporting === "preview" ? "Previewing..." : "Preview export"}
                </button>
                {[
                  ["pdf", "PDF"],
                  ["xlsx", "Excel"],
                  ["csv", "CSV"],
                ].map(([format, label]) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => downloadExport(format)}
                    disabled={Boolean(exporting) || !exportPreview?.row_count}
                    title={!exportPreview?.row_count ? "Preview the export first to enable downloads" : undefined}
                    className={format === "pdf"
                      ? "rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                      : "rounded-md border border-blue-300 bg-white px-4 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 disabled:opacity-50"}
                  >
                    {exporting === format ? "Generating..." : `Download ${label}`}
                  </button>
                ))}
                {!exportPreview?.row_count && !exportError && (
                  <span className="text-[11px] text-blue-700">Preview to enable downloads.</span>
                )}
              </div>

              {exportPreview && (
                <p className="mt-3" role="status">
                  {exportPreview.row_count} {REPORT_TYPE_ROW_NOUNS[exportReportType]}{exportPreview.row_count === 1 ? "" : "s"}
                  {exportReportType === "organization_performance"
                    ? ` · ${exportPreview.summary?.total_workdays || 0} workdays · ${exportPreview.summary?.completed_clinical_activities || 0} completed activities · ${money.format(exportPreview.summary?.total_reimbursable_amount || 0)} reimbursable`
                    : exportReportType === "consolidated_claims" || exportReportType === "organization_expenses"
                    ? ` · ${money.format(exportPreview.total_amount)}`
                    : exportReportType === "organization_attendance"
                      ? ` · ${exportPreview.summary?.total_work_minutes || 0} worked minutes`
                      : exportReportType === "organization_clinical_activity"
                        ? ` · ${exportPreview.summary?.total_clinical_minutes || 0} clinical minutes`
                        : ` · ${exportPreview.summary?.overdue_exceptions || 0} overdue`}.
                  Downloads use this exact snapshot until {new Date(exportPreview.expires_at).toLocaleString()}.
                </p>
              )}
              {exportError && (
                <p className="mt-3 font-semibold text-red-700" role="alert">{exportError}</p>
              )}
            </section>

            {operationsHealth && (
              <section
                className={`rounded-lg border p-4 ${operationsHealth.status === "healthy" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
                aria-label="Export operations health"
                role="region"
              >
                <div className="flex items-center gap-2">
                  <FaClock aria-hidden="true" />
                  <p className="text-sm font-bold">
                    Export operations: {operationsHealth.status}
                  </p>
                </div>
                <p className="mt-1 text-xs">
                  {operationsHealth.queued_jobs} queued · {operationsHealth.processing_jobs} processing · {operationsHealth.stale_processing_jobs} stale · {operationsHealth.failed_jobs_last_24h} failed in 24h · {operationsHealth.expired_artifacts_pending_cleanup} awaiting cleanup · storage {operationsHealth.storage_backend.toUpperCase()}
                  {operationsHealth.external_storage_configured ? " configured" : " needs configuration"}.
                </p>
              </section>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-900">Recent organization exports</p>
              {historyLoading ? (
                <p className="mt-2 text-xs text-slate-500" role="status">
                  Loading export history...
                </p>
              ) : exportHistory.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Generated organization reports will appear here.
                </p>
              ) : (
                <ul className="mt-3 grid gap-2 lg:grid-cols-2">
                  {exportHistory.map((item) => {
                    const expired = new Date(item.snapshot_expires_at) <= new Date()
                    return (
                      <li
                        className="rounded-md border border-slate-200 bg-slate-50 p-3"
                        key={item.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {REPORT_TYPE_LABELS[item.report_type] || "Claims"} · {item.format.toUpperCase()} · {item.row_count} row{item.row_count === 1 ? "" : "s"}
                              {item.report_type === "consolidated_claims" || item.report_type === "organization_expenses" || item.report_type === "organization_performance" ? ` · ${money.format(item.total_amount)}` : ""}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {item.requester_name} · {new Date(item.last_downloaded_at).toLocaleString()} · {item.download_count} download{item.download_count === 1 ? "" : "s"}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-slate-400" title={item.checksum_sha256}>
                              SHA-256 {item.checksum_sha256.slice(0, 12)}…
                            </p>
                          </div>
                          <button
                            className="shrink-0 rounded-md border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={Boolean(exporting) || expired}
                            onClick={() => downloadExport(item.format, item.snapshot_id)}
                            type="button"
                          >
                            {expired ? "Expired" : "Download again"}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {exportFailures.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-950">Recent export issues</p>
                  <ul className="mt-2 space-y-2">
                    {exportFailures.slice(0, 5).map((item) => (
                      <li className="text-[11px] text-amber-900" key={item.id}>
                        {item.requester_name} · {item.event_type.replaceAll("_", " ")} · {(item.error_code || "unknown error").replaceAll("_", " ")} · {new Date(item.occurred_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "review" && (
          <div className="space-y-6">
            <LocationExceptionReviewPanel />
            <EarlyWorkdayReviewPanel />
            <ManualTravelReviewPanel />
            <ManualDoctorExpenseReviewPanel />
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminReportsPage
