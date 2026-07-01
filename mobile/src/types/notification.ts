export type NotificationType =
  | "schedule_assigned"
  | "schedule_updated"
  | "claim_approved"
  | "claim_rejected"
  | "workday_reminder";

export interface NotificationPayload {
  type: NotificationType;
  scheduleId: number | null;
  claimId: number | null;
}

export interface PushTokenRegistrationRequest {
  push_token: string;
  installation_id: string;
  platform: "android" | "ios";
}

export interface PushTokenRegistrationResponse {
  id: number;
  user_id: number;
  installation_id: string;
  platform: string;
  is_active: boolean;
  updated_at: string;
}

export interface PushTokenDeactivationResponse {
  deactivated: boolean;
}
