import { useEffect, useMemo, useState } from "react"
import AdminLayout from "../layouts/AdminLayout"
import TherapistLayout from "../layouts/TherapistLayout"
import DoctorLayout from "../layouts/DoctorLayout"
import PageState from "../components/ui/PageState"
import { getScheduleFormOptions } from "../services/adminOperationsService"
import { getErrorMessage } from "../services/http"
import {
  downloadTravelExpenseCsv,
  downloadTravelExpenseExcel,
  downloadTravelExpensePdf,
  getTravelExpenseReport,
  saveBlobAsFile,
} from "../services/travelExpenseReportService"

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
})

const today = new Date()
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`

function SummaryRow({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  )
}

function TravelExpenseReportPage() {
  const role = localStorage.getItem("role")
  const isAdmin = role === "admin"
  const Layout = role === "therapist" ? TherapistLayout : role === "doctor" ? DoctorLayout : AdminLayout

  const [personType, setPersonType] = useState("therapist")
  const [personId, setPersonId] = useState("all")
  const [periodMode, setPeriodMode] = useState("month")
  const [month, setMonth] = useState(defaultMonth)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [therapists, setTherapists] = useState([])
  const [doctors, setDoctors] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState("")
  const [hasGenerated, setHasGenerated] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    getScheduleFormOptions()
      .then((result) => {
        setTherapists(result.therapists || [])
        setDoctors(result.doctors || [])
      })
      .catch(() => {
        setTherapists([])
        setDoctors([])
      })
  }, [isAdmin])

  const dateError = useMemo(() => {
    if (periodMode !== "custom") return ""
    if (fromDate && toDate && fromDate > toDate) {
      return "Start date cannot be after end date."
    }
    return ""
  }, [periodMode, fromDate, toDate])

  const buildFilters = () => ({
    personType: isAdmin ? personType : undefined,
    personId: isAdmin ? personId : undefined,
    month: periodMode === "month" ? month : undefined,
    fromDate: periodMode === "custom" ? fromDate : undefined,
    toDate: periodMode === "custom" ? toDate : undefined,
  })

  const generateReport = async () => {
    if (periodMode === "custom" && (!fromDate || !toDate)) {
      setError("Select both a from date and a to date.")
      return
    }
    if (dateError) {
      setError(dateError)
      return
    }
    setLoading(true)
    setError("")
    try {
      setReport(await getTravelExpenseReport(buildFilters()))
      setHasGenerated(true)
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to generate travel expense report"))
    } finally {
      setLoading(false)
    }
  }

  const runExport = async (downloadFn, format) => {
    setExporting(format)
    setError("")
    try {
      const { blob, filename } = await downloadFn(buildFilters())
      saveBlobAsFile(blob, filename)
    } catch (requestError) {
      setError(getErrorMessage(requestError, `Failed to download ${format.toUpperCase()} report`))
    } finally {
      setExporting("")
    }
  }

  const staffOptions = personType === "doctor" ? doctors : therapists

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Travel Expense Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Date, patient, route, distance, fare, and allowance for every trip in the selected period.
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {isAdmin && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-500">
                Person type
                <select
                  value={personType}
                  onChange={(event) => {
                    setPersonType(event.target.value)
                    setPersonId("all")
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                >
                  <option value="therapist">Therapist</option>
                  <option value="doctor">Doctor</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">
                {personType === "doctor" ? "Doctor" : "Therapist"}
                <select
                  value={personId}
                  onChange={(event) => setPersonId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                >
                  <option value="all">All {personType === "doctor" ? "Doctors" : "Therapists"}</option>
                  {staffOptions.map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name || staff.username}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-slate-500">Report period</p>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={periodMode === "month"}
                  onChange={() => setPeriodMode("month")}
                />
                Month
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={periodMode === "custom"}
                  onChange={() => setPeriodMode("custom")}
                />
                Custom date range
              </label>
            </div>
          </div>

          {periodMode === "month" ? (
            <label className="block text-xs font-bold text-slate-500 sm:w-64">
              Month
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:w-96">
              <label className="text-xs font-bold text-slate-500">
                From date
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                />
              </label>
              <label className="text-xs font-bold text-slate-500">
                To date
                <input
                  type="date"
                  min={fromDate || undefined}
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                />
              </label>
            </div>
          )}
          {dateError && <p className="text-xs font-semibold text-rose-600">{dateError}</p>}

          <button
            type="button"
            onClick={generateReport}
            disabled={loading}
            className="rounded-md bg-blue-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate Report"}
          </button>
        </section>

        <PageState loading={false} error={error} />

        {hasGenerated && loading && (
          <div className="flex min-h-32 items-center justify-center" role="status">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        )}

        {!loading && report && (
          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">{report.heading}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {report.period_label} · Generated {new Date(report.generated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runExport(downloadTravelExpensePdf, "pdf")}
                  disabled={Boolean(exporting)}
                  className="rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {exporting === "pdf" ? "Generating..." : "PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => runExport(downloadTravelExpenseExcel, "excel")}
                  disabled={Boolean(exporting)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {exporting === "excel" ? "Generating..." : "Excel"}
                </button>
                <button
                  type="button"
                  onClick={() => runExport(downloadTravelExpenseCsv, "csv")}
                  disabled={Boolean(exporting)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {exporting === "csv" ? "Generating..." : "CSV"}
                </button>
              </div>
            </div>

            {report.row_count === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No travel expense records found for the selected period.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <SummaryRow label="Total KM" value={`${report.total_km.toFixed(2)} km`} />
                  <SummaryRow label="Total Fare" value={money.format(report.total_fare)} />
                  <SummaryRow label="Total Daily Allowance" value={money.format(report.total_daily_allowance)} />
                  <SummaryRow label="Total Others" value={money.format(report.total_others)} />
                  <SummaryRow label="Grand Total" value={money.format(report.grand_total)} />
                </div>

                {report.groups.map((group) => (
                  <div key={group.person_id} className="overflow-hidden rounded-lg border border-slate-200">
                    {report.scope === "all" && (
                      <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-900">
                        {group.person_name}
                      </h3>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="bg-slate-100 text-[10px] uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Patient Name</th>
                            <th className="px-3 py-2">From Address</th>
                            <th className="px-3 py-2">To Address</th>
                            <th className="px-3 py-2 text-right">KM</th>
                            <th className="px-3 py-2 text-right">Fare</th>
                            <th className="px-3 py-2 text-right">Daily Allowance</th>
                            <th className="px-3 py-2 text-right">Others</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row, index) => (
                            <tr key={`${group.person_id}-${index}`} className="border-t border-slate-100">
                              <td className="px-3 py-2">{new Date(row.date).toLocaleDateString("en-IN")}</td>
                              <td className="px-3 py-2">{row.patient_name}</td>
                              <td className="px-3 py-2">{row.from_address}</td>
                              <td className="px-3 py-2">{row.to_address}</td>
                              <td className="px-3 py-2 text-right">{row.km.toFixed(2)} km</td>
                              <td className="px-3 py-2 text-right">{money.format(row.fare)}</td>
                              <td className="px-3 py-2 text-right">{money.format(row.daily_allowance)}</td>
                              <td className="px-3 py-2 text-right">{money.format(row.others)}</td>
                              <td className="px-3 py-2 text-right font-bold">{money.format(row.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                          <tr>
                            <td className="px-3 py-2" colSpan={4}>
                              {report.scope === "all" ? `${group.person_name} Total` : "Total"}
                            </td>
                            <td className="px-3 py-2 text-right">{group.total_km.toFixed(2)} km</td>
                            <td className="px-3 py-2 text-right">{money.format(group.total_fare)}</td>
                            <td className="px-3 py-2 text-right">{money.format(group.total_daily_allowance)}</td>
                            <td className="px-3 py-2 text-right">{money.format(group.total_others)}</td>
                            <td className="px-3 py-2 text-right">{money.format(group.grand_total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))}

                {report.scope === "all" && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-black text-blue-900">Overall Total</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-blue-900 sm:grid-cols-5">
                      <p><span className="font-bold">Total KM:</span> {report.total_km.toFixed(2)} km</p>
                      <p><span className="font-bold">Total Fare:</span> {money.format(report.total_fare)}</p>
                      <p><span className="font-bold">Total DA:</span> {money.format(report.total_daily_allowance)}</p>
                      <p><span className="font-bold">Total Others:</span> {money.format(report.total_others)}</p>
                      <p><span className="font-bold">Grand Total:</span> {money.format(report.grand_total)}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </Layout>
  )
}

export default TravelExpenseReportPage
