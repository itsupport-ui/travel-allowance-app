import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FaHome,
  FaCog,
  FaClipboardList,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaPlus,
  FaPhoneAlt,
  FaFileMedical,
  FaFileInvoiceDollar,
  FaChartBar,
  FaUsers,
} from "react-icons/fa";
import {
  hasAnyPermission,
  hasPermission,
} from "../utils/permissions";

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = localStorage.getItem("role");
  const canManageDoctorWorkflow = hasAnyPermission([
    "consultations.manage",
    "treatment_plans.approve",
    "claims.view",
    "claims.approved.view",
  ]);
  const canViewSchedules =
    hasPermission("dashboards.view") ||
    hasPermission("schedules.create");
  const canManageUsers = role === "admin";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("permissions");
    navigate("/");
  };

  const closeSidebar = () => setSidebarOpen(false);

  // Reusable styling function to accurately highlight the active navigation target
  const getNavLinkClass = (path) => {
    const baseClasses = "flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 tracking-wide";
    const activeClasses = "bg-blue-600 text-white shadow-md shadow-blue-900/20";
    const inactiveClasses = "text-slate-400 hover:bg-slate-800 hover:text-slate-100";
    
    return `${baseClasses} ${location.pathname === path ? activeClasses : inactiveClasses}`;
  };

  return (
    <div className="flex min-h-screen bg-slate-50/50 overflow-x-hidden font-sans">
      
      {/* Mobile Sticky Top Header Bar Layer */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-30 shadow-sm">
        <h1 className="text-lg font-bold text-white tracking-tight">Admin Console</h1>
        <button
          onClick={() => setSidebarOpen(true)}
          className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-xl transition shadow-sm active:scale-95"
        >
          <FaBars className="text-lg" />
        </button>
      </div>

      {/* Dark Dim Backdrop Layer for Mobile View Drawer Focus */}
      {sidebarOpen && (
        <div 
          onClick={closeSidebar}
          className="fixed inset-0 bg-slate-950/60 z-40 md:hidden backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      {/* Navigation Slideout Drawer / Static Sidebar Panel */}
      <div
        className={`
          fixed inset-y-0 left-0 w-64 bg-slate-900 p-5 z-50 flex flex-col border-r border-slate-800/50
          transform transition-transform duration-300 ease-in-out shadow-xl
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:shadow-none
        `}
      >
        {/* Sidebar Header Brand Identity */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 pl-1">
            <div className="w-2 h-4 bg-blue-500 rounded-sm"></div>
            <h1 className="text-xl font-bold text-white tracking-tight">Admin Panel</h1>
          </div>
          
          {/* Mobile Close Button Icon */}
          <button 
            onClick={closeSidebar}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <FaTimes className="text-lg" />
          </button>
        </div>

        {/* Scalable Navigation Menu Links Container */}
        <nav className="space-y-1.5 flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {hasPermission("dashboards.view") && (
            <Link to="/admin" onClick={closeSidebar} className={getNavLinkClass("/admin")}>
              <FaHome className="text-base" /> Dashboard
            </Link>
          )}

          {canManageUsers && (
            <Link to="/admin/staff" onClick={closeSidebar} className={getNavLinkClass("/admin/staff")}>
              <FaUsers className="text-base" /> Clinical Staff
            </Link>
          )}

          {hasPermission("claims.view") && (
            <Link to="/admin/claims" onClick={closeSidebar} className={getNavLinkClass("/admin/claims")}>
              <FaClipboardList className="text-base" /> Claims
            </Link>
          )}

          {hasPermission("dashboards.view") && (
            <Link to="/admin/reports" onClick={closeSidebar} className={getNavLinkClass("/admin/reports")}>
              <FaChartBar className="text-base" /> Reports
            </Link>
          )}

          {canManageDoctorWorkflow && (
            <div className="pt-3 pb-1 pl-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Doctor Workflow</div>
          )}

          {hasPermission("consultations.manage") && (
            <Link to="/admin/doctor-consultations" onClick={closeSidebar} className={getNavLinkClass("/admin/doctor-consultations")}>
              <FaPhoneAlt className="text-base" /> Consultations
            </Link>
          )}

          {hasPermission("treatment_plans.approve") && (
            <Link to="/admin/treatment-plans" onClick={closeSidebar} className={getNavLinkClass("/admin/treatment-plans")}>
              <FaFileMedical className="text-base" /> Treatment Plans
            </Link>
          )}

          {hasAnyPermission(["claims.view", "claims.approved.view"]) && (
            <Link to="/admin/doctor-claims" onClick={closeSidebar} className={getNavLinkClass("/admin/doctor-claims")}>
              <FaFileInvoiceDollar className="text-base" /> Doctor Claims
            </Link>
          )}

          {canViewSchedules && (
            <div className="pt-3 pb-1 pl-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Schedules</div>
          )}

          {hasPermission("dashboards.view") && (
            <Link to="/admin/schedules" onClick={closeSidebar} className={getNavLinkClass("/admin/schedules")}>
              <FaClipboardList className="text-base" /> Schedule Operations
            </Link>
          )}

          {hasPermission("schedules.create") && (
            <Link to="/admin/schedule/create" onClick={closeSidebar} className={getNavLinkClass("/admin/schedule/create")}>
              <FaPlus className="text-base" /> Create Schedule
            </Link>
          )}

          {canManageUsers && (
            <>
              <div className="pt-3 pb-1 pl-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Management</div>

              <Link to="/admin/settings" onClick={closeSidebar} className={getNavLinkClass("/admin/settings")}>
                <FaCog className="text-base" /> Settings
              </Link>

            </>
          )}
        </nav>

        {/* Bottom Core Execution Logout Trigger Button */}
        <div className="pt-4 border-t border-slate-800 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white px-4 py-3 rounded-xl font-semibold transition duration-200 text-sm flex items-center justify-center gap-2 shadow-inner group"
          >
            <FaSignOutAlt className="text-base group-hover:translate-x-0.5 transition-transform" /> Logout
          </button>
        </div>
      </div>

      {/* Main Render View Window Frame Block */}
      <main className="flex-1 p-4 pt-20 md:p-8 w-full min-w-0 max-w-full overflow-x-hidden">
        <div className="animate-fade-in-up">
          {children}
        </div>
      </main>

    </div>
  );
}

export default AdminLayout;
