import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

import {
  finishPublicVisit,
  getPublicVisit,
  startPublicVisit,
} from "../services/publicVisitService"

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-base text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
const primaryButton =
  "w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-sm transition active:bg-blue-700 disabled:opacity-60"

const MAX_PHOTO_EDGE = 1600

const captureLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported by this browser."))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })

// The server rejects uploads over 5 MB and phone photos are often larger,
// so shrink to a 1600px JPEG before sending.
const compressPhoto = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.width, image.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) =>
          resolve(
            blob ? new File([blob], "proof.jpg", { type: "image/jpeg" }) : file,
          ),
        "image/jpeg",
        0.8,
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    image.src = url
  })

const formatDate = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))

const formatClock = (value) => {
  if (!value) return null
  const [hours, minutes] = value.split(":")
  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

const errorInfo = (error) => ({
  status: error?.response?.status,
  code: error?.response?.data?.code,
  message:
    (typeof error?.response?.data?.detail === "string" &&
      error.response.data.detail) ||
    "Something went wrong. Please try again.",
})

const STATUS_TEXT = {
  completed: {
    title: "Visit submitted",
    text: "Thank you. The clinic will review it and arrange your payment.",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  approved: {
    title: "Visit approved",
    text: "Your payment is being arranged.",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  paid: {
    title: "Payment done",
    text: "This visit has been paid. Thank you.",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-600 px-4 py-4 text-white">
        <div className="mx-auto max-w-md text-lg font-bold">Home visit</div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-5">{children}</main>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-0.5 text-base text-slate-800">{children}</div>
    </div>
  )
}

function FreelanceVisitPage() {
  const { token } = useParams()
  const [visit, setVisit] = useState(null)
  const [state, setState] = useState("loading") // loading | ready | invalid | error
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")
  const [needReason, setNeedReason] = useState("")
  const [message, setMessage] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getPublicVisit(token)
      .then((data) => {
        if (cancelled) return
        setVisit(data)
        setState("ready")
      })
      .catch((error) => {
        if (cancelled) return
        setState(error?.response?.status === 404 ? "invalid" : "error")
      })
    return () => {
      cancelled = true
    }
  }, [token, reloadKey])

  useEffect(() => {
    // The link is a secret: keep it out of search results.
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex,nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const readLocation = async () => {
    try {
      const position = await captureLocation()
      return {
        fields: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gps_accuracy_m: Math.max(position.coords.accuracy || 1, 1),
          device_timestamp: new Date(position.timestamp).toISOString(),
        },
        problem: "",
      }
    } catch (error) {
      return {
        fields: {},
        problem:
          error?.code === 1
            ? "Location permission is blocked. Allow location for this site in your browser settings, or give a reason below."
            : "Your location could not be read. Move near a window or enable GPS, or give a reason below.",
      }
    }
  }

  const submit = async (action) => {
    setMessage("")
    if (action === "finish" && !photo) {
      setMessage("Take a photo as proof before finishing.")
      return
    }
    setBusy(true)
    try {
      const { fields, problem } = await readLocation()
      const payload = { ...fields, reason: reason.trim() }
      if (action === "finish") payload.notes = notes.trim()
      if (problem && payload.reason.length < 3) {
        setNeedReason(problem)
        return
      }
      const updated =
        action === "start"
          ? await startPublicVisit(token, payload)
          : await finishPublicVisit(token, payload, await compressPhoto(photo))
      setVisit(updated)
      setNeedReason("")
      setReason("")
      if (action === "finish") {
        setPhoto(null)
        setNotes("")
      }
    } catch (error) {
      const info = errorInfo(error)
      if (info.code === "LOCATION_REASON_REQUIRED") {
        setNeedReason(info.message)
      } else if (info.status === 404) {
        setState("invalid")
      } else if (info.status === 429) {
        setMessage("Too many attempts. Please wait a minute and try again.")
      } else {
        setMessage(info.message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (state === "loading") {
    return (
      <Shell>
        <p className="py-10 text-center text-slate-500">Loading your visit…</p>
      </Shell>
    )
  }

  if (state === "invalid") {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Link not valid</h1>
          <p className="mt-2 text-sm text-slate-600">
            This link has expired or was cancelled. Please contact the clinic
            for a new one.
          </p>
        </div>
      </Shell>
    )
  }

  if (state === "error" || !visit) {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Could not load</h1>
          <p className="mt-2 text-sm text-slate-600">
            Check your internet connection and try again.
          </p>
          <button
            type="button"
            className={`${primaryButton} mt-4`}
            onClick={() => {
              setState("loading")
              setReloadKey((value) => value + 1)
            }}
          >
            Retry
          </button>
        </div>
      </Shell>
    )
  }

  const done = STATUS_TEXT[visit.status]
  const time = [formatClock(visit.start_time), formatClock(visit.end_time)]
    .filter(Boolean)
    .join(" – ")

  return (
    <Shell>
      <p className="text-sm text-slate-600">Hello {visit.freelancer_name},</p>

      {done && (
        <div className={`rounded-2xl border p-4 ${done.tone}`}>
          <p className="font-bold">{done.title}</p>
          <p className="mt-1 text-sm">{done.text}</p>
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <Row label="Patient">
          <span className="font-semibold">{visit.patient_name}</span>
        </Row>
        {visit.patient_phone && (
          <Row label="Patient phone">
            <a className="font-semibold text-blue-700" href={`tel:${visit.patient_phone}`}>
              {visit.patient_phone}
            </a>
          </Row>
        )}
        <Row label="Address">
          <p>{visit.patient_address}</p>
          <a
            href={visit.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="mt-2 inline-block rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700"
          >
            Open in Maps
          </a>
        </Row>
        <Row label="Treatment">{visit.treatment_name}</Row>
        <Row label="When">
          {formatDate(visit.visit_date)}
          {time && <span className="text-slate-500"> · {time}</span>}
        </Row>
        {visit.instructions && <Row label="Instructions">{visit.instructions}</Row>}
        <Row label="Your fee">
          <span className="font-bold">Rs {Number(visit.fee_amount).toFixed(0)}</span>
        </Row>
      </section>

      {(visit.status === "assigned" || visit.status === "in_progress") && (
        <section className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {visit.status === "in_progress" && (
            <>
              <p className="text-sm font-semibold text-emerald-700">
                Visit started
                {visit.punch_in_time &&
                  ` at ${new Date(visit.punch_in_time).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`}
              </p>
              <label className="block text-sm font-bold text-slate-700">
                Photo proof (required)
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                  className="mt-2 block w-full text-sm"
                />
              </label>
              {photo && <p className="text-xs text-slate-500">Selected: {photo.name}</p>}
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes (optional)"
                maxLength={1000}
                className={inputClass}
              />
            </>
          )}

          {needReason && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">{needReason}</p>
              <textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (for example: GPS is off, gate on another street)"
                maxLength={300}
                className={inputClass}
              />
              <p className="text-xs text-amber-800">
                The clinic will check this before approving your visit.
              </p>
            </div>
          )}

          {message && <p className="text-sm font-medium text-red-600">{message}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={() => submit(visit.status === "assigned" ? "start" : "finish")}
            className={primaryButton}
          >
            {busy
              ? "Please wait…"
              : needReason
                ? visit.status === "assigned"
                  ? "Start visit anyway"
                  : "Finish visit anyway"
                : visit.status === "assigned"
                  ? "Start visit"
                  : "Finish visit"}
          </button>
          <p className="text-center text-xs text-slate-400">
            Allow location when your phone asks. Be at the patient&apos;s address.
          </p>
        </section>
      )}
    </Shell>
  )
}

export default FreelanceVisitPage
