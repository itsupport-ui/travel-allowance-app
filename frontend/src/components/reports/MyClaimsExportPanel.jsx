import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"

import {
  downloadMyClaimsReport,
  getReportExportHistory,
  previewMyClaimsReport,
} from "../../services/reportCenterService"

const initialFilters = { fromDate: "", toDate: "", status: "all" }
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

function MyClaimsExportPanel() {
  const [reportType, setReportType] = useState("my_claims")
  const [filters, setFilters] = useState(initialFilters)
  const [preview, setPreview] = useState(null)
  const [working, setWorking] = useState("")
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const isFinancialReport = reportType === "my_claims" || reportType === "my_expenses" || reportType === "my_performance"

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      setHistory(await getReportExportHistory(localStorage.getItem("token")))
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial synchronization with the server-owned export audit history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory()
  }, [loadHistory])

  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }))
    setPreview(null)
  }

  const previewReport = async () => {
    setWorking("preview")
    try {
      const data = await previewMyClaimsReport(
        localStorage.getItem("token"),
        filters,
        reportType,
      )
      setPreview(data)
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === "string" ? detail : "Unable to preview report")
    } finally {
      setWorking("")
    }
  }

  const download = async (format, snapshotId = preview?.snapshot_id) => {
    if (!snapshotId) {
      toast.error("Preview the report before downloading it")
      return
    }
    setWorking(format)
    try {
      const report = await downloadMyClaimsReport(
        localStorage.getItem("token"),
        { ...filters, snapshotId },
        format
      )
      const url = window.URL.createObjectURL(report.blob)
      const link = document.createElement("a")
      link.href = url
      link.download = report.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} report downloaded`)
      await loadHistory()
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === "string" ? detail : "Unable to download report")
    } finally {
      setWorking("")
    }
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-blue-950">My Reports</h2>
          <p className="mt-1 text-xs leading-5 text-blue-800">
            Preview your claims, attendance, expenses, clinical activity, or objective operational summary, then download the same server snapshot.
          </p>
        </div>
        <span className="mt-1 text-[11px] font-semibold text-blue-700">
          Asia/Kolkata{isFinancialReport ? " · INR" : ""}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-blue-950 sm:col-span-2">
          Report
          <select
            value={reportType}
            onChange={(event) => {
              setReportType(event.target.value)
              setFilters((current) => ({ ...current, status: "all" }))
              setPreview(null)
            }}
            className="mt-1 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-slate-800"
          >
            <option value="my_claims">My claim register</option>
            <option value="my_attendance">My attendance and workdays</option>
            <option value="my_expenses">My travel and expenses</option>
            <option value="my_clinical_activity">My clinical activity</option>
            <option value="my_performance">My operational summary</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-blue-950">
          From date
          <input
            type="date"
            value={filters.fromDate}
            onChange={(event) => setFilter("fromDate", event.target.value)}
            className="mt-1 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-blue-950">
          To date
          <input
            type="date"
            value={filters.toDate}
            onChange={(event) => setFilter("toDate", event.target.value)}
            className="mt-1 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-blue-950">
          {reportType === "my_claims"
            ? "Claim status"
            : reportType === "my_attendance"
              ? "Workday status"
              : reportType === "my_expenses"
                ? "Entry status"
                : reportType === "my_performance"
                  ? "Status (not applicable)"
                  : "Activity status"}
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
            disabled={reportType === "my_performance"}
            className="mt-1 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-slate-800"
          >
            <option value="all">All statuses</option>
            {reportType === "my_claims" ? (
              <>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </>
            ) : reportType === "my_attendance" ? (
              <>
                <option value="active">Active</option>
                <option value="completed">Completed normally</option>
                <option value="ended_early">Ended early</option>
              </>
            ) : reportType === "my_expenses" ? (
              <>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
              </>
            ) : reportType === "my_performance" ? null : (
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
            )}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(working)}
          onClick={previewReport}
          className="rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {working === "preview" ? "Previewing..." : "Preview"}
        </button>
        {["pdf", "xlsx", "csv"].map((format) => (
          <button
            key={format}
            type="button"
            disabled={Boolean(working) || !preview?.snapshot_id}
            onClick={() => download(format)}
            className="rounded-md border border-blue-300 bg-white px-4 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            {working === format ? "Generating..." : `Download ${format.toUpperCase()}`}
          </button>
        ))}
      </div>

      {preview && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3" role="status">
          <p className="text-sm font-bold text-slate-900">
            {preview.row_count} {reportType === "my_claims" ? "claim" : reportType === "my_attendance" ? "workday" : reportType === "my_expenses" ? "entry" : reportType === "my_performance" ? "staff summary" : "activity"}
            {preview.row_count === 1 ? "" : "s"}
            {isFinancialReport ? ` · ${money.format(preview.total_amount)}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {reportType === "my_claims"
              ? `Pending ${preview.status_counts.pending || 0} · Approved ${preview.status_counts.approved || 0} · Rejected ${preview.status_counts.rejected || 0}`
              : reportType === "my_attendance"
                ? `Active ${preview.status_counts.active || 0} · Completed ${preview.status_counts.completed || 0} · Ended early ${preview.status_counts.ended_early || 0} · Worked ${preview.summary?.total_work_minutes || 0} minutes`
                : reportType === "my_expenses"
                  ? `Draft ${preview.status_counts.draft || 0} · Submitted ${preview.status_counts.submitted || 0} · ${preview.summary?.total_distance_km || 0} km`
                  : reportType === "my_performance"
                    ? `${preview.summary?.total_workdays || 0} workdays · ${preview.summary?.total_work_minutes || 0} worked minutes · ${preview.summary?.completed_clinical_activities || 0} completed activities · ${preview.summary?.total_distance_km || 0} km`
                    : `Completed ${preview.summary?.completed_activities || 0} · In progress ${preview.summary?.in_progress_activities || 0} · ${preview.summary?.total_clinical_minutes || 0} clinical minutes`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Downloads use this exact snapshot until {new Date(preview.expires_at).toLocaleString()}.
          </p>
          {preview.warnings?.map((warning) => (
            <p key={warning} className="mt-2 text-xs font-medium text-amber-700">
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-blue-200 pt-4">
        <h3 className="text-xs font-bold text-blue-950">Recent exports</h3>
        {historyLoading ? (
          <p className="mt-2 text-xs text-blue-700" role="status">
            Loading export history...
          </p>
        ) : history.length === 0 ? (
          <p className="mt-2 text-xs text-blue-700">
            Generated reports will appear here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((item) => {
              const expired = new Date(item.snapshot_expires_at) <= new Date()
              return (
                <li
                  className="flex flex-col gap-2 rounded-md border border-blue-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {item.report_type === "my_attendance" ? "Attendance" : item.report_type === "my_expenses" ? "Travel & expenses" : item.report_type === "my_clinical_activity" ? "Clinical activity" : item.report_type === "my_performance" ? "Operational summary" : "Claims"} · {item.format.toUpperCase()} · {item.row_count} row{item.row_count === 1 ? "" : "s"}
                      {item.report_type === "my_claims" || item.report_type === "my_expenses" || item.report_type === "my_performance" ? ` · ${money.format(item.total_amount)}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(item.last_downloaded_at).toLocaleString()} · Downloaded {item.download_count} time{item.download_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    className="rounded-md border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={Boolean(working) || expired}
                    onClick={() => download(item.format, item.snapshot_id)}
                    type="button"
                  >
                    {expired ? "Expired" : "Download again"}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export default MyClaimsExportPanel
