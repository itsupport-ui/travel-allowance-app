import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import AdminLayout from "../layouts/AdminLayout"
import {
  createOperationalFollowUp,
  getOperationalFollowUpAssignees,
  getOperationalFollowUps,
  updateOperationalFollowUp,
} from "../services/operationalFollowUpService"
import { getErrorMessage } from "../services/http"


const EMPTY_DRAFT = {
  source_domain: "attendance",
  source_entity_type: "",
  source_entity_id: "",
  title: "",
  priority: "medium",
  due_date: "",
  reason: "",
}

const FOLLOW_UP_DOMAINS = ['attendance', 'clinical', 'claims', 'expenses', 'location', 'reporting', 'scheduling', 'staff', 'travel']

const draftFromSearchParams = (searchParams) => {
  const requestedDomain = searchParams.get("source_domain")
  return {
    ...EMPTY_DRAFT,
    source_domain: FOLLOW_UP_DOMAINS.includes(requestedDomain) ? requestedDomain : EMPTY_DRAFT.source_domain,
    source_entity_type: (searchParams.get("source_entity_type") || "").slice(0, 80),
    source_entity_id: (searchParams.get("source_entity_id") || "").slice(0, 100),
    title: (searchParams.get("title") || "").slice(0, 160),
  }
}

const titleCase = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

function AdminFollowUpsPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState("open")
  const [page, setPage] = useState({ items: [], total: 0 })
  const [draft, setDraft] = useState(() => draftFromSearchParams(searchParams))
  const [assignees, setAssignees] = useState([])
  const [selectedOwners, setSelectedOwners] = useState({})
  const [decisionReasons, setDecisionReasons] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [followUps, owners] = await Promise.all([
        getOperationalFollowUps({ status, limit: 100 }),
        getOperationalFollowUpAssignees(),
      ])
      setPage(followUps)
      setAssignees(owners)
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load operational follow-ups."))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    // Load the current server-owned queue whenever its status filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotice("")
    try {
      await createOperationalFollowUp({
        ...draft,
        due_date: draft.due_date || null,
        assignee_id: draft.assignee_id ? Number(draft.assignee_id) : null,
      })
      setDraft(EMPTY_DRAFT)
      setStatus("open")
      setNotice("Follow-up created and added to the shared queue.")
      await load()
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to create the follow-up."))
    } finally {
      setSaving(false)
    }
  }

  const transition = async (item, nextStatus, requestedOwnerId = item.assignee_id) => {
    const reason = decisionReasons[item.id]?.trim() || ""
    if (reason.length < 8) {
      setError("Enter a reason of at least 8 characters. Do not include patient details.")
      return
    }
    setSaving(true)
    setError("")
    setNotice("")
    try {
      await updateOperationalFollowUp(item.id, {
        status: nextStatus,
        version: item.version,
        reason: reason.trim(),
        assignee_id: requestedOwnerId,
      })
      setNotice(`Follow-up marked ${titleCase(nextStatus).toLowerCase()}.`)
      setDecisionReasons((current) => ({ ...current, [item.id]: "" }))
      await load()
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to update the follow-up. Refresh and try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">Administration</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Operational follow-ups</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Give cross-domain exceptions a clear owner, due date, priority, and auditable resolution.
          </p>
        </header>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          Use record IDs and operational descriptions only. Never enter patient identity, clinical notes, addresses, coordinates, or proof-file paths.
        </section>

        {error && <PageState tone="error" title="Action needed" message={error} actionLabel="Retry" onAction={load} />}
        {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          <label className="text-xs font-bold text-slate-700">Domain
            <select className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.source_domain} onChange={(event) => setDraft((value) => ({ ...value, source_domain: event.target.value }))}>
              {FOLLOW_UP_DOMAINS.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Record type
            <input required maxLength={80} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" placeholder="e.g. therapist_workday" value={draft.source_entity_type} onChange={(event) => setDraft((value) => ({ ...value, source_entity_type: event.target.value }))} />
          </label>
          <label className="text-xs font-bold text-slate-700">Record ID
            <input required maxLength={100} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.source_entity_id} onChange={(event) => setDraft((value) => ({ ...value, source_entity_id: event.target.value }))} />
          </label>
          <label className="text-xs font-bold text-slate-700">Priority
            <select className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value }))}>
              {['low', 'medium', 'high', 'urgent'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Follow-up title
            <input required minLength={4} maxLength={160} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} />
          </label>
          <label className="text-xs font-bold text-slate-700">Due date
            <input type="date" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.due_date} onChange={(event) => setDraft((value) => ({ ...value, due_date: event.target.value }))} />
          </label>
          <label className="text-xs font-bold text-slate-700">Owner
            <select className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.assignee_id || ""} onChange={(event) => setDraft((value) => ({ ...value, assignee_id: event.target.value }))}>
              <option value="">Leave unassigned</option>
              {assignees.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Reason
            <textarea required minLength={8} maxLength={1000} rows={2} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" value={draft.reason} onChange={(event) => setDraft((value) => ({ ...value, reason: event.target.value }))} />
          </label>
          <button disabled={saving} className="self-end rounded-md bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Create follow-up"}</button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm font-bold text-slate-700">Queue status
            <select className="ml-2 rounded-md border border-slate-300 px-3 py-2 font-normal" value={status} onChange={(event) => setStatus(event.target.value)}>
              {['open', 'in_progress', 'resolved', 'cancelled', 'all'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <span aria-live="polite" className="text-sm text-slate-600">{page.total} follow-up{page.total === 1 ? "" : "s"}</span>
        </div>

        {loading ? <PageState title="Loading follow-ups" message="Retrieving the shared operational queue." /> : page.items.length === 0 ? (
          <PageState title="No follow-ups found" message="There are no records for this queue status." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {page.items.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{titleCase(item.source_domain)} - {item.source_entity_type} #{item.source_entity_id}</p><h2 className="mt-1 font-black text-slate-950">{item.title}</h2></div>
                  <StatusBadge status={item.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="font-bold text-slate-500">Priority</dt><dd>{titleCase(item.priority)}</dd></div><div><dt className="font-bold text-slate-500">Due</dt><dd>{item.due_date || "Not set"}</dd></div><div><dt className="font-bold text-slate-500">Owner</dt><dd>{item.assignee_name || "Unassigned"}</dd></div><div><dt className="font-bold text-slate-500">Created by</dt><dd>{item.creator_name || `User #${item.created_by}`}</dd></div></dl>
                <p className="mt-3 text-sm text-slate-700">{item.resolution || item.created_reason}</p>
                {item.available_actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
                  <label className="min-w-52 text-xs font-bold text-slate-700">Follow-up owner
                    <select className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 font-normal" value={selectedOwners[item.id] ?? item.assignee_id ?? ""} onChange={(event) => setSelectedOwners((current) => ({ ...current, [item.id]: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {assignees.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                    </select>
                  </label>
                  <label className="w-full text-xs font-bold text-slate-700">Assignment or decision reason
                    <textarea aria-label={`Decision reason for ${item.title}`} rows={2} maxLength={1000} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" placeholder="Required for assignment, resolution, or cancellation; no patient details" value={decisionReasons[item.id] || ""} onChange={(event) => setDecisionReasons((current) => ({ ...current, [item.id]: event.target.value }))} />
                  </label>
                  {(item.status === 'open' || item.status === 'in_progress') && <button disabled={saving || !(selectedOwners[item.id] ?? item.assignee_id)} onClick={() => transition(item, 'in_progress', Number(selectedOwners[item.id] ?? item.assignee_id))} className="rounded-md bg-blue-700 px-3 py-2 text-xs font-bold text-white">{item.status === 'open' ? 'Assign and start' : 'Update owner'}</button>}
                  {item.status === 'in_progress' && <button disabled={saving} onClick={() => transition(item, 'open')} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold">Return to open</button>}
                  <button disabled={saving} onClick={() => transition(item, 'resolved')} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Resolve</button>
                  <button disabled={saving} onClick={() => transition(item, 'cancelled')} className="rounded-md border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700">Cancel</button>
                </div>}
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

export default AdminFollowUpsPage
