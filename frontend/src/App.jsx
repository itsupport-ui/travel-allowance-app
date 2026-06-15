import LoginPage from "./pages/LoginPage"
import { BrowserRouter as Router, Route, Routes, BrowserRouter } from "react-router-dom"

import AdminDashboard from "./pages/AdminDashboard"
import TherapistDashboard from "./pages/TherapistDashboard"
import AddTravelPage from "./pages/AddTravelPage"
import TodayTravelPage from "./pages/TodayTravelPage"
import EditTravelPage from "./pages/EditTravelPage"
import MyClaimsPage from "./pages/MyClaimsPage"
import ProtectedRoute from "./components/ProtectedRoute"
import PendingClaimsPage from "./pages/PendingClaimsPage"
import SettingsPage from "./pages/SettingsPage"
import RegisterUserPage from "./pages/RegisterUserPage"
import ClaimHistoryPage from "./pages/ClaimHistoryPage"
import AdminClaimDetailsPage from "./pages/AdminClaimDetailsPage"
import TherapistClaimDetailsPage from "./pages/TherapistClaimDetailsPage"


function App() {
  return (
    <BrowserRouter>
    
      <Routes>

        <Route path="/" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/therapist" element={<ProtectedRoute allowedRole="therapist"><TherapistDashboard /></ProtectedRoute>} />
        <Route path="/travel/add" element={<ProtectedRoute allowedRole="therapist"><AddTravelPage /></ProtectedRoute>} />
        <Route path="/travel/today" element={<ProtectedRoute allowedRole="therapist"><TodayTravelPage /></ProtectedRoute>} />
        <Route path="/travel/edit/:id" element={<ProtectedRoute allowedRole="therapist"><EditTravelPage /></ProtectedRoute>} />
        <Route path="/claims" element={<ProtectedRoute allowedRole="therapist"><MyClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/pending-claims" element={<ProtectedRoute allowedRole="admin"><PendingClaimsPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRole="admin"><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin/register" element={<ProtectedRoute allowedRole="admin"><RegisterUserPage /></ProtectedRoute>} />
        <Route path="/admin/history" element={<ProtectedRoute allowedRole="admin"><ClaimHistoryPage /></ProtectedRoute>} />
        <Route path="/admin/claim/:claimId" element={<ProtectedRoute allowedRole="admin"><AdminClaimDetailsPage /></ProtectedRoute>} />
        <Route path="/therapist/claim/:claimId" element={<ProtectedRoute allowedRole="therapist"><TherapistClaimDetailsPage /></ProtectedRoute>} />
      
      </Routes>
    
    </BrowserRouter>
    
  )
}

export default App