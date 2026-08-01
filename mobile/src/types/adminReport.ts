export interface AdminReportSummary {
  todaysTreatments: number;
  completedTreatments: number;
  cancelledTreatments: number;
  patientsVisited: number;
  totalClaims: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  totalKm: number;
  totalTravelAmount: number;
  averageKmPerTherapist: number;
  activeTherapists: number;
  topPerformingTherapist: string | null;
  generatedAt: string;
  periodLabel: string;
  trendPeriodLabel: string;
  hasData: boolean;
  trends: ReportTrendPoint[];
  claimsByStatus: ReportClaimStatusPoint[];
  topTherapists: ReportTopTherapist[];
  recentActivity: ReportActivity[];
  insights: ReportInsight[];
}

export type ReportClaimStatus =
  | "all"
  | "pending"
  | "approved"
  | "rejected";

export type ReportActivityType =
  | "claim"
  | "treatment"
  | "travel";

export type ReportInsightDirection = "up" | "down" | "neutral";

export interface ReportTrendPoint {
  date: string;
  completedTreatments: number;
  totalKm: number;
  travelAmount: number;
}

export interface ReportClaimStatusPoint {
  status: Exclude<ReportClaimStatus, "all">;
  count: number;
}

export interface ReportTopTherapist {
  therapistId: number;
  therapistName: string;
  completedTreatments: number;
  totalKm: number;
  claimsSubmitted: number;
}

export interface ReportActivity {
  id: string;
  activityType: ReportActivityType;
  therapistName: string;
  occurredAt: string;
  status: string;
  amount: number | null;
  description: string;
}

export interface ReportInsight {
  key: string;
  title: string;
  value: string;
  detail: string;
  direction: ReportInsightDirection;
  changePercent: number | null;
}

export interface AdminReportFilters {
  fromDate: string | null;
  status: ReportClaimStatus;
  therapistId: number | null;
  therapistName: string | null;
  toDate: string | null;
}
