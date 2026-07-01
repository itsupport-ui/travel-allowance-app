import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import {
  FaSearch,
  FaCalendarAlt,
  FaCheckCircle,
  FaFileMedical,
  FaClock,
  FaNotesMedical,
  FaSlidersH,
} from "react-icons/fa"

import TherapistLayout from "../layouts/TherapistLayout"
import { getCompletedSchedules } from "../services/scheduleService"
import { exportSchedulePdf } from "../utils/pdfExport"

function TherapistCompletedSchedulesPage() {

  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  const [patientSearch, setPatientSearch] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("")

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {

    try {

      const token = localStorage.getItem("token")

      const data = await getCompletedSchedules(token)

      console.log("Fetched completed schedules:", data)
    
      setSchedules(
            Array.isArray(data) ? data : []
        )
    }
        catch (error) {
        console.error("Error fetching completed schedules:", error)
        toast.error("Failed to load completed schedules")
    } finally {
        setLoading(false)
    }
  }

    const filteredSchedules = (schedules || []).filter((schedule) => {
    
    const matchesPatient = schedule.patient_name
      .toLowerCase()
      .includes(patientSearch.toLowerCase())
    const matchesPriority =
      priorityFilter === "all" ||
      schedule.priority?.toLowerCase() === priorityFilter.toLowerCase()
    const matchesDate =
      !dateFilter || schedule.treatment_date === dateFilter

    return matchesPatient && matchesPriority && matchesDate
  })

  const getPriorityBadge = (priority) => {

    const base =
      "px-2.5 py-0.5 rounded-md text-xs font-semibold inline-block uppercase"

    switch (priority?.toLowerCase()) {

      case "high":
        return (
          <span className={`${base} bg-red-100 text-red-700`}>
            High
          </span>
        )

      case "important":
        return (
          <span className={`${base} bg-red-100 text-red-700`}>
            Important
          </span>
        )

      default:
        return (
          <span className={`${base} bg-blue-100 text-blue-700`}>
            Normal
          </span>
        )
    }
  }

  if (loading) {
    return (
      <TherapistLayout>
        <div className="flex justify-center py-20">
          Loading...
        </div>
      </TherapistLayout>
    )
  }

  return (
    <TherapistLayout>

      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4">

        {/* Header */}

        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                Completed Schedules
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                View completed treatments and submitted notes.
              </p>
            </div>
            <button
              onClick={() => exportSchedulePdf("Completed-Schedules", filteredSchedules)}
              disabled={filteredSchedules.length === 0}
              className="inline-flex items-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm mt-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download PDF
            </button>
          </div>
        </div>

        {/* Filters */}

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-6">

          <div className="flex items-center gap-2 mb-3">
            <FaSlidersH className="text-gray-400" />
            <span className="text-xs font-bold uppercase text-gray-500">
              Filters
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* Patient Search */}

            <div className="relative">
              <FaSearch className="absolute left-3 top-3 text-gray-400 text-xs" />

              <input
                type="text"
                placeholder="Search Patient"
                value={patientSearch}
                onChange={(e) =>
                  setPatientSearch(
                    e.target.value
                  )
                }
                className="w-full pl-9 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            {/* Priority */}

            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(
                  e.target.value
                )
              }
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">
                All Priorities
              </option>

              <option value="normal">
                Normal
              </option>

              <option value="important">
                Important
              </option>
            </select>

            {/* Date */}

            <input
              type="date"
              value={dateFilter}
              onChange={(e) =>
                setDateFilter(
                  e.target.value
                )
              }
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />

          </div>

        </div>

        {/* Results */}

        {filteredSchedules.length === 0 ? (

          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 border border-gray-100">
            No completed schedules found.
          </div>

        ) : (

          <div className="space-y-4">

            {filteredSchedules.map(
              (schedule) => (

                <div
                  key={schedule.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
                >

                  {/* Header */}

                  <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-4">

                    <div>

                      <span className="text-xs text-gray-400 uppercase font-bold">
                        Patient
                      </span>

                      <h2 className="text-lg font-bold text-gray-800">
                        {schedule.patient_name}
                      </h2>

                    </div>

                    <div className="text-right">

                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-xs font-bold">
                        COMPLETED
                      </span>

                    </div>

                  </div>

                  {/* Details */}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">

                    <div>
                      <span className="text-gray-400 block text-xs">
                        Doctor
                      </span>

                      <span className="font-semibold">
                        {schedule.doctor_name}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-xs">
                        Treatment
                      </span>

                      <span className="font-semibold">
                        {schedule.treatment_name}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-xs">
                        Date
                      </span>

                      <span className="font-semibold">
                        {schedule.treatment_date}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-xs">
                        Time
                      </span>

                      <span className="font-semibold">
                        {schedule.in_time} - {schedule.out_time}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-xs">
                        Priority
                      </span>

                      <div className="mt-1">
                        {getPriorityBadge(
                          schedule.priority
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-xs">
                        Completed At
                      </span>

                      <span className="font-semibold">
                        {schedule.completed_at || "-"}
                      </span>
                    </div>

                  </div>

                  {/* Completion Notes */}

                  <div className="mt-4">

                    <div className="flex items-center gap-2 mb-2">
                      <FaNotesMedical className="text-gray-400 text-xs" />

                      <span className="text-xs uppercase font-bold text-gray-400">
                        Completion Notes
                      </span>
                    </div>

                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-gray-700">
                      {schedule.completion_notes ||
                        "No completion notes provided"}
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        )}

      </div>

    </TherapistLayout>
  )
}

export default TherapistCompletedSchedulesPage