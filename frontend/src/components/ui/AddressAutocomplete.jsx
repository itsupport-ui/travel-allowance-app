import { useEffect, useRef, useState } from "react"

import { getAddressSuggestions, getPlaceLocation } from "../../services/mapsService"

const newSessionToken = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

const hasPin = (latitude, longitude) =>
  typeof latitude === "number" && typeof longitude === "number"

/**
 * Address box with Google-style suggestions while typing.
 *
 * Picking a suggestion sets the exact map pin (latitude/longitude), which is
 * what punch-in is checked against. Typing by hand clears the pin, and the
 * server then falls back to geocoding the text, which is often only accurate
 * to the area for house addresses.
 *
 * onChange receives { address, latitude, longitude }.
 */
function AddressAutocomplete({
  value,
  latitude = null,
  longitude = null,
  onChange,
  className = "",
  placeholder = "Start typing the address, then pick it from the list",
  required = false,
  rows = 2,
}) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [query, setQuery] = useState("")
  const sessionToken = useRef(newSessionToken())
  const wrapperRef = useRef(null)

  // Fetch suggestions only for text the user typed (never for a picked value).
  useEffect(() => {
    if (query.trim().length < 3) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      getAddressSuggestions(query.trim(), sessionToken.current)
        .then((items) => {
          if (cancelled) return
          setSuggestions(items)
          setOpen(items.length > 0)
        })
        .catch(() => {
          // Suggestions are a convenience: typing by hand still works.
          if (!cancelled) setSuggestions([])
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    const close = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const handleType = (event) => {
    const text = event.target.value
    setQuery(text)
    if (text.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
    }
    onChange({ address: text, latitude: null, longitude: null })
  }

  const pick = async (suggestion) => {
    setOpen(false)
    setSuggestions([])
    setQuery("")
    setResolving(true)
    try {
      const place = await getPlaceLocation(suggestion.place_id, sessionToken.current)
      onChange({
        address: place.address || suggestion.description,
        latitude: place.latitude,
        longitude: place.longitude,
      })
    } catch {
      onChange({ address: suggestion.description, latitude: null, longitude: null })
    } finally {
      setResolving(false)
      // A session covers one search + one pick; start a fresh one.
      sessionToken.current = newSessionToken()
    }
  }

  const pinned = hasPin(latitude, longitude)

  return (
    <div ref={wrapperRef} className="relative">
      <textarea
        rows={rows}
        value={value}
        onChange={handleType}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.place_id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(suggestion)}
                className="block w-full px-4 py-2.5 text-left hover:bg-blue-50"
              >
                <span className="block text-sm font-semibold text-slate-800">
                  {suggestion.main_text || suggestion.description}
                </span>
                {suggestion.secondary_text && (
                  <span className="block text-xs text-slate-500">{suggestion.secondary_text}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-1 text-xs font-semibold normal-case tracking-normal ${pinned ? "text-emerald-700" : "text-amber-700"}`}>
        {resolving
          ? "Getting the exact location..."
          : pinned
          ? "Exact map pin set."
          : value?.trim()
          ? "No exact pin. Pick the address from the suggestions so punch-in works at the patient's door."
          : ""}
        {pinned && (
          <>
            {" "}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline"
            >
              Check on map
            </a>
          </>
        )}
      </p>
    </div>
  )
}

export default AddressAutocomplete
