import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react"; // Added useState for managing responsive state
import {
  FaHome,
  FaCar,
  FaFileInvoice,
  FaPlusCircle,
  FaSignOutAlt,
  FaBars,  // Added for opening menu
  FaTimes, // Added for closing menu
} from "react-icons/fa";

function TherapistLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // State to control mobile sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  // Helper function to auto-close the drawer on mobile after clicking a link
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-gray-100">
      
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-20 bg-blue-700 text-white p-3 rounded-lg shadow-lg hover:bg-blue-800 transition"
      >
        <FaBars />
      </button>

      {/* Dark Backdrop Overlay for Mobile Screens */}
      {sidebarOpen && (
        <div 
          onClick={closeSidebar}
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 w-64 bg-blue-700 text-white p-6 z-40
          transform transition-transform duration-300 ease-in-out flex flex-col
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0
        `}
      >
        {/* Sidebar Header with Close Icon for Mobile */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Therapist Panel</h1>
          <button 
            onClick={closeSidebar}
            className="md:hidden text-white hover:text-blue-200 transition"
          >
            <FaTimes className="text-xl" />
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="space-y-4 flex-1">
          {/* Dashboard */}
          <Link
            to="/therapist"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/therapist" ? "bg-blue-900" : "hover:bg-blue-600"
            }`}
          >
            <FaHome /> Dashboard
          </Link>

          {/* Add Travel */}
          <Link
            to="/travel/add"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/travel/add" ? "bg-blue-900" : "hover:bg-blue-600"
            }`}
          >
            <FaPlusCircle /> Add Travel
          </Link>

          {/* Today's Travel */}
          <Link
            to="/travel/today"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/travel/today" ? "bg-blue-900" : "hover:bg-blue-600"
            }`}
          >
            <FaCar /> Today's Travel
          </Link>

          {/* My Claims */}
          <Link
            to="/claims"
            onClick={closeSidebar}
            className={`flex items-center gap-3 p-3 rounded-lg transition ${
              location.pathname === "/claims" ? "bg-blue-900" : "hover:bg-blue-600"
            }`}
          >
            <FaFileInvoice /> My Claims
          </Link>
        </nav>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="mt-10 bg-red-500 hover:bg-red-600 px-4 py-3 rounded-lg w-full flex items-center justify-center gap-2 transition"
        >
          <FaSignOutAlt /> Logout
        </button>
      </div>

      {/* Main Content Pane */}
      {/* pt-20 handles padding on mobile so content isn't swallowed by the top toggle button */}
      <div className="flex-1 p-4 pt-20 md:p-8 w-full max-w-full overflow-x-hidden">
        {children}
      </div>

    </div>
  );
}

export default TherapistLayout;