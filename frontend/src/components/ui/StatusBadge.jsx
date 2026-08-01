const statusStyles = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-600/20",
  scheduled: "bg-blue-50 text-blue-700 ring-blue-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  high: "bg-rose-50 text-rose-700 ring-rose-600/20",
  urgent: "bg-rose-50 text-rose-700 ring-rose-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-500/20",
  canceled: "bg-slate-100 text-slate-600 ring-slate-500/20",
  missed: "bg-slate-100 text-slate-600 ring-slate-500/20",
  inactive: "bg-slate-100 text-slate-600 ring-slate-500/20",
  normal: "bg-slate-100 text-slate-600 ring-slate-500/20",
}

function StatusBadge({ status, label }) {
  const normalized = String(status || "unknown").toLowerCase()

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${
        statusStyles[normalized] || statusStyles.normal
      }`}
    >
      {label || normalized.replaceAll("_", " ")}
    </span>
  )
}

export default StatusBadge
