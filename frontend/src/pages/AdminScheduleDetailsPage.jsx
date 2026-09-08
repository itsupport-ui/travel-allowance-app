import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import { cancelAdminSchedule } from "../services/adminOperationsService"
import { getScheduleDetails } from "../services/scheduleService"
import { getErrorMessage } from "../services/http"

function Detail({ label, value, wide = false }) {
  return (
    <div className={`border-b border-slate-100 py-3 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">
        {value || "Not recorded"}
      </p>
    </div>
  )
}

function AdminScheduleDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelScope, setCancelScope] = useState("this")

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await getScheduleDetails(id, localStorage.getItem("token"))
        if (active) setSchedule(result)
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError, "Failed to load schedule"))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [id])

  const cancel = async () => {
    setCancelling(true)
    try {
      const updated = await cancelAdminSchedule(id, cancelScope)
      setSchedule(updated)
      setConfirming(false)
      toast.success("Schedule cancelled")
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to cancel schedule"))
    } finally {
      setCancelling(false)
    }
  }

  const canEdit = schedule?.available_actions?.includes("edit")
  const canCancel = schedule?.available_actions?.includes("cancel")
  const dateLabel =
    schedule?.series_id
      ? schedule.occurrence_date || schedule.treatment_date
      : schedule?.schedule_type === "recurring"
      ? `${schedule.start_date} to ${schedule.end_date}`
      : schedule?.treatment_date

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl">
        <button type="button" onClick={() => navigate(-1)} className="mb-4 text-xs font-bold text-blue-700 hover:text-blue-900">
          Back to schedules
        </button>
        <PageState loading={loading} error={error} onRetry={() => window.location.reload()} />
        {!loading && !error && schedule && (
          <>
            <header className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-bold uppercase text-blue-700">Appointment #{schedule.id}</p>
                <h1 className="mt-1 text-2xl font-black text-slate-900">{schedule.patient_name}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {schedule.patient_reference_id || "No patient ID"}
                  {schedule.patient_phone ? ` · ${schedule.patient_phone}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={schedule.status} />
                <StatusBadge status={schedule.priority} />
              </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black text-slate-900">Schedule and Assignment</h2>
                <div className="mt-2 grid md:grid-cols-2 md:gap-x-5">
                  <Detail label="Date / Range" value={dateLabel} />
                  <Detail label="Time" value={`${String(schedule.in_time).slice(0, 5)} to ${String(schedule.out_time).slice(0, 5)}`} />
                  <Detail label="Schedule type" value={schedule.series_id ? "Recurring series occurrence" : schedule.schedule_type?.replaceAll("_", " ")} />
                  <Detail label="Visit type" value={schedule.visit_type?.replaceAll("_", " ")} />
                  <Detail label="Therapist" value={schedule.therapist_name} />
                  <Detail label="Doctor" value={schedule.doctor_name} />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black text-slate-900">Treatment</h2>
                <div className="mt-2 grid md:grid-cols-2 md:gap-x-5">
                  <Detail label="Treatment" value={schedule.treatment_name} />
                  <Detail label="Medicines" value={schedule.medicines} />
                  <Detail label="Patient address" value={schedule.patient_address} wide />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-sm font-black text-slate-900">Visit Notes</h2>
                <div className="mt-2 grid md:grid-cols-2 md:gap-x-5">
                  <Detail label="Instructions" value={schedule.instructions} wide />
                  <Detail label="Clinical notes" value={schedule.clinical_notes} />
                  <Detail label="Precautions" value={schedule.precautions} />
                  {schedule.completion_notes && <Detail label="Completion notes" value={schedule.completion_notes} wide />}
                  {schedule.missed_reason && <Detail label="Missed reason" value={schedule.missed_reason} wide />}
                </div>
              </section>
            </div>

            {(canEdit || canCancel) && (
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                {canEdit && <><Link to={`/admin/schedule/edit/${schedule.id}`} className="rounded-md border border-blue-300 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">
                  Edit
                </Link>
                <Link to={`/admin/schedule/edit/${schedule.id}?reschedule=1`} className="rounded-md border border-amber-300 px-4 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-50">
                  Reschedule
                </Link></>}
                {canCancel && <button type="button" onClick={() => setConfirming(true)} className="rounded-md bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800">
                  Cancel appointment
                </button>}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Cancel this appointment?"
        message={schedule ? `${schedule.patient_name}'s appointment will no longer appear as active.` : ""}
        confirmLabel="Cancel appointment"
        destructive
        busy={cancelling}
        onClose={() => setConfirming(false)}
        onConfirm={cancel}
      >
        {schedule?.series_id && (
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Apply cancellation to
            <select
              value={cancelScope}
              onChange={(event) => setCancelScope(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="this">This visit only</option>
              <option value="future">This and future visits</option>
              <option value="series">All unstarted visits in the series</option>
            </select>
          </label>
        )}
      </ConfirmDialog>
    </AdminLayout>
  )
}

export default AdminScheduleDetailsPage
