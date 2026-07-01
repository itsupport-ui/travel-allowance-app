import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"

import {
  getDoctors,
  getTherapists,
  createSchedule
} from "../services/scheduleService"

function AdminCreateSchedulePage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [doctors, setDoctors] = useState([])
  const [therapists, setTherapists] = useState([])

  const [formData, setFormData] = useState({
    patient_name: "",
    doctor_id: "",
    therapist_id: "",
    treatment_name: "",
    medicines: "",
    patient_address: "",
    schedule_type: "one_time",
    treatment_date: "",
    start_date: "",
    end_date: "",
    in_time: "",
    out_time: "",
    instructions: "",
    priority: "normal"
  })

  useEffect(() => {
    loadDropdowns()
  }, [])

  const loadDropdowns = async () => {
    try {
      const token = localStorage.getItem("token")
      const doctorData = await getDoctors(token)
      const therapistData = await getTherapists(token)

      setDoctors(doctorData)
      setTherapists(therapistData)
    } catch (error) {
      console.error(error)
      toast.error("Failed to load dropdowns")
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const resetForm = () => {
    setFormData({
      patient_name: "",
      doctor_id: "",
      therapist_id: "",
      treatment_name: "",
      medicines: "",
      patient_address: "",
      schedule_type: "one_time",
      treatment_date: "",
      start_date: "",
      end_date: "",
      in_time: "",
      out_time: "",
      instructions: "",
      priority: "normal"
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      setLoading(true)
      const token = localStorage.getItem("token")

      const payload = {
        ...formData,
        doctor_id: Number(formData.doctor_id),
        therapist_id: Number(formData.therapist_id),
        start_date: formData.schedule_type === "recurring" ? formData.start_date : null,
        end_date: formData.schedule_type === "recurring" ? formData.end_date : null,
        treatment_date: formData.schedule_type === "one_time" ? formData.treatment_date : null
      }

      await createSchedule(payload, token)
      toast.success("Schedule created successfully")
      resetForm()
      navigate("/admin/schedule/today")
    } catch (error) {
      console.error(error)
      toast.error("Failed to create schedule")
    } finally {
      setLoading(false)
    }
  }

  const inputClasses = "w-full border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none text-sm font-medium shadow-sm"
  const labelClasses = "block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-0.5"

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto px-1 sm:px-4 py-2">
        
        {/* Page Header Header Terminal Block */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            Create Schedule
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Assign treatments, set logistics, and route clinical staff schedules.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Card 1: Patient & Case Context Information */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-800 border-b border-gray-50 pb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-blue-500 rounded-sm inline-block"></span>
              Case Assignment Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>Patient Name</label>
                <input
                  type="text"
                  name="patient_name"
                  placeholder="Enter full name"
                  value={formData.patient_name}
                  onChange={handleChange}
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className={labelClasses}>Treatment Name</label>
                <input
                  type="text"
                  name="treatment_name"
                  placeholder="e.g. Physiotherapy Session"
                  value={formData.treatment_name}
                  onChange={handleChange}
                  className={inputClasses}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>Assigned Doctor</label>
                <select
                  name="doctor_id"
                  value={formData.doctor_id}
                  onChange={handleChange}
                  className={inputClasses}
                  required
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClasses}>Assigned Therapist</label>
                <select
                  name="therapist_id"
                  value={formData.therapist_id}
                  onChange={handleChange}
                  className={inputClasses}
                  required
                >
                  <option value="">Select Therapist</option>
                  {therapists.map((therapist) => (
                    <option key={therapist.id} value={therapist.id}>
                      {therapist.username || therapist.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClasses}>Patient Address</label>
              <textarea
                rows="2"
                name="patient_address"
                placeholder="Enter complete residential routing address"
                value={formData.patient_address}
                onChange={handleChange}
                className={`${inputClasses} resize-none`}
              />
            </div>
          </div>


          {/* Card 2: Schedule, Timing, and Logistics Block */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-800 border-b border-gray-50 pb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-sm inline-block"></span>
              Logistics &amp; Scheduling
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>Schedule Configuration</label>
                <select
                  name="schedule_type"
                  value={formData.schedule_type}
                  onChange={handleChange}
                  className={inputClasses}
                >
                  <option value="one_time">One Time Visit</option>
                  <option value="recurring">Recurring Schedule Range</option>
                </select>
              </div>

              {/* Dynamic rendering matching split column frameworks */}
              {formData.schedule_type === "one_time" ? (
                <div>
                  <label className={labelClasses}>Treatment Date</label>
                  <input
                    type="date"
                    name="treatment_date"
                    value={formData.treatment_date}
                    onChange={handleChange}
                    className={inputClasses}
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClasses}>Start Date</label>
                    <input
                      type="date"
                      name="start_date"
                      value={formData.start_date}
                      onChange={handleChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>End Date</label>
                    <input
                      type="date"
                      name="end_date"
                      value={formData.end_date}
                      onChange={handleChange}
                      className={inputClasses}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>Expected In-Time</label>
                <input
                  type="time"
                  name="in_time"
                  value={formData.in_time}
                  onChange={handleChange}
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className={labelClasses}>Expected Out-Time</label>
                <input
                  type="time"
                  name="out_time"
                  value={formData.out_time}
                  onChange={handleChange}
                  className={inputClasses}
                  required
                />
              </div>
            </div>
          </div>


          {/* Card 3: Clinical Care Notes & Priority Handling */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-800 border-b border-gray-50 pb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-500 rounded-sm inline-block"></span>
              Clinical Requirements
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelClasses}>Prescribed Medicines</label>
                <input
                  type="text"
                  name="medicines"
                  placeholder="List critical medicines if any"
                  value={formData.medicines}
                  onChange={handleChange}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className={labelClasses}>Routing Priority</label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  className={`${inputClasses} font-semibold ${
                    formData.priority === "important" ? "text-amber-700 bg-amber-50/50" : "text-gray-800"
                  }`}
                >
                  <option value="normal">Normal Priority</option>
                  <option value="important">⚠️ High Priority / Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClasses}>Special Care Instructions</label>
              <textarea
                rows="3"
                name="instructions"
                placeholder="Note down operational variables, medical background parameters, or routing directive markers..."
                value={formData.instructions}
                onChange={handleChange}
                className={`${inputClasses} resize-none`}
              />
            </div>
          </div>

          {/* Action Submission Bar Terminal Block */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-48 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md active:scale-[0.99] text-sm tracking-wide flex justify-center items-center h-11"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                "Create Schedule"
              )}
            </button>
          </div>

        </form>
      </div>
    </AdminLayout>
  )
}

export default AdminCreateSchedulePage
