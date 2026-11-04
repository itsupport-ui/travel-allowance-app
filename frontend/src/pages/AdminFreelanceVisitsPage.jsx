import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"
import FreelancePayoutsSection from "../components/FreelancePayoutsSection"
import { hasPermission } from "../utils/permissions"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import {
  cancelFreelanceVisit,
  createFreelanceVisit,
  createFreelancer,
  fetchFreelanceProofBlob,
  getFreelanceVisits,
  getFreelancers,
  issueFreelanceVisitLink,
  reassignFreelanceVisit,
  updateFreelancer,
} from "../services/freelanceService"
import { getErrorMessage } from "../services/http"

const FEE_CHIPS = [700, 800, 900, 1000, 1200]
const STATUS_FILTERS = [
  ["", "All"],
  ["assigned", "Assigned"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["approved", "Approved"],
  ["paid", "Paid"],
  ["cancelled", "Cancelled"],
]

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
const labelClass = "block text-xs font-bold uppercase tracking-wide text-slate-500"
const primaryButton =
  "rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"

const today = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "—"

const formatClock = (value) => (value ? value.slice(0, 5) : "")

const copyText = async (text, successMessage) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error("Copy is not available here. Select the text and copy it manually.")
  }
}

// ---------------------------------------------------------------------------
// Shown right after a link is created: it is never retrievable again.
// ---------------------------------------------------------------------------
function SendPanel({ sent, onClose }) {
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-emerald-900">
            Send the visit link to {sent.visit.freelancer_name}
          </h2>
          <p className="mt-1 text-xs text-emerald-800">
            This link is shown only now. If you lose it, use &quot;New link&quot; on the visit.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-bold text-emerald-900">
          Close
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-slate-700">
        {sent.message}
      </pre>
      <div className="flex flex-wrap gap-2">
        <a
          href={sent.whatsapp_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Send on WhatsApp
        </a>
        <button
          type="button"
          onClick={() => copyText(sent.link, "Link copied")}
          className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800"
        >
          Copy link
        </button>
        <button
          type="button"
          onClick={() => copyText(sent.message, "Message copied")}
          className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800"
        >
          Copy message
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Assign form
// ---------------------------------------------------------------------------
const emptyVisitForm = () => ({
  freelancer_id: "",
  new_name: "",
  new_phone: "",
  new_upi: "",
  patient_name: "",
  patient_phone: "",
  patient_address: "",
  treatment_name: "",
  visit_date: today(),
  start_time: "",
  end_time: "",
  instructions: "",
  fee_amount: "",
})

function AssignForm({ freelancers, onAssigned, onFreelancerAdded }) {
  const [form, setForm] = useState(emptyVisitForm)
  const [saving, setSaving] = useState(false)
  const isNew = form.freelancer_id === "new"
  const change = (name) => (event) =>
    setForm((current) => ({ ...current, [name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const fee = Number(form.fee_amount)
    if (!form.freelancer_id) return toast.error("Choose a freelancer")
    if (!(fee > 0)) return toast.error("Enter the fee for this visit")
    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      return toast.error("The end time must be after the start time")
    }

    try {
      setSaving(true)
      let freelancerId = Number(form.freelancer_id)
      if (isNew) {
        const created = await createFreelancer({
          name: form.new_name.trim(),
          phone: form.new_phone.trim(),
          upi_id: form.new_upi.trim() || null,
        })
        freelancerId = created.id
        onFreelancerAdded()
      }
      const sent = await createFreelanceVisit({
        freelancer_id: freelancerId,
        patient_name: form.patient_name.trim(),
        patient_phone: form.patient_phone.trim() || null,
        patient_address: form.patient_address.trim(),
        treatment_name: form.treatment_name.trim(),
        visit_date: form.visit_date,
        start_time: form.start_time ? `${form.start_time}:00` : null,
        end_time: form.end_time ? `${form.end_time}:00` : null,
        instructions: form.instructions.trim() || null,
        fee_amount: fee,
      })
      toast.success("Visit assigned. Send the link now.")
      setForm(emptyVisitForm())
      onAssigned(sent)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to assign the visit"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Assign a freelance visit</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={`${labelClass} md:col-span-2`}>
          Freelancer
          <select value={form.freelancer_id} onChange={change("freelancer_id")} className={`${inputClass} mt-1`}>
            <option value="">Select freelancer</option>
            {freelancers.map((freelancer) => (
              <option key={freelancer.id} value={freelancer.id}>
                {freelancer.name} · {freelancer.phone}
              </option>
            ))}
            <option value="new">+ New freelancer</option>
          </select>
        </label>
        {isNew && (
          <>
            <label className={labelClass}>
              Name
              <input value={form.new_name} onChange={change("new_name")} minLength={2} required className={`${inputClass} mt-1`} />
            </label>
            <label className={labelClass}>
              Mobile number (WhatsApp)
              <input value={form.new_phone} onChange={change("new_phone")} inputMode="tel" required placeholder="10-digit number" className={`${inputClass} mt-1`} />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              UPI ID (optional)
              <input value={form.new_upi} onChange={change("new_upi")} className={`${inputClass} mt-1`} />
            </label>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Patient name
          <input value={form.patient_name} onChange={change("patient_name")} minLength={2} required className={`${inputClass} mt-1`} />
        </label>
        <label className={labelClass}>
          Patient phone
          <input value={form.patient_phone} onChange={change("patient_phone")} inputMode="tel" maxLength={20} className={`${inputClass} mt-1`} />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Patient address (located on the map automatically)
          <textarea rows={2} value={form.patient_address} onChange={change("patient_address")} minLength={5} required className={`${inputClass} mt-1`} />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Treatment
          <input value={form.treatment_name} onChange={change("treatment_name")} minLength={2} required placeholder="e.g. Home physiotherapy" className={`${inputClass} mt-1`} />
        </label>
        <label className={labelClass}>
          Date
          <input type="date" min={today()} value={form.visit_date} onChange={change("visit_date")} required className={`${inputClass} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            From
            <input type="time" value={form.start_time} onChange={change("start_time")} className={`${inputClass} mt-1`} />
          </label>
          <label className={labelClass}>
            To
            <input type="time" value={form.end_time} onChange={change("end_time")} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <label className={`${labelClass} md:col-span-2`}>
          Instructions for the therapist
          <textarea rows={2} value={form.instructions} onChange={change("instructions")} maxLength={2000} className={`${inputClass} mt-1`} />
        </label>
      </div>

      <div>
        <p className={labelClass}>Fee for this visit (Rs)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {FEE_CHIPS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setForm((current) => ({ ...current, fee_amount: String(amount) }))}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                Number(form.fee_amount) === amount
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {amount}
            </button>
          ))}
          <input
            type="number"
            min="1"
            max="100000"
            value={form.fee_amount}
            onChange={change("fee_amount")}
            placeholder="Other"
            className={`${inputClass} w-28`}
          />
        </div>
      </div>

      <button type="submit" disabled={saving} className={primaryButton}>
        {saving ? "Assigning..." : "Assign and get link"}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Visits list
// ---------------------------------------------------------------------------
function ReassignDialog({ visit, freelancers, onClose, onDone }) {
  const [freelancerId, setFreelancerId] = useState("")
  const [fee, setFee] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      const sent = await reassignFreelanceVisit(visit.id, {
        freelancer_id: Number(freelancerId),
        fee_amount: fee ? Number(fee) : null,
      })
      toast.success("Visit reassigned. Send the new link.")
      onDone(sent)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to reassign the visit"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-slate-900">Reassign visit</h3>
        <p className="text-xs text-slate-500">
          {visit.patient_name} · {formatDate(visit.visit_date)}. The old link stops working.
        </p>
        <label className={labelClass}>
          New freelancer
          <select value={freelancerId} onChange={(event) => setFreelancerId(event.target.value)} required className={`${inputClass} mt-1`}>
            <option value="">Select freelancer</option>
            {freelancers
              .filter((freelancer) => freelancer.id !== visit.freelancer_id)
              .map((freelancer) => (
                <option key={freelancer.id} value={freelancer.id}>
                  {freelancer.name} · {freelancer.phone}
                </option>
              ))}
          </select>
        </label>
        <label className={labelClass}>
          Fee (leave empty to keep Rs {Number(visit.fee_amount).toFixed(0)})
          <input type="number" min="1" value={fee} onChange={(event) => setFee(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600">
            Close
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving..." : "Reassign"}
          </button>
        </div>
      </form>
    </div>
  )
}

function VisitsSection({ freelancers, reloadKey, onChanged, onSent }) {
  const [visits, setVisits] = useState([])
  const [statusFilter, setStatusFilter] = useState("")
  const [date, setDate] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [localKey, setLocalKey] = useState(0)
  const [reassigning, setReassigning] = useState(null)

  useEffect(() => {
    let cancelled = false
    const params = {}
    if (statusFilter) params.status = statusFilter
    if (date) {
      params.date_from = date
      params.date_to = date
    }
    getFreelanceVisits(params)
      .then((loaded) => {
        if (cancelled) return
        setError("")
        setVisits(loaded)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, "Unable to load visits"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [statusFilter, date, reloadKey, localKey])

  const refresh = () => {
    setLocalKey((key) => key + 1)
    onChanged()
  }

  const handleCancel = async (visit) => {
    const reason = window.prompt(
      `Reason for cancelling the visit for ${visit.patient_name} (min 5 characters)`,
    )
    if (reason === null) return
    if (reason.trim().length < 5) {
      toast.error("Enter at least 5 characters")
      return
    }
    try {
      await cancelFreelanceVisit(visit.id, reason.trim())
      toast.success("Visit cancelled. The link no longer works.")
      refresh()
    } catch (cancelError) {
      toast.error(getErrorMessage(cancelError, "Unable to cancel the visit"))
    }
  }

  const handleNewLink = async (visit) => {
    try {
      onSent(await issueFreelanceVisitLink(visit.id))
      refresh()
    } catch (linkError) {
      toast.error(getErrorMessage(linkError, "Unable to create a new link"))
    }
  }

  const viewProof = async (visit) => {
    try {
      const blob = await fetchFreelanceProofBlob(visit.id)
      window.open(URL.createObjectURL(blob), "_blank", "noopener")
    } catch (proofError) {
      toast.error(getErrorMessage(proofError, "Unable to open the proof"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setLoading(true)
              setStatusFilter(event.target.value)
            }}
            className={`${inputClass} mt-1`}
          >
            {STATUS_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Date
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setLoading(true)
              setDate(event.target.value)
            }}
            className={`${inputClass} mt-1`}
          />
        </label>
        {date && (
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setDate("")
            }}
            className="pb-2.5 text-sm font-semibold text-blue-700"
          >
            Clear
          </button>
        )}
      </div>

      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && visits.length === 0}
        onRetry={() => {
          setLoading(true)
          setLocalKey((key) => key + 1)
        }}
        emptyTitle="No freelance visits"
        emptyText="Assigned visits appear here."
      />

      {!loading && !error && visits.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-100 bg-slate-50/80">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Freelancer</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visits.map((visit) => (
                <tr key={visit.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{formatDate(visit.visit_date)}</p>
                    <p className="text-xs text-slate-500">
                      {[formatClock(visit.start_time), formatClock(visit.end_time)].filter(Boolean).join(" – ")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{visit.freelancer_name}</p>
                    <p className="text-xs text-slate-500">{visit.freelancer_phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{visit.patient_name}</p>
                    <p className="text-xs text-slate-500">{visit.treatment_name}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">Rs {Number(visit.fee_amount).toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={visit.status} />
                    {visit.location_unverified && (
                      <p
                        className="mt-1 text-[11px] font-semibold text-amber-700"
                        title={visit.unverified_reason || ""}
                      >
                        Location not verified
                      </p>
                    )}
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    {visit.has_proof && (
                      <button type="button" onClick={() => viewProof(visit)} className="text-xs font-bold text-blue-700">
                        View proof
                      </button>
                    )}
                    {["assigned", "in_progress"].includes(visit.status) && (
                      <button type="button" onClick={() => handleNewLink(visit)} className="text-xs font-bold text-blue-700">
                        New link
                      </button>
                    )}
                    {visit.status === "assigned" && (
                      <button type="button" onClick={() => setReassigning(visit)} className="text-xs font-bold text-blue-700">
                        Reassign
                      </button>
                    )}
                    {["assigned", "in_progress"].includes(visit.status) && (
                      <button type="button" onClick={() => handleCancel(visit)} className="text-xs font-bold text-rose-700">
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

      {reassigning && (
        <ReassignDialog
          visit={reassigning}
          freelancers={freelancers}
          onClose={() => setReassigning(null)}
          onDone={(sent) => {
            setReassigning(null)
            onSent(sent)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------
function FreelancersSection({ freelancers, onChanged }) {
  const [form, setForm] = useState({ name: "", phone: "", upi_id: "" })
  const [saving, setSaving] = useState(false)
  const change = (name) => (event) =>
    setForm((current) => ({ ...current, [name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await createFreelancer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        upi_id: form.upi_id.trim() || null,
      })
      toast.success("Freelancer added")
      setForm({ name: "", phone: "", upi_id: "" })
      onChanged()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to add the freelancer"))
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (freelancer) => {
    if (!window.confirm(`Remove ${freelancer.name} from the list? Past visits are kept.`)) return
    try {
      await updateFreelancer(freelancer.id, { active: false })
      onChanged()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to remove the freelancer"))
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Add a freelancer</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label className={labelClass}>
            Name
            <input value={form.name} onChange={change("name")} minLength={2} required className={`${inputClass} mt-1`} />
          </label>
          <label className={labelClass}>
            Mobile number
            <input value={form.phone} onChange={change("phone")} inputMode="tel" required className={`${inputClass} mt-1`} />
          </label>
          <label className={labelClass}>
            UPI ID (optional)
            <input value={form.upi_id} onChange={change("upi_id")} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving..." : "Add freelancer"}
        </button>
      </form>

      <PageState
        empty={freelancers.length === 0}
        emptyTitle="No freelancers yet"
        emptyText="Added freelancers can be picked when assigning a visit."
      />
      <div className="space-y-3">
        {freelancers.map((freelancer) => (
          <div key={freelancer.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div>
              <p className="font-semibold text-slate-900">{freelancer.name}</p>
              <p className="text-xs text-slate-500">
                {freelancer.phone}
                {freelancer.upi_id ? ` · ${freelancer.upi_id}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => deactivate(freelancer)} className="text-xs font-bold text-rose-700">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function AdminFreelanceVisitsPage() {
  const [tab, setTab] = useState("visits")
  const [freelancers, setFreelancers] = useState([])
  const [sent, setSent] = useState(null)
  const [directoryKey, setDirectoryKey] = useState(0)
  const [visitsKey, setVisitsKey] = useState(0)
  const reloadDirectory = useCallback(() => setDirectoryKey((key) => key + 1), [])
  const reloadVisits = useCallback(() => setVisitsKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    getFreelancers()
      .then((loaded) => {
        if (!cancelled) setFreelancers(loaded)
      })
      .catch((error) => toast.error(getErrorMessage(error, "Unable to load freelancers")))
    return () => {
      cancelled = true
    }
  }, [directoryKey])

  const showSent = (payload) => {
    setSent(payload)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header>
          <h1 className="text-2xl font-black text-slate-900">Freelance Visits</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hire a therapist for a single visit at a fixed fee. They open a link on their phone, so no app or login is needed.
          </p>
        </header>

        {sent && <SendPanel sent={sent} onClose={() => setSent(null)} />}

        <div className="flex flex-wrap gap-2">
          {[
            ["visits", "Visits"],
            ["assign", "Assign visit"],
            ...(hasPermission("freelance_payouts.manage")
              ? [["payouts", "Payouts"]]
              : []),
            ["freelancers", "Freelancers"],
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

        {tab === "visits" && (
          <VisitsSection
            freelancers={freelancers}
            reloadKey={visitsKey}
            onChanged={reloadVisits}
            onSent={showSent}
          />
        )}
        {tab === "assign" && (
          <AssignForm
            freelancers={freelancers}
            onFreelancerAdded={reloadDirectory}
            onAssigned={(payload) => {
              showSent(payload)
              reloadVisits()
              setTab("visits")
            }}
          />
        )}
        {tab === "payouts" && <FreelancePayoutsSection onChanged={reloadVisits} />}
        {tab === "freelancers" && (
          <FreelancersSection freelancers={freelancers} onChanged={reloadDirectory} />
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminFreelanceVisitsPage
