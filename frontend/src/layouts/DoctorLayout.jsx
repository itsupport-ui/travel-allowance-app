import { useCallback, useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  FaBars,
  FaCalendarCheck,
  FaFileInvoiceDollar,
  FaFileMedical,
  FaHome,
  FaReceipt,
  FaSignOutAlt,
  FaStethoscope,
  FaTimes,
  FaPlay,
  FaStopCircle,
  FaUserMd,
  FaUserCircle,
} from "react-icons/fa"
import { hasPermission } from "../utils/permissions"
import toast from "react-hot-toast"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import { reverseGeocode } from "../services/mapsService"
import {
  endDoctorWorkDay,
  getTodayDoctorWorkDay,
  startDoctorWorkDay,
} from "../services/workdayService"

const navigationItems = [
  { path: "/doctor", label: "Dashboard", icon: FaHome },
  {
    path: "/doctor/consultations",
    label: "Consultations",
    icon: FaStethoscope,
    permission: "consultations.own",
  },
  {
    path: "/doctor/visits",
    label: "Visits",
    icon: FaCalendarCheck,
    permission: "doctor_visits.own",
  },
  {
    path: "/doctor/treatment-plans",
    label: "Treatment Plans",
    icon: FaFileMedical,
    permission: "treatment_plans.create",
  },
  {
    path: "/doctor/expenses",
    label: "Expenses",
    icon: FaReceipt,
    permission: "doctor_expenses.manage",
  },
  {
    path: "/doctor/claims",
    label: "Claims",
    icon: FaFileInvoiceDollar,
    permission: "doctor_claims.submit",
  },
  {
    path: "/doctor/profile",
    label: "Profile",
    icon: FaUserCircle,
  },
]

function DoctorLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [workday, setWorkday] = useState(null)
  const [startingDay, setStartingDay] = useState(false)
  const [endingDay, setEndingDay] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)

  const captureLocation = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Location is not supported by this browser"))
          return
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      }),
    []
  )

  const loadWorkday = useCallback(async () => {
    try {
      const data = await getTodayDoctorWorkDay(
        localStorage.getItem("token")
      )
      setWorkday(data)
      if (data.is_active && data.should_prompt_end) {
        setConfirmingEnd(true)
      }
    } catch (error) {
      console.error("Unable to load doctor workday:", error)
    }
  }, [])

  useEffect(() => {
    // Synchronize the server-owned attendance state when the shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkday()
  }, [loadWorkday])

  const closeSidebar = () => setSidebarOpen(false)

  const handleLogout = () => {
    if (workday?.is_active && workday.can_end_workday) {
      setConfirmingEnd(true)
      return
    }
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    localStorage.removeItem("permissions")
    navigate("/")
  }

  const handleStartDay = async () => {
    try {
      setStartingDay(true)
      const position = await captureLocation()
      const token = localStorage.getItem("token")
      let address =
        `${position.coords.latitude}, ${position.coords.longitude}`
      try {
        const result = await reverseGeocode(
          position.coords.latitude,
          position.coords.longitude,
          token
        )
        address = result.address || address
      } catch {
        // Coordinates remain the attendance source of truth.
      }
      await startDoctorWorkDay(token, {
        start_address: address,
        start_latitude: position.coords.latitude,
        start_longitude: position.coords.longitude,
      })
      await loadWorkday()
      toast.success("Doctor workday started")
    } catch (error) {
      toast.error(error.message || "Unable to start workday")
    } finally {
      setStartingDay(false)
    }
  }

  const handleEndDay = useCallback(async () => {
    try {
      setEndingDay(true)
      const position = await captureLocation()
      const token = localStorage.getItem("token")
      let endAddress
      try {
        const result = await reverseGeocode(
          position.coords.latitude,
          position.coords.longitude,
          token
        )
        endAddress = result.address
      } catch {
        endAddress = undefined
      }
      const result = await endDoctorWorkDay(token, {
        end_address: endAddress,
        end_latitude: position.coords.latitude,
        end_longitude: position.coords.longitude,
      })
      toast.success(
        `Workday ended: ${result.completed_visits_count} completed, ${result.pending_visits_count} pending`
      )
      localStorage.removeItem("token")
      localStorage.removeItem("role")
      localStorage.removeItem("permissions")
      navigate("/")
    } catch (error) {
      toast.error(error.message || "Unable to end workday")
    } finally {
      setEndingDay(false)
    }
  }, [captureLocation, navigate])

  useEffect(() => {
    if (
      !workday?.is_active ||
      !workday.auto_logout_enabled ||
      !workday.should_prompt_end
    ) {
      return undefined
    }
    const timeout = window.setTimeout(
      () => void handleEndDay(),
      workday.auto_logout_grace_minutes * 60_000
    )
    return () => window.clearTimeout(timeout)
  }, [
    handleEndDay,
    workday?.auto_logout_enabled,
    workday?.auto_logout_grace_minutes,
    workday?.is_active,
    workday?.should_prompt_end,
  ])

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans antialiased">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
            <FaUserMd className="text-sm" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-800">
            Doctor Panel
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          aria-label="Open navigation menu"
        >
          <FaBars className="text-lg" />
        </button>
      </header>

      {sidebarOpen && (
        <button
          type="button"
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white p-5 transition-transform duration-300 md:relative md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <FaUserMd className="text-base" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Doctor Portal
              </h1>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Clinical Staff
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={closeSidebar}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 md:hidden"
            aria-label="Close navigation menu"
          >
            <FaTimes className="text-base" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {navigationItems
            .filter(
              (item) =>
                !item.permission ||
                hasPermission(item.permission)
            )
            .map((item) => {
            const Icon = item.icon
            const isActive =
              item.path === "/doctor"
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 shadow-sm shadow-blue-50/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`text-sm ${
                    isActive ? "text-blue-600" : "text-slate-400"
                  }`}
                />
                {item.label}
              </Link>
            )
            })}
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-2.5 px-2 py-1">
            <FaUserMd className="text-2xl text-slate-300" />
            <div className="truncate">
              <p className="truncate text-xs font-bold text-slate-800">
                Doctor User
              </p>
              <p className="truncate text-[10px] font-medium text-slate-400">
                Authenticated session
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 active:scale-[0.98]"
          >
            <FaSignOutAlt className="text-sm" />
            Logout Session
          </button>
        </div>
      </aside>

      <main className="flex min-h-screen w-full max-w-full flex-1 flex-col overflow-x-hidden p-4 pt-20 md:p-8">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">
              Doctor attendance
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {workday?.is_active
                ? `Active since ${new Date(
                    workday.started_at
                  ).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : workday?.started
                  ? "Workday completed"
                  : "Workday not started"}
              {workday?.is_active && !workday.can_end_workday
                ? ` · End available at ${workday.workday_end_time}`
                : ""}
            </p>
          </div>
          {!workday?.started ? (
            <button
              type="button"
              disabled={startingDay}
              onClick={handleStartDay}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <FaPlay />
              {startingDay ? "Starting..." : "Start Work Day"}
            </button>
          ) : workday.is_active && workday.can_end_workday ? (
            <button
              type="button"
              disabled={endingDay}
              onClick={() => setConfirmingEnd(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-800 disabled:opacity-50"
            >
              <FaStopCircle />
              {endingDay ? "Ending..." : "End Work Day"}
            </button>
          ) : null}
        </div>
        <div className="h-full w-full flex-1">{children}</div>
      </main>
      <ConfirmDialog
        open={confirmingEnd}
        title="Your workday has ended"
        message="End attendance and log out. Active visits must be punched out first."
        confirmLabel="End Work Day"
        destructive
        busy={endingDay}
        onClose={() => setConfirmingEnd(false)}
        onConfirm={handleEndDay}
      />
    </div>
  )
}

export default DoctorLayout
