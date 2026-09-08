import { useEffect, useRef } from "react"


const focusableSelector = [
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",")


export default function LocationExceptionDialog({
  action = "punch_in",
  busy = false,
  onClose,
  onReasonChange,
  onSubmit,
  open,
  reason,
  targetLabel = "this field visit",
}) {
  const dialogRef = useRef(null)
  const reasonRef = useRef(null)
  const busyRef = useRef(busy)
  const closeRef = useRef(onClose)

  useEffect(() => {
    busyRef.current = busy
    closeRef.current = onClose
  }, [busy, onClose])

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    reasonRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== "Tab") return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(focusableSelector) || [],
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  const normalizedAction = action.replace("_", " ")
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <form
        ref={dialogRef}
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-exception-title"
        aria-describedby="location-exception-description"
      >
        <div>
          <h2 id="location-exception-title" className="text-lg font-bold text-slate-900">
            Request location exception
          </h2>
          <p id="location-exception-description" className="mt-1 text-xs leading-5 text-slate-500">
            A fresh GPS reading and your reason will be sent to an administrator. Approval is valid once for {normalizedAction} on {targetLabel}.
          </p>
        </div>
        <div>
          <label htmlFor="location-exception-reason" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Reason for exception
          </label>
          <textarea
            ref={reasonRef}
            id="location-exception-reason"
            rows="4"
            maxLength="500"
            minLength="10"
            required
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-50"
            placeholder="Example: GPS signal is blocked inside the apartment building."
          />
          <p className="mt-1 text-[10px] text-slate-400">{reason.length}/500 characters</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length < 10}
            className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "Capturing GPS..." : "Capture GPS & send"}
          </button>
        </div>
      </form>
    </div>
  )
}
