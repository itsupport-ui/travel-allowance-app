export type AdminClaimStatus =
  | "all"
  | "pending"
  | "approved"
  | "rejected";

export type AdminClaimSort =
  | "newest"
  | "oldest"
  | "highest_amount"
  | "lowest_amount"
  | "longest_distance"
  | "therapist_name";

export interface AdminClaimReviewFilters {
  status: AdminClaimStatus;
  therapistId: number | null;
  therapistName: string | null;
  fromDate: string | null;
  toDate: string | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  minimumDistance: number | null;
  maximumDistance: number | null;
  search: string;
  sort: AdminClaimSort;
}

export interface AdminClaimReviewSummary {
  pendingClaims: number;
  todaysClaims: number;
  pendingAmount: number;
  highValueClaims: number;
  averageClaimAmount: number;
  averageDistance: number;
}

export interface AdminClaimReviewItem {
  id: number;
  therapistId: number;
  therapistName: string;
  therapistRole: string;
  claimDate: string;
  submittedAt: string | null;
  status: string;
  patientName: string | null;
  patientCount: number;
  visitedCount: number;
  travelDate: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  totalKm: number;
  perKmRate: number;
  travelTotal: number;
  dailyAllowance: number;
  grandTotal: number;
  notes: string | null;
  isHighValue: boolean;
  isUrgent: boolean;
  ageDays: number;
}

export interface AdminClaimReviewPage {
  items: AdminClaimReviewItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  highValueThreshold: number;
  summary: AdminClaimReviewSummary;
}
