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


function App() {
  return (
    <BrowserRouter>
    
      <Routes>

        <Route path="/" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/therapist" element={<ProtectedRoute allowedRole="therapist"><TherapistDashboard /></ProtectedRoute>} />
        <Route path="/travel/add" element={<ProtectedRoute allowedRole="therapist"><AddTravelPage /></ProtectedRoute>} />
        <Route path="/travel/today" element={<ProtectedRoute allowedRole="therapist"><TodayTravelPage /></ProtectedRoute>} />
        <Route path="/travel/:id" element={<ProtectedRoute allowedRole="therapist"><TravelDetailsPage /></ProtectedRoute>} />
        <Route path="/claims" element={<ProtectedRoute allowedRole="therapist"><MyClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/pending-claims" element={<ProtectedRoute allowedRole="admin"><PendingClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRole="admin"><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin/register" element={<ProtectedRoute allowedRole="admin"><RegisterUserPage /></ProtectedRoute>} />
        <Route path="/admin/history" element={<ProtectedRoute allowedRole="admin"><ClaimHistoryPage /></ProtectedRoute>} />
        <Route path="/admin/claim/:claimId" element={<ProtectedRoute allowedRole="admin"><AdminClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/therapist/claim/:claimId" element={<ProtectedRoute allowedRole="therapist"><TherapistClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/today-schedule" element={<ProtectedRoute allowedRole="therapist"><TodaysSchedulePage /></ProtectedRoute>} />
        <Route path="/upcoming-schedule" element={<ProtectedRoute allowedRole="therapist"><UpcomingSchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/today" element={<ProtectedRoute allowedRole="admin"><AdminTodaySchedulePage /></ProtectedRoute>} />
        <Route path="/admin/schedule/create" element={<ProtectedRoute allowedRole="admin"><AdminCreateSchedulePage /></ProtectedRoute>} />
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
