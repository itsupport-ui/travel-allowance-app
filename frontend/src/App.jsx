import LoginPage from "./pages/LoginPage"
import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom"

import AdminDashboard from "./pages/AdminDashboard"
import TherapistDashboard from "./pages/TherapistDashboard"
import AddTravelPage from "./pages/AddTravelPage"
import TodayTravelPage from "./pages/TodayTravelPage"
import TravelDetailsPage from "./pages/TravelDetailsPage"
import MyClaimsPage from "./pages/MyClaimsPage"
import ProtectedRoute from "./components/ProtectedRoute"
import SettingsPage from "./pages/SettingsPage"
import RegisterUserPage from "./pages/RegisterUserPage"
import AdminClaimDetailsPage from "./pages/AdminClaimDetailsPage"
import TherapistClaimDetailsPage from "./pages/TherapistClaimDetailsPage"
import AdminCreateSchedulePage from "./pages/AdminCreateSchedulePage"
import AdminScheduleDetailsPage from "./pages/AdminScheduleDetailsPage"
import AdminEditSchedulePage from "./pages/AdminEditSchedulePage"
import AdminMissedSchedulesPage from "./pages/AdminMissedSchedulesPage"
import TherapistSchedulesPage from "./pages/TherapistSchedulesPage"
import AdminDoctorConsultationsPage from "./pages/AdminDoctorConsultationsPage"
import AdminTreatmentPlansPage from "./pages/AdminTreatmentPlansPage"
import DoctorDashboard from "./pages/DoctorDashboard"
import DoctorConsultationsPage from "./pages/DoctorConsultationsPage"
import DoctorVisitsPage from "./pages/DoctorVisitsPage"
import DoctorTreatmentPlansPage from "./pages/DoctorTreatmentPlansPage"
import DoctorExpensesPage from "./pages/DoctorExpensesPage"
import DoctorClaimsPage from "./pages/DoctorClaimsPage"
import AdminDoctorClaimsPage from "./pages/AdminDoctorClaimsPage"
import AdminSchedulesPage from "./pages/AdminSchedulesPage"
import AdminClaimsPage from "./pages/AdminClaimsPage"
import AdminReportsPage from "./pages/AdminReportsPage"
import TravelExpenseReportPage from "./pages/TravelExpenseReportPage"
import AdminAuditLogPage from "./pages/AdminAuditLogPage"
import AdminFollowUpsPage from "./pages/AdminFollowUpsPage"
import AdminStaffPage from "./pages/AdminStaffPage"
import ProfilePage from "./pages/ProfilePage"


