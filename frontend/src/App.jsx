import LoginPage from "./pages/LoginPage"
import { Route, Routes, BrowserRouter } from "react-router-dom"

import AdminDashboard from "./pages/AdminDashboard"
import TherapistDashboard from "./pages/TherapistDashboard"
import AddTravelPage from "./pages/AddTravelPage"
import TodayTravelPage from "./pages/TodayTravelPage"
import TravelDetailsPage from "./pages/TravelDetailsPage"
import MyClaimsPage from "./pages/MyClaimsPage"
import ProtectedRoute from "./components/ProtectedRoute"
import PendingClaimsPage from "./pages/PendingClaimsPage"
import SettingsPage from "./pages/SettingsPage"
import RegisterUserPage from "./pages/RegisterUserPage"
import ClaimHistoryPage from "./pages/ClaimHistoryPage"
import AdminClaimDetailsPage from "./pages/AdminClaimDetailsPage"
import TherapistClaimDetailsPage from "./pages/TherapistClaimDetailsPage"
import TodaysSchedulePage from "./pages/TodaysSchedulePage"
import UpcomingSchedulePage from "./pages/UpcomingSchedulePage"
import AdminTodaySchedulePage from "./pages/AdminTodaySchedulePage"
import AdminCreateSchedulePage from "./pages/AdminCreateSchedulePage"
import AdminScheduleDetailsPage from "./pages/AdminScheduleDetailsPage"
import AdminEditSchedulePage from "./pages/AdminEditSchedulePage"
import AdminPendingSchedulesPage from "./pages/AdminPendingSchedulesPage"
import AdminCompletedSchedulesPage from "./pages/AdminCompletedSchedulesPage"
import AdminMissedSchedulesPage from "./pages/AdminMissedSchedulesPage"
import TherapistMissedSchedulesPage from "./pages/TherapistMissedSchedulesPage"
import TherapistCompletedSchedulesPage from "./pages/TherapistCompletedSchedulesPage"
import AdminDoctorConsultationsPage from "./pages/AdminDoctorConsultationsPage"
import AdminTreatmentPlansPage from "./pages/AdminTreatmentPlansPage"
import DoctorDashboard from "./pages/DoctorDashboard"
import DoctorConsultationsPage from "./pages/DoctorConsultationsPage"
import DoctorVisitsPage from "./pages/DoctorVisitsPage"
import DoctorTreatmentPlansPage from "./pages/DoctorTreatmentPlansPage"
import DoctorExpensesPage from "./pages/DoctorExpensesPage"
import DoctorClaimsPage from "./pages/DoctorClaimsPage"
import AdminDoctorClaimsPage from "./pages/AdminDoctorClaimsPage"


function App() {
  return (
    <BrowserRouter>
    
      <Routes>

        <Route path="/" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedRoute allowedPermission="dashboards.view"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/doctor-consultations" element={<ProtectedRoute allowedPermission="consultations.manage"><AdminDoctorConsultationsPage /></ProtectedRoute>} />
        <Route path="/admin/treatment-plans" element={<ProtectedRoute allowedPermission="treatment_plans.approve"><AdminTreatmentPlansPage /></ProtectedRoute>} />
        <Route path="/admin/doctor-claims" element={<ProtectedRoute allowedPermissions={["claims.view", "claims.approved.view"]}><AdminDoctorClaimsPage /></ProtectedRoute>} />
        <Route path="/doctor" element={<ProtectedRoute allowedRole="doctor"><DoctorDashboard /></ProtectedRoute>} />
        <Route path="/doctor/consultations" element={<ProtectedRoute allowedPermission="consultations.own"><DoctorConsultationsPage /></ProtectedRoute>} />
        <Route path="/doctor/visits" element={<ProtectedRoute allowedPermission="doctor_visits.own"><DoctorVisitsPage /></ProtectedRoute>} />
        <Route path="/doctor/treatment-plans" element={<ProtectedRoute allowedPermission="treatment_plans.create"><DoctorTreatmentPlansPage /></ProtectedRoute>} />
        <Route path="/doctor/expenses" element={<ProtectedRoute allowedPermission="doctor_expenses.manage"><DoctorExpensesPage /></ProtectedRoute>} />
        <Route path="/doctor/claims" element={<ProtectedRoute allowedPermission="doctor_claims.submit"><DoctorClaimsPage /></ProtectedRoute>} />
        <Route path="/therapist" element={<ProtectedRoute allowedRole="therapist"><TherapistDashboard /></ProtectedRoute>} />
        <Route path="/travel/add" element={<ProtectedRoute allowedRole="therapist"><AddTravelPage /></ProtectedRoute>} />
        <Route path="/travel/today" element={<ProtectedRoute allowedRole="therapist"><TodayTravelPage /></ProtectedRoute>} />
        <Route path="/travel/:id" element={<ProtectedRoute allowedRole="therapist"><TravelDetailsPage /></ProtectedRoute>} />
        <Route path="/claims" element={<ProtectedRoute allowedRole="therapist"><MyClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/pending-claims" element={<ProtectedRoute allowedPermission="claims.view"><PendingClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRole="admin"><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin/register" element={<ProtectedRoute allowedRole="admin"><RegisterUserPage /></ProtectedRoute>} />
        <Route path="/admin/history" element={<ProtectedRoute allowedPermission="claims.view"><ClaimHistoryPage /></ProtectedRoute>} />
        <Route path="/admin/claim/:claimId" element={<ProtectedRoute allowedPermissions={["claims.view", "claims.approved.view"]}><AdminClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/therapist/claim/:claimId" element={<ProtectedRoute allowedRole="therapist"><TherapistClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/today-schedule" element={<ProtectedRoute allowedRole="therapist"><TodaysSchedulePage /></ProtectedRoute>} />
        <Route path="/upcoming-schedule" element={<ProtectedRoute allowedRole="therapist"><UpcomingSchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/today" element={<ProtectedRoute allowedRole="admin"><AdminTodaySchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/create" element={<ProtectedRoute allowedPermission="schedules.create"><AdminCreateSchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/:id" element={<ProtectedRoute allowedRole="admin"><AdminScheduleDetailsPage /></ProtectedRoute>} />
        <Route path="/admin/schedule/edit/:id" element={<ProtectedRoute allowedRole="admin"><AdminEditSchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/pending" element={<ProtectedRoute allowedRole="admin"><AdminPendingSchedulesPage /></ProtectedRoute>} />
        <Route path="/admin/schedule/completed" element={<ProtectedRoute allowedRole="admin"><AdminCompletedSchedulesPage /></ProtectedRoute>} />
        <Route path="/admin/schedule/missed" element={<ProtectedRoute allowedRole="admin"><AdminMissedSchedulesPage /></ProtectedRoute>} />
        <Route path="/therapist/schedule/missed" element={<ProtectedRoute allowedRole="therapist"><TherapistMissedSchedulesPage /></ProtectedRoute>} />
        <Route path="/therapist/schedule/completed" element={<ProtectedRoute allowedRole="therapist"><TherapistCompletedSchedulesPage /></ProtectedRoute>} />
      </Routes>
    
    </BrowserRouter>
    
  )
}

export default App
