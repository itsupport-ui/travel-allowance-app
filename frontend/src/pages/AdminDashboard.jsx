import { useEffect, useState } from "react";
import AdminLayout from "../layouts/AdminLayout";
import { getAdminSummary } from "../services/adminDashboardService";
import { getDashboardSummary } from "../services/scheduleService";
import toast from "react-hot-toast";

function AdminDashboard() {
  // Clear operational metrics state initialization
  const [summary, setSummary] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fire both async calls concurrently to reduce load latency
    Promise.all([fetchSummary(), fetchDashboard()])
      .finally(() => setIsLoading(false));
  }, []);

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem("token");
      const data = await getAdminSummary(token);
      setSummary(data);
    } catch {
      toast.error("Failed to load admin summary statistics");
    }
  };

  const fetchDashboard = async () => {
    try {
      const token = localStorage.getItem("token");
      const data = await getDashboardSummary(token);
      setDashboard(data);
    } catch {
      toast.error("Failed to load schedule overview metrics");
    }
  };

  return (
    <AdminLayout>
      {/* px-3 sm:px-6 isolates the view space safely from hardware bezel edges */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4">
        
        {/* Page Context Branding Header */}
        <div className="mb-6 sm:mb-8 border-b border-gray-100 pb-4">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">
            Welcome back 🚀 Review corporate clinical performance and logistics claims today.
          </p>
        </div>

        {!isLoading && (
          <div className="space-y-8">
            
            {/* SECTION 1: SYSTEM OPERATION METRICS (High Contrast Colored Blocks) */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5 px-1">
                Clinical Workflow Overview
              </h2>
              {/* grid-cols-2 splits data onto a highly clean 2x2 thumb-grid layout over mobile glass, expanding to columns on screens */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                
                {/* Today's Scheduled */}
                <div className="bg-blue-600 text-white rounded-2xl p-4 sm:p-5 shadow-sm shadow-blue-600/10 flex flex-col justify-between min-h-[100px] sm:min-h-[120px]">
                  <p className="text-xs sm:text-sm font-medium text-blue-100 uppercase tracking-wider">
                    Today's Scheduled
                  </p>
                  <h3 className="text-2xl sm:text-4xl font-black mt-2">
                    {dashboard?.today_scheduled || 0}
                  </h3>
                </div>

                {/* Completed */}
                <div className="bg-emerald-600 text-white rounded-2xl p-4 sm:p-5 shadow-sm shadow-emerald-600/10 flex flex-col justify-between min-h-[100px] sm:min-h-[120px]">
                  <p className="text-xs sm:text-sm font-medium text-emerald-100 uppercase tracking-wider">
                    Completed Today
                  </p>
                  <h3 className="text-2xl sm:text-4xl font-black mt-2">
                    {dashboard?.completed || 0}
                  </h3>
                </div>

                {/* Missed */}
                <div className="bg-rose-600 text-white rounded-2xl p-4 sm:p-5 shadow-sm shadow-rose-600/10 flex flex-col justify-between min-h-[100px] sm:min-h-[120px]">
                  <p className="text-xs sm:text-sm font-medium text-rose-100 uppercase tracking-wider">
                    Missed Tasks
                  </p>
                  <h3 className="text-2xl sm:text-4xl font-black mt-2">
                    {dashboard?.missed || 0}
                  </h3>
                </div>

                {/* Cancelled */}
                <div className="bg-gray-700 text-white rounded-2xl p-4 sm:p-5 shadow-sm shadow-gray-700/10 flex flex-col justify-between min-h-[100px] sm:min-h-[120px]">
                  <p className="text-xs sm:text-sm font-medium text-gray-300 uppercase tracking-wider">
                    Cancelled Orders
                  </p>
                  <h3 className="text-2xl sm:text-4xl font-black mt-2">
                    {dashboard?.cancelled || 0}
                  </h3>
                </div>

              </div>
            </div>

            {/* SECTION 2: LOGISTICS & TRAVEL CLAIMS (Clean Minimalist Panels) */}
            {summary && (
              <div>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5 px-1">
                  Financial & Resource Accounting
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                  
                  {/* Pending Claims */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between min-h-[100px] sm:min-h-[120px] transition-all hover:shadow-md">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">
                      Pending Claims
                    </h3>
                    <p className="text-2xl sm:text-4xl font-black text-amber-500 mt-2">
                      {summary.pending_claims}
                    </p>
                  </div>

                  {/* Approved Claims */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between min-h-[100px] sm:min-h-[120px] transition-all hover:shadow-md">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">
                      Approved Claims
                    </h3>
                    <p className="text-2xl sm:text-4xl font-black text-green-600 mt-2">
                      {summary.approved_claims}
                    </p>
                  </div>

                  {/* Total Therapists */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between min-h-[100px] sm:min-h-[120px] transition-all hover:shadow-md">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">
                      Active Staff
                    </h3>
                    <p className="text-2xl sm:text-4xl font-black text-blue-600 mt-2">
                      {summary.total_therapists}
                    </p>
                  </div>

                  {/* Today's Claims */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col justify-between min-h-[100px] sm:min-h-[120px] transition-all hover:shadow-md">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">
                      Today's Claims
                    </h3>
                    <p className="text-2xl sm:text-4xl font-black text-purple-600 mt-2">
                      {summary.todays_claims}
                    </p>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default AdminDashboard;