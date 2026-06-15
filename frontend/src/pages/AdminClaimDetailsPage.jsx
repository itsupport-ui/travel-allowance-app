import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { getClaimDetails, approveClaim, rejectClaim } from "../services/claimService";

function AdminClaimDetailsPage() {
  const { claimId } = useParams();
  const navigate = useNavigate();
  const [claim, setClaim] = useState(null);
  const [travels, setTravels] = useState([]);

  useEffect(() => {
    fetchDetails();
  }, []);

  const fetchDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      const data = await getClaimDetails(claimId, token);
      setClaim(data.claim);
      setTravels(data.travels);
    } catch {
      toast.error("Failed to load claim");
    }
  };

  const handleApprove = async () => {
    try {
      const token = localStorage.getItem("token");
      await approveClaim(claimId, token);
      toast.success("Claim approved");
      navigate("/admin/pending-claims");
    } catch {
      toast.error("Approval failed");
    }
  };

  const handleReject = async () => {
    try {
      const token = localStorage.getItem("token");
      await rejectClaim(claimId, token);
      toast.success("Claim rejected");
      navigate("/admin/pending-claims");
    } catch {
      toast.error("Reject failed");
    }
  };

  if (!claim) return null;

  // UI state color badge generator for Claim status context
  const getStatusBadge = (status) => {
    const baseStyle = "px-3 py-1 rounded-full text-xs font-semibold inline-block capitalize"
    switch (status?.toLowerCase()) {
      case "approved":
        return <span className={`${baseStyle} bg-green-100 text-green-800`}>Approved</span>;
      case "rejected":
        return <span className={`${baseStyle} bg-red-100 text-red-800`}>Rejected</span>;
      default:
        return <span className={`${baseStyle} bg-yellow-100 text-yellow-800`}>Pending</span>;
    }
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto px-1 sm:px-4">
        
        {/* Responsive Page Title Typography */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Claim Details
        </h1>

        {/* Top Overview Summary Block */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5 sm:p-6 mb-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            
            <div className="border-r border-gray-100 pr-2">
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Therapist
              </span>
              <span className="font-semibold text-gray-800 text-sm sm:text-base block truncate">
                {claim.therapist_name}
              </span>
            </div>

            <div className="sm:border-r border-gray-100 pr-2">
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Claim Date
              </span>
              <span className="font-semibold text-gray-800 text-sm sm:text-base">
                {claim.claim_date}
              </span>
            </div>

            <div className="border-r border-gray-100 pr-2">
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Grand Total
              </span>
              <span className="font-bold text-blue-600 text-base sm:text-lg">
                ₹{claim.grand_total}
              </span>
            </div>

            <div>
              <span className="text-xs font-medium text-gray-400 block mb-1 uppercase tracking-wider">
                Status
              </span>
              <div className="mt-0.5">
                {getStatusBadge(claim.status)}
              </div>
            </div>

          </div>
        </div>

        {/* Section Breakdown Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
            Travel Entries
          </h2>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
            Total Distance: {claim.total_km} KM
          </span>
        </div>

        {/* Stacked Travel Log Cards */}
        <div className="space-y-4">
          {travels.length === 0 ? (
            <div className="text-center p-6 bg-white rounded-xl shadow text-gray-400 text-sm">
              No individual travel items linked to this claim.
            </div>
          ) : (
            travels.map((travel) => (
              <div
                key={travel.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
              >
                {/* Travel Card Top Header */}
                <div className="border-b border-gray-100 pb-3 mb-4">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <span className="text-xs text-gray-400 block font-medium">PATIENT</span>
                      <span className="font-bold text-gray-800 text-base sm:text-lg">
                        {travel.patient_name}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400 block font-medium">TRANSPORT</span>
                      <span className="font-semibold text-gray-700 text-sm sm:text-base capitalize">
                        {travel.transport_mode}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-gray-400 block font-medium">DISTANCE</span>
                      <span className="font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md text-sm">
                        {travel.total_km} KM
                      </span>
                    </div>
                  </div>

                  {/* Sub-meta details row for non-vehicle parameters */}
                  {(travel.transport_mode?.toLowerCase() !== "vehicle" || travel.invoice_file) && (
                    <div className="mt-3 pt-2 border-t border-dashed border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {travel.transport_mode?.toLowerCase() !== "vehicle" && (
                        <div className="flex items-center gap-1.5">
                          <strong className="text-gray-500 font-medium">Bill Amount:</strong>
                          <span className="font-semibold text-gray-800">₹{travel.bill_amount}</span>
                        </div>
                      )}
                      
                      {travel.invoice_file && (
                        <div className="flex items-center gap-1.5">
                          <strong className="text-gray-500 font-medium">Invoice:</strong>
                          <a 
                            href={`http://localhost:8000/${travel.invoice_file}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:underline font-medium inline-flex items-center"
                          >
                            View Invoice
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Interactive Route Timeline Mapping */}
                <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[11px] before:top-[8px] before:bottom-[8px] before:w-0.5 before:bg-gray-200">
                  
                  {/* From Endpoint */}
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-50 text-xs"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">From</span>
                    <span className="text-sm text-gray-700 font-medium break-words block">
                      {travel.from_address}
                    </span>
                  </div>

                  {/* To Endpoint */}
                  <div className="relative">
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-50 text-xs"></span>
                    <span className="text-xs text-gray-400 block font-medium uppercase">To</span>
                    <span className="text-sm text-gray-700 font-medium break-words block">
                      {travel.to_address}
                    </span>
                  </div>

                </div>

              </div>
            ))
          )}
        </div>

        {/* Responsive Review Action Footer */}
        {claim.status === "pending" && (
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
            <button
              onClick={handleReject}
              className="w-full sm:w-32 bg-white border border-red-200 hover:bg-red-50 text-red-600 px-5 py-2.5 rounded-xl font-semibold transition text-sm shadow-sm"
            >
              Reject Claim
            </button>
            <button
              onClick={handleApprove}
              className="w-full sm:w-32 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-semibold transition text-sm shadow-sm"
            >
              Approve
            </button>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}

export default AdminClaimDetailsPage;