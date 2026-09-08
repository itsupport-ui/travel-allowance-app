import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import { getToken } from "../utils/storage";


interface ApiErrorBody {
  detail?: unknown;
}

interface DomainAuditEventResponse {
  id: number;
  domain: string;
  entity_type: string;
  entity_id: string;
  action: string;
  outcome: string;
  actor_id: number;
  actor_name: string | null;
  actor_role: string;
  business_date: string;
  from_state: string | null;
  to_state: string | null;
  reason_code: string | null;
  reason: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  correlation_id: string | null;
  details: Record<string, unknown>;
  occurred_at: string;
}

interface DomainAuditEventPageResponse {
  items: DomainAuditEventResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface DomainAuditEvent {
  id: number;
  domain: string;
  entityType: string;
  entityId: string;
  action: string;
  outcome: string;
  actorId: number;
  actorName: string | null;
  actorRole: string;
  businessDate: string;
  fromState: string | null;
  toState: string | null;
  reasonCode: string | null;
  reason: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  correlationId: string | null;
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface DomainAuditEventPage {
  items: DomainAuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface DomainAuditFilters {
  domain?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export class DomainAuditServiceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "DomainAuditServiceError";
  }
}

const normalizeError = (error: unknown): DomainAuditServiceError => {
  if (error instanceof DomainAuditServiceError) return error;
  if (error instanceof AxiosError) {
    if (!error.response) {
      return new DomainAuditServiceError(
        "Unable to reach the server. Check your connection and try again."
      );
    }
    const body = error.response.data as ApiErrorBody | undefined;
    if (error.response.status === 401) {
      return new DomainAuditServiceError(
        "Your session has expired. Please sign in again.",
        401
      );
    }
    if (error.response.status === 403) {
      return new DomainAuditServiceError(
        "You do not have permission to view the audit log.",
        403
      );
    }
    return new DomainAuditServiceError(
      typeof body?.detail === "string"
        ? body.detail
        : "Unable to load the audit log.",
      error.response.status
    );
  }
  return new DomainAuditServiceError(
    error instanceof Error ? error.message : "Unable to load the audit log."
  );
};

const normalizeEvent = (event: DomainAuditEventResponse): DomainAuditEvent => ({
  id: event.id,
  domain: event.domain,
  entityType: event.entity_type,
  entityId: event.entity_id,
  action: event.action,
  outcome: event.outcome,
  actorId: event.actor_id,
  actorName: event.actor_name,
  actorRole: event.actor_role,
  businessDate: event.business_date,
  fromState: event.from_state,
  toState: event.to_state,
  reasonCode: event.reason_code,
  reason: event.reason,
  relatedEntityType: event.related_entity_type,
  relatedEntityId: event.related_entity_id,
  correlationId: event.correlation_id,
  details: event.details,
  occurredAt: event.occurred_at,
});

export const getDomainAuditEvents = async (
  filters: DomainAuditFilters = {}
): Promise<DomainAuditEventPage> => {
  const token = await getToken();
  if (!token) {
    throw new DomainAuditServiceError(
      "Authentication token is missing. Please sign in again.",
      401
    );
  }
  try {
    const response = await api.get<DomainAuditEventPageResponse>(
      "/audit-events/",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          domain: filters.domain || undefined,
          from_date: filters.fromDate,
          to_date: filters.toDate,
          limit: filters.limit ?? 30,
          offset: filters.offset ?? 0,
        },
      }
    );
    return {
      items: response.data.items.map(normalizeEvent),
      total: response.data.total,
      limit: response.data.limit,
      offset: response.data.offset,
    };
  } catch (error) {
    throw normalizeError(error);
  }
};
