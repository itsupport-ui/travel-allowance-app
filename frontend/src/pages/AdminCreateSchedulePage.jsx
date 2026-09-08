import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import StatusBadge from "../components/ui/StatusBadge"
import {
  getScheduleFormOptions,
  getTherapistAvailability,
} from "../services/adminOperationsService"
import { createSchedule } from "../services/scheduleService"
import { getErrorMessage } from "../services/http"
import { isEndAfterStart, isValidPhone } from "../utils/validation"

const initialForm = {
  patient_name: "",
  patient_reference_id: "",
  patient_phone: "",
  patient_address: "",
  treatment_name: "",
  medicines: "",
  visit_type: "home_visit",
  doctor_id: "",
  therapist_id: "",
  priority: "normal",
  schedule_type: "one_time",
  treatment_date: "",
  start_date: "",
  end_date: "",
  cadence_days: "1",
  in_time: "",
  out_time: "",
  instructions: "",
  clinical_notes: "",
  precautions: "",
}

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
const labelClass = "text-xs font-bold text-slate-600"

function Section({ title, description, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function AdminCreateSchedulePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [options, setOptions] = useState({ patients: [], doctors: [], therapists: [] })
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [saving, setSaving] = useState(false)
  const [availability, setAvailability] = useState(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form],
  )

  useEffect(() => {
    getScheduleFormOptions()
      .then(setOptions)
      .catch((error) => toast.error(getErrorMessage(error, "Failed to load form options")))
      .finally(() => setLoadingOptions(false))
  }, [])

  useEffect(() => {
    const warn = (event) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [isDirty])

  useEffect(() => {
    const hasDates =
      form.schedule_type === "one_time"
        ? Boolean(form.treatment_date)
        : Boolean(form.start_date && form.end_date)
    if (
      !form.therapist_id ||
      !hasDates ||
      !isEndAfterStart(form.in_time, form.out_time)
    ) {
      // Clear a prior result when the availability query is incomplete.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAvailability(null)
      return
    }

    const timer = window.setTimeout(async () => {
      setCheckingAvailability(true)
      try {
        setAvailability(
          await getTherapistAvailability({
            therapist_id: form.therapist_id,
            schedule_type: form.schedule_type,
            treatment_date:
              form.schedule_type === "one_time" ? form.treatment_date : undefined,
            start_date:
              form.schedule_type === "recurring" ? form.start_date : undefined,
            end_date:
              form.schedule_type === "recurring" ? form.end_date : undefined,
            cadence_days:
              form.schedule_type === "recurring"
                ? Number(form.cadence_days)
                : 1,
            start_time: form.in_time,
            expected_end_time: form.out_time,
          }),
        )
      } catch (error) {
        setAvailability(null)
        toast.error(getErrorMessage(error, "Unable to check therapist availability"))
      } finally {
        setCheckingAvailability(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [
    form.end_date,
    form.cadence_days,
    form.in_time,
    form.out_time,
    form.schedule_type,
    form.start_date,
    form.therapist_id,
    form.treatment_date,
  ])

  const change = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
  }

  const selectPatient = (name) => {
    const patient = options.patients.find(
      (item) => item.name.toLowerCase() === name.trim().toLowerCase(),
    )
    setForm((current) => ({
      ...current,
      patient_name: name,
      ...(patient
        ? {
            patient_reference_id: patient.reference_id || "",
            patient_phone: patient.phone || "",
            patient_address: patient.address || "",
          }
        : {}),
    }))
  }

  const validate = () => {
    if (!form.patient_name.trim() || !form.patient_address.trim()) {
      return "Patient name and address are required."
    }
    if (!isValidPhone(form.patient_phone)) {
      return "Enter a valid patient phone number."
    }
    if (!form.doctor_id || !form.therapist_id || !form.treatment_name.trim()) {
      return "Treatment, doctor, and therapist are required."
    }
    if (!isEndAfterStart(form.in_time, form.out_time)) {
      return "Expected end time must be after the start time."
    }
    if (
      form.schedule_type === "recurring" &&
      (!form.start_date || !form.end_date || form.end_date < form.start_date)
    ) {
      return "Recurring schedules require a valid date range."
    }
    if (
      form.schedule_type === "recurring" &&
      (!Number.isInteger(Number(form.cadence_days)) ||
        Number(form.cadence_days) < 1 ||
        Number(form.cadence_days) > 31)
    ) {
      return "Days between visits must be from 1 to 31."
    }
    if (form.schedule_type === "one_time" && !form.treatment_date) {
      return "Treatment date is required."
    }
    if (availability && !availability.available) {
      return "Resolve the therapist scheduling conflict before creating this appointment."
    }
    return ""
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    try {
      await createSchedule(
        {
          ...form,
          patient_reference_id: form.patient_reference_id.trim() || null,
          patient_phone: form.patient_phone.trim() || null,
          medicines: form.medicines.trim() || null,
          clinical_notes: form.clinical_notes.trim() || null,
          precautions: form.precautions.trim() || null,
          doctor_id: Number(form.doctor_id),
          therapist_id: Number(form.therapist_id),
          treatment_date:
            form.schedule_type === "one_time" ? form.treatment_date : null,
          start_date:
            form.schedule_type === "recurring" ? form.start_date : null,
          end_date:
            form.schedule_type === "recurring" ? form.end_date : null,
          cadence_days:
            form.schedule_type === "recurring"
              ? Number(form.cadence_days)
              : 1,
        },
        localStorage.getItem("token"),
      )
      toast.success("Schedule created successfully")
      setForm(initialForm)
      navigate("/admin/schedules?view=today")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create schedule"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-5">
          <h1 className="text-2xl font-black text-slate-900">Create Schedule</h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign a clinical visit. Travel mode is selected by the therapist only when filing a claim.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-5">
          <Section title="Patient Information" description="Search an existing patient or enter a new visit location.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                Patient name
                <input
                  list="known-patients"
                  value={form.patient_name}
                  onChange={(event) => selectPatient(event.target.value)}
                  className={inputClass}
                  disabled={loadingOptions}
                  required
                />
                <datalist id="known-patients">
                  {options.patients.map((patient) => (
                    <option key={`${patient.name}-${patient.reference_id || ""}`} value={patient.name} />
                  ))}
                </datalist>
              </label>
              <label className={labelClass}>
                Patient ID
                <input value={form.patient_reference_id} onChange={(event) => change("patient_reference_id", event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Phone number (optional)
                <input type="tel" value={form.patient_phone} onChange={(event) => change("patient_phone", event.target.value)} className={inputClass} />
              </label>
              <label className={`${labelClass} md:col-span-2`}>
                Patient address
                <textarea rows="2" value={form.patient_address} onChange={(event) => change("patient_address", event.target.value)} className={inputClass} required />
              </label>
            </div>
          </Section>

          <Section title="Treatment Information" description="Define the clinical purpose and expected visit format.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                Treatment name
                <input value={form.treatment_name} onChange={(event) => change("treatment_name", event.target.value)} className={inputClass} required />
              </label>
              <label className={labelClass}>
                Visit type
                <select value={form.visit_type} onChange={(event) => change("visit_type", event.target.value)} className={inputClass}>
                  <option value="home_visit">Home visit</option>
                  <option value="clinic_visit">Clinic visit</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="assessment">Assessment</option>
                </select>
              </label>
              <label className={`${labelClass} md:col-span-2`}>
                Medicines
                <textarea rows="2" value={form.medicines} onChange={(event) => change("medicines", event.target.value)} className={inputClass} />
              </label>
            </div>
          </Section>

          <Section title="Clinical Assignment" description="Assign accountable clinical staff and review workload before saving.">
            <div className="grid gap-4 md:grid-cols-3">
              <label className={labelClass}>
                Doctor
                <select value={form.doctor_id} onChange={(event) => change("doctor_id", event.target.value)} className={inputClass} required>
                  <option value="">Select doctor</option>
                  {options.doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name}{doctor.specialization ? ` - ${doctor.specialization}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Therapist
                <select value={form.therapist_id} onChange={(event) => change("therapist_id", event.target.value)} className={inputClass} required>
                  <option value="">Select therapist</option>
                  {options.therapists.map((therapist) => (
                    <option key={therapist.id} value={therapist.id}>
                      {therapist.name} ({therapist.today_appointments} today)
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Priority
                <select value={form.priority} onChange={(event) => change("priority", event.target.value)} className={inputClass}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            {(checkingAvailability || availability) && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                {checkingAvailability ? (
                  <span className="text-slate-500">Checking therapist availability...</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={availability.available ? "active" : "high"} label={availability.available ? "Available" : "Conflict"} />
                    <span className="text-slate-600">{availability.today_appointments} appointment(s) today</span>
                    {!availability.available && (
                      <span className="font-semibold text-rose-700">
                        Overlaps {availability.conflicts.map((item) => item.patient_name).join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="Schedule" description="Choose one visit or a recurring treatment window.">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>
                Schedule type
                <select value={form.schedule_type} onChange={(event) => change("schedule_type", event.target.value)} className={inputClass}>
                  <option value="one_time">One time</option>
                  <option value="recurring">Recurring</option>
                </select>
              </label>
              {form.schedule_type === "one_time" ? (
                <label className={labelClass}>
                  Date
                  <input type="date" value={form.treatment_date} onChange={(event) => change("treatment_date", event.target.value)} className={inputClass} required />
                </label>
              ) : (
                <>
                  <label className={labelClass}>
                    Start date
                    <input type="date" value={form.start_date} onChange={(event) => change("start_date", event.target.value)} className={inputClass} required />
                  </label>
                  <label className={labelClass}>
                    End date
                    <input type="date" min={form.start_date} value={form.end_date} onChange={(event) => change("end_date", event.target.value)} className={inputClass} required />
                  </label>
                  <label className={labelClass}>
                    Days between visits
                    <input type="number" min="1" max="31" value={form.cadence_days} onChange={(event) => change("cadence_days", event.target.value)} className={inputClass} required />
                  </label>
                </>
              )}
              <label className={labelClass}>
                Start time
                <input type="time" value={form.in_time} onChange={(event) => change("in_time", event.target.value)} className={inputClass} required />
              </label>
              <label className={labelClass}>
                Expected end time
                <input type="time" min={form.in_time} value={form.out_time} onChange={(event) => change("out_time", event.target.value)} className={inputClass} required />
              </label>
            </div>
          </Section>

          <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-black text-slate-900">
              Visit Notes
              <span className="ml-2 text-xs font-normal text-slate-500">Instructions, clinical notes, and precautions</span>
            </summary>
            <div className="mt-4 grid gap-4">
              <label className={labelClass}>
                Instructions
                <textarea rows="3" value={form.instructions} onChange={(event) => change("instructions", event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Clinical notes
                <textarea rows="3" value={form.clinical_notes} onChange={(event) => change("clinical_notes", event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Precautions
                <textarea rows="2" value={form.precautions} onChange={(event) => change("precautions", event.target.value)} className={inputClass} />
              </label>
            </div>
          </details>

          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <button type="button" onClick={() => navigate(-1)} className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={saving || checkingAvailability} className="rounded-md bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
              {saving ? "Creating..." : "Create schedule"}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}

export default AdminCreateSchedulePage
