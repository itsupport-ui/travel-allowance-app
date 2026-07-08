import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import toast from "react-hot-toast"
import {
  FaArrowRight,
  FaCalendarCheck,
  FaFileInvoiceDollar,
  FaFileMedical,
  FaReceipt,
  FaStethoscope,
} from "react-icons/fa"
import DoctorLayout from "../layouts/DoctorLayout"
import { getDoctorDashboardSummary } from "../services/doctorDashboardService"

const initialSummary = {
  today_consultations: 0,
  today_visits: 0,
  pending_treatment_plans: 0,
  today_expenses: 0,
  pending_claims: 0,
}

const dashboardCards = [
  {
    key: "today_consultations",
    label: "Today's Consultations",
    description: "Review your scheduled patient calls",
    path: "/doctor/consultations",
    icon: FaStethoscope,
    iconClasses: "bg-blue-50 text-blue-600 group-hover:bg-blue-600",
  },
  {
    key: "today_visits",
    label: "Today's Visits",
    description: "Open today's assigned doctor visits",
    path: "/doctor/visits",
    icon: FaCalendarCheck,
    iconClasses:
      "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600",
  },
  {
    key: "pending_treatment_plans",
    label: "Pending Treatment Plans",
    description: "Track plans awaiting admin review",
    path: "/doctor/treatment-plans",
    icon: FaFileMedical,
    iconClasses: "bg-violet-50 text-violet-600 group-hover:bg-violet-600",
  },
  {
    key: "today_expenses",
    label: "Today's Expenses",
    description: "View today's submitted expense records",
    path: "/doctor/expenses",
    icon: FaReceipt,
    iconClasses: "bg-amber-50 text-amber-600 group-hover:bg-amber-600",
  },
  {
    key: "pending_claims",
    label: "Pending Claims",
    description: "Monitor claims waiting for approval",
    path: "/doctor/claims",
    icon: FaFileInvoiceDollar,
    iconClasses: "bg-rose-50 text-rose-600 group-hover:bg-rose-600",
  },
]

function DoctorDashboard() {
  const [summary, setSummary] = useState(initialSummary)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")

    getDoctorDashboardSummary(token)
      .then((data) => {
        setSummary({ ...initialSummary, ...data })
      })
      .catch((error) => {
        const message =
          error.response?.data?.detail || "Failed to load doctor dashboard"
        toast.error(message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  return (
    <DoctorLayout>
      <div className="mx-auto w-full max-w-7xl px-1 py-2 sm:px-4">
        <div className="mb-8 border-b border-slate-200/60 pb-5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Doctor Dashboard
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-400 sm:text-sm">
            Your consultations, visits, treatment plans, expenses, and claims.
          </p>
        </div>

        <h2 className="mb-4 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Today&apos;s workflow
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dashboardCards.map((card) => (
              <div
                key={card.key}
                className="h-40 animate-pulse rounded-2xl border border-slate-100 bg-slate-200"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dashboardCards.map((card) => {
              const Icon = card.icon

              return (
                <Link
                  key={card.key}
                  to={card.path}
                  className="group flex min-h-40 flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-tight text-slate-500">
                        {card.label}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        {card.description}
                      </p>
                    </div>
                    <div
                      className={`rounded-xl p-3 transition-colors group-hover:text-white ${card.iconClasses}`}
                    >
                      <Icon className="text-base" />
                    </div>
                  </div>

                  <div className="mt-5 flex items-end justify-between">
                    <p className="text-3xl font-extrabold text-slate-800">
                      {summary[card.key]}
                    </p>
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 transition-colors group-hover:text-blue-600">
                      View
                      <FaArrowRight className="text-[9px]" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </DoctorLayout>
  )
}

export default DoctorDashboard
