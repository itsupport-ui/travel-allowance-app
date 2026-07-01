import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FaHome,
  FaCar,
  FaFileInvoice,
  FaPlusCircle,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaCalendarDay,
  FaCalendarAlt,
  FaUserCircle,
  FaCalendarTimes,
  FaCalendarCheck,
  FaPlay,
} from "react-icons/fa";
import { startWorkDay } from "../services/workdayService";
import { reverseGeocode } from "../services/mapsService";
import toast from "react-hot-toast";

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

  const handleStartDay = () => {
    if (!navigator.geolocation) {
      toast.error("Location capture is not supported by this browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = localStorage.getItem("token");
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          let startAddress = `${latitude}, ${longitude}`;

          try {
            const location = await reverseGeocode(latitude, longitude, token);
            startAddress = location.address || startAddress;
          } catch (error) {
            console.error("Error resolving current address:", error);
          }

          const payload = {
            start_address: startAddress,
            start_latitude: latitude,
            start_longitude: longitude,
          };

          const result = await startWorkDay(token, payload);

          console.log("Start Day Result:", result);

          toast.success(result.message)
        } catch (error) {
          console.error("Error starting workday:", error);
          toast.error(error.message || "Failed to start work day");
        }
      }, (error) => {
        console.error("Error getting location:", error);
        toast.error("Failed to get current location");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans antialiased">
      
      {/* Mobile Top Header Banner Frame */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200/80 px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            TX
          </div>
          <span className="font-bold text-slate-800 tracking-tight text-sm">Therapist Panel</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Start Day Button - Mobile Quick Access */}
          <button
            onClick={handleStartDay}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition active:scale-95 shadow-sm shadow-emerald-100"
          >
            <FaPlay className="text-[10px]" /> Start Day
          </button>
          
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-600 hover:text-slate-900 p-2 rounded-xl hover:bg-slate-50 transition active:scale-95"
            aria-label="Open Navigation Menu"
          >
            <FaBars className="text-lg" />
          </button>
        </div>
      </header>

      {/* Backdrop Overlay for Mobile Screens */}
      {sidebarOpen && (
        <div 
          onClick={closeSidebar}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
        />
      )}

      {/* Sidebar Layout Core Component */}
      <aside
        className={`
          fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200/80 p-5 z-50 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0
        `}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between pb-5 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-indigo-200">
              TX
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Therapist Portal</h1>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Clinical Staff</span>
            </div>
          </div>
          <button 
            onClick={closeSidebar}
            className="md:hidden text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition"
          >
            <FaTimes className="text-base" />
          </button>
        </div>

        {/* Start Day Action - Desktop Sidebar Placement */}
        <div className="mb-4 hidden md:block">
          <button
            onClick={handleStartDay}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition active:scale-[0.98] shadow-md shadow-emerald-100"
          >
            <FaPlay className="text-[10px]" /> Start Work Day
          </button>
        </div>

        {/* Navigation Stream links */}
        <nav className="space-y-1 flex-1 overflow-y-auto pr-1">
          {[
            { path: "/therapist", label: "Dashboard", icon: FaHome },
            { path: "/travel/add", label: "Add Travel", icon: FaPlusCircle },
            { path: "/travel/today", label: "Today's Travel", icon: FaCar },
            { path: "/claims", label: "My Claims", icon: FaFileInvoice },
            { path: "/today-schedule", label: "Today's Schedule", icon: FaCalendarDay },
            { path: "/upcoming-schedule", label: "Upcoming Schedule", icon: FaCalendarAlt },
            { path: "/therapist/schedule/missed", label: "Missed Schedule", icon: FaCalendarTimes },
            { path: "/therapist/schedule/completed", label: "Completed Schedule", icon: FaCalendarCheck },
          ].map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 ${
                  isActive 
                    ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-50/50" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className={`text-sm ${isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area / Logout Button */}
        <div className="pt-4 border-t border-slate-100 mt-auto space-y-3">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <FaUserCircle className="text-2xl text-slate-300" />
            <div className="truncate">
              <p className="text-xs font-bold text-slate-800 truncate">Therapist User</p>
              <p className="text-[10px] font-medium text-slate-400 truncate">session authenticated</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-4 py-2.5 rounded-xl w-full flex items-center justify-center gap-2 text-xs transition active:scale-[0.98]"
          >
            <FaSignOutAlt className="text-sm" /> Logout Session
          </button>
        </div>
      </aside>

      {/* Main Content Workspace Layout Viewports */}
      <main className="flex-1 p-4 pt-20 md:p-8 w-full max-w-full overflow-x-hidden min-h-screen flex flex-col">
        <div className="w-full h-full flex-1">
          {children}
        </div>
      </main>

    </div>
  );
}

export default TherapistLayout;
