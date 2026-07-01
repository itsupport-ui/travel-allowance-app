import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import toast from "react-hot-toast"

import AdminLayout from "../layouts/AdminLayout"

import {
  getScheduleDetails,
  getDoctors,
  getTherapists,
  updateSchedule
} from "../services/scheduleService"

function AdminEditSchedulePage() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [doctors, setDoctors] = useState([])
  const [therapists, setTherapists] = useState([])
  const [formData, setFormData] = useState({
    patient_name: "",
    doctor_id: "",
    therapist_id: "",
    treatment_name: "",
    medicine: "",
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
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const token = localStorage.getItem("token")
      const schedule = await getScheduleDetails(id, token)
      const doctorsData = await getDoctors(token)
      const therapistsData = await getTherapists(token)
      setDoctors(doctorsData)
      setTherapists(therapistsData)

      setFormData({
        patient_name: schedule.patient_name || "",
        doctor_id: schedule.doctor_id || "",
        therapist_id: schedule.therapist_id || "",
        treatment_name: schedule.treatment_name || "",
        medicines: schedule.medicines || "",
        patient_address: schedule.patient_address || "",
        schedule_type: schedule.schedule_type || "one_time",
        treatment_date: schedule.treatment_date || "",
        start_date: schedule.start_date || "",
        end_date: schedule.end_date || "",
        in_time: schedule.in_time ? schedule.in_time.slice(0, 5) : "",
        out_time: schedule.out_time ? schedule.out_time.slice(0, 5) : "", 
        instructions: schedule.instructions || "",
        priority: schedule.priority || "normal"
      })
    } catch (error) {
      console.error(error)
      toast.error("Failed to load schedule details")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem("token")

      const payload = {
        ...formData,
        doctor_id: Number(formData.doctor_id),
        therapist_id: Number(formData.therapist_id),
        start_date: formData.schedule_type === "recurring" ? formData.start_date : null,
        end_date: formData.schedule_type === "recurring" ? formData.end_date : null,
        treatment_date: formData.schedule_type === "one_time" ? formData.treatment_date : null
      }

      await updateSchedule(id, payload, token)
      toast.success("Schedule updated successfully")
      navigate(`/admin/schedule/${id}`) // Fixed string interpolation here
    } catch (error) {
      console.error(error)
      toast.error("Failed to update schedule")
    }
  }

//   if onetime is selected, show treatment_date and hide start_date and end_date
//   if recurring is selected, show start_date and end_date and hide treatment_date
// help me with the code

  const handleScheduleTypeChange = (e) => {
    const value = e.target.value
    setFormData({
        ...formData,
        schedule_type: value,
        treatment_date: value === "one_time" ? formData.treatment_date : "",
        start_date: value === "recurring" ? formData.start_date : "",
        end_date: value === "recurring" ? formData.end_date : ""
    })
  }


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const labelClasses = "block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-0.5"
  const inputClasses = "w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64 w-full">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto px-1 sm:px-4 py-2">
        
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
            Edit Schedule
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Modify core patient data, reassignment configurations, or timeline windows.
          </p>
        </div>

        {/* Integrated Clean Form Block */}
        <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-gray-100 shadow-sm rounded-2xl p-4 sm:p-6">
          
          {/* Group 1: Core Identification Contexts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Patient Name</label>
              <input
                type="text"
                name="patient_name"
                value={formData.patient_name}  
                onChange={handleChange}
                className={inputClasses}
                placeholder="Patient Full Name"
                required
              />
            </div>

            <div>
              <label className={labelClasses}>Treatment Identifier</label>
              <input 
                type="text"
                name="treatment_name"
                value={formData.treatment_name}
                onChange={handleChange}
                className={inputClasses}
                placeholder="Treatment Name"
                required
              />
            </div>
          </div>

          {/* Group 2: Medical Staff Rules Assignments */}
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
                    {therapist.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Group 3: Medication Metrics */}
          <div>
            <label className={labelClasses}>Prescribed Medicines</label>
            <input
              type="text"
              name="medicines"
              value={formData.medicines}
              onChange={handleChange}
              className={inputClasses}
              placeholder="Medicines and dosages (Optional)"
            />
                
          </div>


          {/* Group 4: Target Execution Routing Address */}
          <div>
            <label className={labelClasses}>Patient Execution Address</label>
            <textarea
              name="patient_address"
              value={formData.patient_address}
              onChange={handleChange}
              className={`${inputClasses} resize-none`}
              rows="2"
              placeholder="Patient Destination Address"
            ></textarea>
          </div>

          <hr className="border-gray-100 my-2" />

          {/* Group 5: Scheduling Timelines Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Schedule Pattern Configuration</label>
              <select
                name="schedule_type"
                value={formData.schedule_type}
                onChange={handleScheduleTypeChange}
                className={inputClasses}
              >
                <option value="one_time">One_Time</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>

            <div>
              {formData.schedule_type === "one_time" ? (
                <>
                  <label className={labelClasses}>Treatment Date</label>
                  <input
                    type="date"
                    name="treatment_date"
                    value={formData.treatment_date}
                    onChange={handleChange}
                    className={inputClasses}
                    required
                  />
                </>
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
          </div>

          {/* Group 6: Expected Operating Windows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-2">
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

            <div>
              <label className={labelClasses}>Priority Tier Rule</label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className={inputClasses}
              >
                <option value="normal">Normal</option>
                <option value="important">Important</option>
              </select>
            </div>
          </div>

          {/* Group 7: Custom Directives Block */}
          <div>
            <label className={labelClasses}>Special Care Instructions</label>
            <textarea
              name="instructions"
              value={formData.instructions}
              onChange={handleChange}
              className={`${inputClasses} resize-none`}
              rows="3"
              placeholder="Provide clinical context rules or validation terminal instructions for the field therapist..."
            ></textarea>
          </div>

          {/* Dynamic Interactive Action Buttons Terminal */}
          <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 pt-3 border-t border-gray-50">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full sm:w-32 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-5 py-2.5 rounded-xl font-semibold transition text-sm shadow-sm text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-44 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition text-sm shadow-md active:scale-[0.99] text-center"
            >
              Update Schedule
            </button>
          </div>

        </form>

      </div>
    </AdminLayout>
  )
}

export default AdminEditSchedulePage