function App() {
  return (
    <BrowserRouter>
    
      <Routes>

        <Route path="/" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedRoute allowedPermission="dashboards.view"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/doctor-consultations" element={<ProtectedRoute allowedPermission="consultations.manage"><AdminDoctorConsultationsPage /></ProtectedRoute>} />
        <Route path="/admin/treatment-plans" element={<ProtectedRoute allowedPermission="treatment_plans.approve"><AdminTreatmentPlansPage /></ProtectedRoute>} />
        <Route path="/admin/doctor-claims" element={<ProtectedRoute allowedPermissions={["claims.view", "claims.approved.view"]}><AdminDoctorClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/staff" element={<ProtectedRoute allowedRole="admin"><AdminStaffPage /></ProtectedRoute>} />
        <Route path="/admin/schedules" element={<ProtectedRoute allowedRole="admin"><AdminSchedulesPage /></ProtectedRoute>} />
        <Route path="/admin/claims" element={<ProtectedRoute allowedPermission="claims.view"><AdminClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute allowedPermission="dashboards.view"><AdminReportsPage /></ProtectedRoute>} />
        <Route path="/admin/reports/travel-expense" element={<ProtectedRoute allowedPermission="dashboards.view"><TravelExpenseReportPage /></ProtectedRoute>} />
        <Route path="/travel-expense-report" element={<ProtectedRoute allowedRole="therapist"><TravelExpenseReportPage /></ProtectedRoute>} />
        <Route path="/doctor/travel-expense-report" element={<ProtectedRoute allowedPermission="doctor_claims.submit"><TravelExpenseReportPage /></ProtectedRoute>} />
        <Route path="/admin/audit-log" element={<ProtectedRoute allowedPermission="audit.view"><AdminAuditLogPage /></ProtectedRoute>} />
        <Route path="/admin/follow-ups" element={<ProtectedRoute allowedPermission="follow_ups.manage"><AdminFollowUpsPage /></ProtectedRoute>} />
        <Route path="/doctor" element={<ProtectedRoute allowedRole="doctor"><DoctorDashboard /></ProtectedRoute>} />
        <Route path="/doctor/consultations" element={<ProtectedRoute allowedPermission="consultations.own"><DoctorConsultationsPage /></ProtectedRoute>} />
        <Route path="/doctor/visits" element={<ProtectedRoute allowedPermission="doctor_visits.own"><DoctorVisitsPage /></ProtectedRoute>} />
        <Route path="/doctor/treatment-plans" element={<ProtectedRoute allowedPermission="treatment_plans.create"><DoctorTreatmentPlansPage /></ProtectedRoute>} />
        <Route path="/doctor/expenses" element={<ProtectedRoute allowedPermission="doctor_expenses.manage"><DoctorExpensesPage /></ProtectedRoute>} />
        <Route path="/doctor/claims" element={<ProtectedRoute allowedPermission="doctor_claims.submit"><DoctorClaimsPage /></ProtectedRoute>} />
        <Route path="/doctor/profile" element={<ProtectedRoute allowedRole="doctor"><ProfilePage role="doctor" /></ProtectedRoute>} />
        <Route path="/therapist" element={<ProtectedRoute allowedRole="therapist"><TherapistDashboard /></ProtectedRoute>} />
        <Route path="/travel/add" element={<ProtectedRoute allowedRole="therapist"><AddTravelPage /></ProtectedRoute>} />
        <Route path="/travel/today" element={<ProtectedRoute allowedRole="therapist"><TodayTravelPage /></ProtectedRoute>} />
        <Route path="/travel/:id" element={<ProtectedRoute allowedRole="therapist"><TravelDetailsPage /></ProtectedRoute>} />
        <Route path="/claims" element={<ProtectedRoute allowedRole="therapist"><MyClaimsPage /></ProtectedRoute>} />
        <Route path="/therapist/profile" element={<ProtectedRoute allowedRole="therapist"><ProfilePage role="therapist" /></ProtectedRoute>} />
        <Route path="/admin/pending-claims" element={<Navigate to="/admin/claims?status=pending" replace />} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRole="admin"><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin/register" element={<ProtectedRoute allowedRole="admin"><RegisterUserPage /></ProtectedRoute>} />
        <Route path="/admin/history" element={<Navigate to="/admin/claims?status=all" replace />} />
        <Route path="/admin/claim/:claimId" element={<ProtectedRoute allowedPermissions={["claims.view", "claims.approved.view"]}><AdminClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/therapist/claim/:claimId" element={<ProtectedRoute allowedRole="therapist"><TherapistClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/therapist/schedules" element={<ProtectedRoute allowedRole="therapist"><TherapistSchedulesPage /></ProtectedRoute>} />
        <Route path="/today-schedule" element={<ProtectedRoute allowedRole="therapist"><Navigate to="/therapist/schedules?view=today" replace /></ProtectedRoute>} />
        <Route path="/upcoming-schedule" element={<ProtectedRoute allowedRole="therapist"><Navigate to="/therapist/schedules?view=upcoming" replace /></ProtectedRoute>} />
        <Route path="/admin/schedule/today" element={<Navigate to="/admin/schedules?view=today" replace />} />
        <Route path="/admin/schedule/create" element={<ProtectedRoute allowedPermission="schedules.create"><AdminCreateSchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/:id" element={<ProtectedRoute allowedRole="admin"><AdminScheduleDetailsPage /></ProtectedRoute>} />
        <Route path="/admin/schedule/edit/:id" element={<ProtectedRoute allowedRole="admin"><AdminEditSchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/pending" element={<Navigate to="/admin/schedules?view=upcoming" replace />} />
        <Route path="/admin/schedule/completed" element={<Navigate to="/admin/schedules?view=completed" replace />} />
        <Route path="/admin/schedule/missed" element={<ProtectedRoute allowedRole="admin"><AdminMissedSchedulesPage /></ProtectedRoute>} />
        <Route path="/therapist/schedule/missed" element={<ProtectedRoute allowedRole="therapist"><Navigate to="/therapist/schedules?view=missed" replace /></ProtectedRoute>} />
        <Route path="/therapist/schedule/completed" element={<ProtectedRoute allowedRole="therapist"><Navigate to="/therapist/schedules?view=completed" replace /></ProtectedRoute>} />
      </Routes>
    
    </BrowserRouter>
    
  )
}

export default App
