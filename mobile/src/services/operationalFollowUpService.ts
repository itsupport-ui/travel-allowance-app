import { api } from "../api/apiClient";

export type FollowUpStatus = "open" | "in_progress" | "resolved" | "cancelled";

export interface OperationalFollowUp {
  id: number;
  source_domain: string;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: FollowUpStatus;
  assignee_id: number | null;
  assignee_name: string | null;
  due_date: string | null;
  created_reason: string;
  resolution: string | null;
  version: number;
  available_actions: string[];
}

export interface FollowUpAssignee {
  id: number;
  name: string;
}

export const getOperationalFollowUps = async (status: FollowUpStatus | "all") => {
  const response = await api.get<{ items: OperationalFollowUp[]; total: number }>(
    "/operational-follow-ups",
    { params: { status, limit: 100 } },
  );
  return response.data;
};

export const getFollowUpAssignees = async () => {
  const response = await api.get<FollowUpAssignee[]>("/operational-follow-ups/assignees");
  return response.data;
};

export const createOperationalFollowUp = async (payload: {
  source_domain: string;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  priority: string;
  assignee_id: number | null;
  due_date?: string | null;
  reason: string;
}) => {
  const response = await api.post<OperationalFollowUp>("/operational-follow-ups", payload);
  return response.data;
};

export const updateOperationalFollowUp = async (
  id: number,
  payload: {
    status: FollowUpStatus;
    version: number;
    assignee_id?: number | null;
    due_date?: string | null;
    priority?: string;
    reason: string;
  },
) => {
  const response = await api.put<OperationalFollowUp>(`/operational-follow-ups/${id}`, payload);
  return response.data;
};
