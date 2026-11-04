import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"

import PageState from "./ui/PageState"
import StatusBadge from "./ui/StatusBadge"
import {
  approveFreelanceVisit,
  downloadFreelancePayoutsCsv,
  fetchFreelanceProofBlob,
  getFreelanceVisits,
  markFreelanceVisitPaid,
} from "../services/freelanceService"
import { getErrorMessage } from "../services/http"

const STAGES = [
  { value: "completed", label: "Needs approval" },
  { value: "approved", label: "To pay" },
  { value: "paid", label: "Paid" },
]

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
const labelClass = "block text-xs font-bold uppercase tracking-wide text-slate-500"

const money = (value) => `Rs ${Number(value).toFixed(0)}`

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "—"

const askReference = (prompt) => {
  const reference = window.prompt(prompt)
  if (reference === null) return null
  if (reference.trim().length < 3) {
    toast.error("Enter the payment reference (UTR or transaction ID), at least 3 characters")
    return null
  }
  return reference.trim()
}

function FreelancePayoutsSection({ onChanged }) {
  const [stage, setStage] = useState("completed")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = { status: stage }
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    getFreelanceVisits(params)
      .then((loaded) => {
        if (cancelled) return
        setError("")
        setVisits(loaded)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, "Unable to load payouts"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [stage, dateFrom, dateTo, reloadKey])

  const reload = () => {
    setReloadKey((key) => key + 1)
    onChanged()
  }

  const change = (setter) => (value) => {
    setLoading(true)
    setter(value)
  }

  // One row per freelancer so a single transfer can settle several visits.
  const groups = useMemo(() => {
    const byFreelancer = new Map()
    visits.forEach((visit) => {
      const group = byFreelancer.get(visit.freelancer_id) || {
        id: visit.freelancer_id,
        name: visit.freelancer_name,
        phone: visit.freelancer_phone,
        upi: visit.freelancer_upi_id,
        visits: [],
        total: 0,
      }
      group.visits.push(visit)
      group.total += Number(visit.fee_amount)
      byFreelancer.set(visit.freelancer_id, group)
    })
    return [...byFreelancer.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [visits])

  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0)

  const runAll = async (items, work, doneMessage) => {
    setBusy(true)
    let failed = 0
    for (const item of items) {
      try {
        await work(item)
      } catch (workError) {
        failed += 1
        toast.error(getErrorMessage(workError, `Visit #${item.id} could not be updated`))
      }
    }
    setBusy(false)
    if (failed < items.length) toast.success(doneMessage(items.length - failed))
    reload()
  }

  const approve = (visit) => {
    if (
      visit.location_unverified &&
      !window.confirm(
        `Location was not verified for this visit.\n\n${visit.unverified_reason || ""}\n\nApprove anyway?`,
      )
    ) {
      return
    }
    runAll([visit], (item) => approveFreelanceVisit(item.id), () => "Visit approved")
  }

  const approveVerified = (group) => {
    const verified = group.visits.filter((visit) => !visit.location_unverified)
    if (verified.length === 0) {
      toast.error("Every visit here needs a manual check first")
      return
    }
    if (!window.confirm(`Approve ${verified.length} location-verified visit(s) for ${group.name}?`)) return
    runAll(
      verified,
      (item) => approveFreelanceVisit(item.id),
      (count) => `${count} visit(s) approved`,
    )
  }

  const payGroup = (group) => {
    const reference = askReference(
      `Pay ${money(group.total)} to ${group.name}${group.upi ? ` (${group.upi})` : ""}.\nAfter paying, enter the payment reference (UTR / transaction ID):`,
    )
    if (!reference) return
    runAll(
      group.visits,
      (item) => markFreelanceVisitPaid(item.id, reference),
      (count) => `${count} visit(s) marked paid`,
    )
  }

  const payOne = (visit) => {
    const reference = askReference(
      `Pay ${money(visit.fee_amount)} to ${visit.freelancer_name}.\nEnter the payment reference (UTR / transaction ID):`,
    )
    if (!reference) return
    runAll([visit], (item) => markFreelanceVisitPaid(item.id, reference), () => "Marked as paid")
  }

  const viewProof = async (visit) => {
    try {
      const blob = await fetchFreelanceProofBlob(visit.id)
      window.open(URL.createObjectURL(blob), "_blank", "noopener")
    } catch (proofError) {
      toast.error(getErrorMessage(proofError, "Unable to open the proof"))
    }
  }

  const exportCsv = async () => {
    try {
      const params = { status: stage }
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const blob = await downloadFreelancePayoutsCsv(params)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `freelance-payouts-${stage}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      toast.error(getErrorMessage(exportError, "Unable to export"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STAGES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => change(setStage)(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              stage === value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          From
          <input type="date" value={dateFrom} onChange={(event) => change(setDateFrom)(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className={labelClass}>
          To
          <input type="date" value={dateTo} onChange={(event) => change(setDateTo)(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && visits.length === 0}
        onRetry={() => {
          setLoading(true)
          setReloadKey((key) => key + 1)
        }}
        emptyTitle="Nothing here"
        emptyText="Visits appear in this list as they move through approval and payment."
      />

      {!loading && !error && visits.length > 0 && (
        <>
          <p className="text-sm font-semibold text-slate-700">
            {visits.length} visit(s) · {money(grandTotal)} in total
          </p>

          {groups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div>
                  <p className="font-bold text-slate-900">{group.name}</p>
                  <p className="text-xs text-slate-500">
                    {group.phone}
                    {group.upi ? ` · UPI ${group.upi}` : " · no UPI saved"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-slate-900">
                    {group.visits.length} visit(s) · {money(group.total)}
                  </p>
                  {stage === "completed" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => approveVerified(group)}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Approve verified
                    </button>
                  )}
                  {stage === "approved" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => payGroup(group)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      Mark all paid
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {group.visits.map((visit) => (
                      <tr key={visit.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{formatDate(visit.visit_date)}</p>
                          <p className="text-xs text-slate-500">{visit.treatment_name}</p>
                        </td>
                        <td className="px-4 py-3">{visit.patient_name}</td>
                        <td className="px-4 py-3 font-semibold">{money(visit.fee_amount)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={visit.status} />
                          {visit.location_unverified && (
                            <p className="mt-1 max-w-[220px] text-[11px] font-semibold text-amber-700">
                              Location not verified
                              {visit.unverified_reason && (
                                <span className="block font-normal text-amber-800">
                                  {visit.unverified_reason}
                                </span>
                              )}
                            </p>
                          )}
                          {visit.payment_reference && (
                            <p className="mt-1 text-[11px] text-slate-500">Ref {visit.payment_reference}</p>
                          )}
                        </td>
                        <td className="space-x-3 px-4 py-3 text-right">
                          {visit.has_proof && (
                            <button type="button" onClick={() => viewProof(visit)} className="text-xs font-bold text-blue-700">
                              View proof
                            </button>
                          )}
                          {visit.status === "completed" && (
                            <button type="button" disabled={busy} onClick={() => approve(visit)} className="text-xs font-bold text-emerald-700">
                              Approve
                            </button>
                          )}
                          {visit.status === "approved" && (
                            <button type="button" disabled={busy} onClick={() => payOne(visit)} className="text-xs font-bold text-blue-700">
                              Mark paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

export default FreelancePayoutsSection
