import { api } from "../api/apiClient";


export type EarlyClosureRole = "doctor" | "therapist";
export type EarlyClosureReviewStatus =
  | "acknowledged"
  | "follow_up_required"
  | "pending";


export interface EarlyClosureReviewItem {
  available_actions: string[];
  business_date: string;
  completed_activities: number;
  ended_at: string;
  missed_activities: number | null;
  pending_activities: number;
  review_reason: string | null;
  review_status: EarlyClosureReviewStatus;
  reviewed_at: string | null;
  reviewed_by: number | null;
  reviewer_name: string | null;
  staff_id: number;
  staff_name: string;
  staff_reason: string;
  staff_role: EarlyClosureRole;
  started_at: string;
  total_work_minutes: number;
  version: number;
  workday_id: number;
}


export const listEarlyWorkdayClosures = async (
  status: EarlyClosureReviewStatus | "all" = "pending",
  role: EarlyClosureRole | "all" = "all"
): Promise<EarlyClosureReviewItem[]> => {
  const response = await api.get<EarlyClosureReviewItem[]>(
    "/workday-exceptions/early-closures",
    { params: { role, status } }
  );
  return response.data;
};


export const decideEarlyWorkdayClosure = async (
  item: Pick<EarlyClosureReviewItem, "staff_role" | "workday_id">,
  payload: {
    decision: Exclude<EarlyClosureReviewStatus, "pending">;
    reason: string;
    version: number;
  }
): Promise<EarlyClosureReviewItem> => {
  const response = await api.put<EarlyClosureReviewItem>(
    `/workday-exceptions/early-closures/${item.staff_role}/${item.workday_id}/decision`,
    payload
  );
  return response.data;
};
