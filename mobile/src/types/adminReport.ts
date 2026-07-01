export interface AdminReportSummary {
  todaysTreatments: number;
  totalKm: number;
  totalClaims: number;
  pendingClaims: number;
  completedTreatments: number;
}

export type ReportClaimStatus =
  | "all"
  | "pending"
  | "approved"
  | "rejected";

export interface AdminReportFilters {
  fromDate: string | null;
  status: ReportClaimStatus;
  therapistId: number | null;
  therapistName: string | null;
  toDate: string | null;
}
