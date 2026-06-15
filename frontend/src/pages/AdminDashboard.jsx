import { useEffect, useState } from "react";
import AdminLayout from "../layouts/AdminLayout";
import { getAdminSummary } from "../services/adminDashboardService";
import toast from "react-hot-toast";

function AdminDashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem("token");
      const data = await getAdminSummary(token);
      setSummary(data);
    } catch {
      toast.error("Failed to load dashboard");
    }
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-7xl mx-auto">
        
        {/* Responsive Header Typography */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
          Admin Dashboard
        </h1>
        
        <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8">
          Welcome back 🚀
        </p>

        {summary && (
          /* Responsive Layout Grid (Stacks to 1 column on mobile, 2 on tablet, 4 on desktop) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

            {/* Pending Claims */}
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 transition-transform hover:scale-[1.01]">
              <h2 className="text-sm font-medium text-gray-500 tracking-wide uppercase">
                Pending Claims
              </h2>
              <p className="text-3xl sm:text-4xl font-bold text-yellow-500 mt-2 sm:mt-3">
                {summary.pending_claims}
              </p>
            </div>

            {/* Approved Claims */}
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 transition-transform hover:scale-[1.01]">
              <h2 className="text-sm font-medium text-gray-500 tracking-wide uppercase">
                Approved Claims
              </h2>
              <p className="text-3xl sm:text-4xl font-bold text-green-600 mt-2 sm:mt-3">
                {summary.approved_claims}
              </p>
            </div>

            {/* Total Therapists */}
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 transition-transform hover:scale-[1.01]">
              <h2 className="text-sm font-medium text-gray-500 tracking-wide uppercase">
                Total Therapists
              </h2>
              <p className="text-3xl sm:text-4xl font-bold text-blue-600 mt-2 sm:mt-3">
                {summary.total_therapists}
              </p>
            </div>

            {/* Today's Claims */}
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 transition-transform hover:scale-[1.01]">
              <h2 className="text-sm font-medium text-gray-500 tracking-wide uppercase">
                Today's Claims
              </h2>
              <p className="text-3xl sm:text-4xl font-bold text-purple-600 mt-2 sm:mt-3">
                {summary.todays_claims}
              </p>
            </div>

          </div>
        )}
        
      </div>
    </AdminLayout>
  );
}

export default AdminDashboard;