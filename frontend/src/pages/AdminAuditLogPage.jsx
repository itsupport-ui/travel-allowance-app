import { useCallback, useEffect, useMemo, useState } from "react"

import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import AdminLayout from "../layouts/AdminLayout"
import { getDomainAuditEvents } from "../services/domainAuditService"
import { getErrorMessage } from "../services/http"


const PAGE_SIZE = 50
const EMPTY_FILTERS = {
  action: "",
  actor_name: "",
  actor_role: "",
  domain: "",
  entity_type: "",
  from_date: "",
  to_date: "",
}

const titleCase = (value) =>
  String(value || "Not recorded")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const transitionLabel = (event) => {
  if (event.from_state && event.to_state) {
    return `${titleCase(event.from_state)} → ${titleCase(event.to_state)}`
  }
  return event.to_state ? titleCase(event.to_state) : "No state transition"
}

function AdminAuditLogPage() {
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState({ items: [], limit: PAGE_SIZE, offset: 0, total: 0 })
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = Object.fromEntries(
        Object.entries(appliedFilters).filter(([, value]) => value !== ""),
      )
      const data = await getDomainAuditEvents({
        ...params,
        limit: PAGE_SIZE,
        offset,
      })
      setPage(data)
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the audit history."))
    } finally {
      setLoading(false)
    }
  }, [appliedFilters, offset])

  useEffect(() => {
    // Synchronize the current server-owned page whenever filters or pagination change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents()
  }, [loadEvents])

  const rangeLabel = useMemo(() => {
    if (!page.total) return "0 events"
    return `${page.offset + 1}–${Math.min(page.offset + page.items.length, page.total)} of ${page.total}`
  }, [page])

  const applyFilters = (event) => {
    event.preventDefault()
    if (
      draftFilters.from_date &&
      draftFilters.to_date &&
      draftFilters.from_date > draftFilters.to_date
    ) {
      setError("From date cannot be later than to date.")
      return
    }
    setOffset(0)
    setAppliedFilters(draftFilters)
  }

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setOffset(0)
  }

  const setFilter = (field, value) => {
    setDraftFilters((current) => ({ ...current, [field]: value }))
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Operational audit log</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review who changed attendance, clinical workflow, financial, staff, configuration, notification, scheduling, and reporting records—and when.
          </p>
        </header>

        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-950">
          Structured audit fields exclude patient identity, locations, proof-file paths, clinical notes, staff contact/credential values, push tokens, and installation IDs. Operational reasons are restricted to authorized administrators and should never include patient details.
        </section>

        <form
          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4"
          onSubmit={applyFilters}
        >
          <label className="text-xs font-bold text-slate-700">
            Domain
            <select
              aria-label="Audit domain"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("domain", event.target.value)}
              value={draftFilters.domain}
            >
              <option value="">All domains</option>
              <option value="attendance">Attendance</option>
              <option value="administration">Staff administration</option>
              <option value="clinical">Clinical workflow</option>
              <option value="configuration">Configuration</option>
              <option value="financial">Financial</option>
              <option value="location">Location</option>
              <option value="notification">Notifications</option>
              <option value="scheduling">Scheduling</option>
              <option value="reporting">Reporting</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Entity type
            <input
              aria-label="Audit entity type"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("entity_type", event.target.value)}
              placeholder="e.g. doctor_claim"
              value={draftFilters.entity_type}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Action
            <input
              aria-label="Audit action"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("action", event.target.value)}
              placeholder="e.g. approved"
              value={draftFilters.action}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Actor name
            <input
              aria-label="Audit actor name"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("actor_name", event.target.value)}
              placeholder="All users"
              value={draftFilters.actor_name}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Actor role
            <select
              aria-label="Audit actor role"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("actor_role", event.target.value)}
              value={draftFilters.actor_role}
            >
              <option value="">All roles</option>
              <option value="admin">Administrator</option>
              <option value="doctor">Doctor</option>
              <option value="therapist">Therapist</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            From business date
            <input
              aria-label="Audit from date"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("from_date", event.target.value)}
              type="date"
              value={draftFilters.from_date}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            To business date
            <input
              aria-label="Audit to date"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setFilter("to_date", event.target.value)}
              type="date"
              value={draftFilters.to_date}
            />
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <button
              className="rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800"
              type="submit"
            >
              Apply filters
            </button>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          </div>
        </form>

        <PageState loading={loading} error={error} onRetry={loadEvents} />

        {!loading && !error && page.items.length === 0 && (
          <PageState
            empty
            emptyTitle="No audit events found"
            emptyText="No recorded event matches the current filters."
          />
        )}

        {!loading && !error && page.items.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Recorded events</h2>
              <p className="text-xs text-slate-500" aria-live="polite">{rangeLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Record</th>
                    <th className="px-4 py-3">Transition</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {page.items.map((event) => (
                    <tr className="align-top" key={event.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        <p className="font-semibold text-slate-800">{event.business_date}</p>
                        <p className="mt-1 text-[10px]">{new Date(event.occurred_at).toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{event.actor_name || `User #${event.actor_id}`}</p>
                        <p className="mt-1 text-[10px] uppercase text-slate-500">{event.actor_role}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={event.outcome} label={titleCase(event.action)} />
                        <p className="mt-2 text-[10px] uppercase text-slate-500">{titleCase(event.domain)}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <p className="font-semibold">{titleCase(event.entity_type)} #{event.entity_id}</p>
                        {event.related_entity_type && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            Related: {titleCase(event.related_entity_type)} #{event.related_entity_id}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{transitionLabel(event)}</td>
                      <td className="max-w-xs px-4 py-3 text-slate-700">
                        {event.reason || (event.reason_code ? titleCase(event.reason_code) : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
                disabled={offset === 0}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
                disabled={offset + page.items.length >= page.total}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                type="button"
              >
                Next
              </button>
            </div>
          </section>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminAuditLogPage
