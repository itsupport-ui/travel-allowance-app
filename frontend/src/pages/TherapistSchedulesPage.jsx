import { useSearchParams } from "react-router-dom"
import {
  FaCalendarAlt,
  FaCalendarCheck,
  FaCalendarDay,
  FaCalendarTimes,
} from "react-icons/fa"

import TherapistLayout from "../layouts/TherapistLayout"
import TodaysSchedulePage from "./TodaysSchedulePage"
import UpcomingSchedulePage from "./UpcomingSchedulePage"
import TherapistCompletedSchedulesPage from "./TherapistCompletedSchedulesPage"
import TherapistMissedSchedulesPage from "./TherapistMissedSchedulesPage"

const views = [
  {
    id: "today",
    label: "Today",
    description: "Start, complete, or mark today's visits",
    icon: FaCalendarDay,
    component: TodaysSchedulePage,
  },
  {
    id: "upcoming",
    label: "Upcoming",
    description: "Review future assigned visits",
    icon: FaCalendarAlt,
    component: UpcomingSchedulePage,
  },
  {
    id: "completed",
    label: "Completed",
    description: "Review completed visits and notes",
    icon: FaCalendarCheck,
    component: TherapistCompletedSchedulesPage,
  },
  {
    id: "missed",
    label: "Missed",
    description: "Review missed visits and exceptions",
    icon: FaCalendarTimes,
    component: TherapistMissedSchedulesPage,
  },
]

function TherapistSchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get("view")
  const activeView = views.find((view) => view.id === requestedView) || views[0]
  const ActivePage = activeView.component

  const selectView = (viewId) => {
    setSearchParams({ view: viewId })
  }

  return (
    <TherapistLayout>
      <div className="mx-auto w-full max-w-5xl px-1 py-2 sm:px-4">
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
            Clinical workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            My Schedules
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">
            Manage today&apos;s treatments and review upcoming or historical visits in one place.
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Schedule views"
          className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-4"
        >
          {views.map((view) => {
            const Icon = view.icon
            const selected = view.id === activeView.id
            return (
              <button
                key={view.id}
                id={`schedule-tab-${view.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="schedule-view-panel"
                onClick={() => selectView(view.id)}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                  selected
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon aria-hidden="true" />
                <span>{view.label}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900">
          <span className="font-bold">{activeView.label}:</span>{" "}
          {activeView.description}.
        </div>

        <section
          id="schedule-view-panel"
          role="tabpanel"
          aria-labelledby={`schedule-tab-${activeView.id}`}
          tabIndex={0}
          className="focus:outline-none"
        >
          <ActivePage embedded />
        </section>
      </div>
    </TherapistLayout>
  )
}

export default TherapistSchedulesPage
