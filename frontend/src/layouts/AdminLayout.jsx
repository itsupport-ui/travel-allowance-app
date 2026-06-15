import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FaHome,
  FaCog,
  FaClipboardList,
  FaSignOutAlt,
  FaUserPlus,
  FaHistory,
  FaBars,
  FaTimes,
} from "react-icons/fa";

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  // Helper function to close the sidebar on mobile after clicking a link
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-gray-100">
      
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-20 bg-gray-900 text-white p-3 rounded-lg shadow-lg"
      >
        <FaBars />
      </button>

      {/* Dark Overlay for Mobile (Closes sidebar when clicked) */}
      {sidebarOpen && (
        <div 
          onClick={closeSidebar}
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 w-64 bg-gray-900 text-white p-6 z-40
          transform transition-transform duration-300 ease-in-out flex flex-col
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0
        `}
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          {/* Mobile Close Button */}
          <button 
            onClick={closeSidebar}
            className="md:hidden text-white hover:text-gray-300"
          >
            <FaTimes className="text-xl" />
          </button>
        </div>

        <nav className="space-y-4 flex-1">
          {/* Dashboard */}
          <Link
            to="/admin"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/admin" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaHome /> Dashboard
          </Link>

          {/* Pending Claims */}
          <Link
            to="/admin/pending-claims"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/admin/pending-claims" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaClipboardList /> Pending Claims
          </Link>

          {/* History */}
          <Link
            to="/admin/history"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/admin/history" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaHistory /> History
          </Link>

          {/* Settings */}
          <Link
            to="/admin/settings"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/admin/settings" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaCog /> Settings
          </Link>

          {/* Add User */}
          <Link
            to="/admin/register"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/admin/register" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaUserPlus /> Add User
          </Link>
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-10 bg-red-500 hover:bg-red-600 px-4 py-3 rounded-lg w-full flex items-center justify-center gap-2 transition"
        >
          <FaSignOutAlt /> Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 pt-20 md:p-8 w-full max-w-full overflow-x-hidden">
        {children}
      </div>

    </div>
  );
}

export default AdminLayout;