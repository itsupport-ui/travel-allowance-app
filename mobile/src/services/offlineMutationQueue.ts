import * as Crypto from "expo-crypto";

import { api } from "../api/apiClient";
import type { AuthUser } from "../types/auth";
import type {
  OfflineMutationItem,
  OfflineMutationPayload,
  OfflineMutationType,
  OfflineQueueSummary,
} from "../types/offlineMutation";
import {
  listOfflineMutationItems,
  loadOfflineMutationPayload,
  removeOfflineMutation,
  removeOfflineMutationPayload,
  saveOfflineMutation,
  updateOfflineMutationItem,
} from "../utils/offlineMutationStorage";
import { getStoredUser } from "../utils/storage";
import { normalizeApiError } from "./errorHandler";
import {
  hasOfflineMutationExpired,
  indiaBusinessDate,
  offlineMutationRoute,
  summarizeOfflineItems,
} from "./offlineMutationPolicy";

const QUEUE_LIFETIME_MS = 18 * 60 * 60 * 1000;
const listeners = new Set<() => void>();
let activeSync: Promise<OfflineQueueSummary> | null = null;

export class OfflineMutationQueuedError extends Error {
  readonly queued = true;

  constructor(
    public readonly queueItem: OfflineMutationItem
  ) {
    super(
      "This action was saved securely and will sync when the connection returns."
    );
    this.name = "OfflineMutationQueuedError";
  }
}

export const isOfflineMutationQueuedError = (
  error: unknown
): error is OfflineMutationQueuedError =>
  error instanceof OfflineMutationQueuedError;

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

export const subscribeToOfflineQueue = (
  listener: () => void
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getOfflineQueueSummary = async (
  user?: AuthUser | null
): Promise<OfflineQueueSummary> => {
  const owner = user === undefined ? await getStoredUser() : user;
  if (!owner) return summarizeOfflineItems([]);
  const items = (await listOfflineMutationItems())
    .filter((item) => item.ownerId === owner.id && item.ownerRole === owner.role)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return summarizeOfflineItems(items);
};

interface QueueableMutation<T> {
  body?: Record<string, unknown> | null;
  businessDate?: string;
  execute: (operationId: string) => Promise<T>;
  operationType: OfflineMutationType;
  targetId?: number | null;
}

export const executeOrQueueMutation = async <T>({
  body = null,
  businessDate = indiaBusinessDate(),
  execute,
  operationType,
  targetId = null,
}: QueueableMutation<T>): Promise<T> => {
  const operationId = Crypto.randomUUID();
  try {
    return await execute(operationId);
  } catch (error) {
    const apiError = normalizeApiError(error);
    if (!apiError.isNetworkError) throw error;
    const owner = await getStoredUser();
    if (!owner || owner.role === "admin") throw error;
    const now = new Date();
    const item: OfflineMutationItem = {
      id: operationId,
      ownerId: owner.id,
      ownerRole: owner.role,
      operationType,
      targetId,
      businessDate,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + QUEUE_LIFETIME_MS).toISOString(),
      status: "queued",
      attemptCount: 0,
      lastAttemptAt: null,
      lastErrorCode: null,
    };
    const stored = await saveOfflineMutation(item, { body, version: 1 });
    emitChange();
    throw new OfflineMutationQueuedError(stored);
  }
};

const buildReplayRequest = (
  item: OfflineMutationItem,
  payload: OfflineMutationPayload
): { data?: unknown; headers: Record<string, string>; method: "post"; url: string } => {
  let data: unknown = payload.body ?? undefined;
  const headers: Record<string, string> = {
    "X-Idempotency-Key": item.id,
  };
  if (item.operationType === "therapist_treatment_punch_out") {
    const formData = new FormData();
    Object.entries(payload.body ?? {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    });
    data = formData;
  }
  return {
    data,
    headers,
    method: "post",
    url: offlineMutationRoute(item.operationType, item.targetId),
  };
};

const syncQueue = async (
  includeNeedsAttention: boolean
): Promise<OfflineQueueSummary> => {
  const owner = await getStoredUser();
  if (!owner) return summarizeOfflineItems([]);
  const currentDate = indiaBusinessDate();
  const items = (await getOfflineQueueSummary(owner)).items;

  for (const item of items) {
    if (
      (item.status === "needs_attention" && !includeNeedsAttention)
    ) {
      continue;
    }
    if (hasOfflineMutationExpired(item, currentDate, Date.now())) {
      await removeOfflineMutationPayload(item.id);
      await updateOfflineMutationItem(item.id, {
        lastErrorCode: "BUSINESS_DATE_EXPIRED",
        status: "needs_attention",
      });
      emitChange();
      continue;
    }
    const payload = await loadOfflineMutationPayload(item.id);
    if (!payload) {
      await updateOfflineMutationItem(item.id, {
        lastErrorCode: "SECURE_PAYLOAD_UNAVAILABLE",
        status: "needs_attention",
      });
      emitChange();
      continue;
    }
    await updateOfflineMutationItem(item.id, {
      attemptCount: item.attemptCount + 1,
      lastAttemptAt: new Date().toISOString(),
      lastErrorCode: null,
      status: "syncing",
    });
    emitChange();
    try {
      await api.request(buildReplayRequest(item, payload));
      await removeOfflineMutation(item.id);
      emitChange();
    } catch (error) {
      const apiError = normalizeApiError(error);
      const retryable =
        apiError.isNetworkError ||
        apiError.kind === "server" ||
        apiError.isAuthError;
      await updateOfflineMutationItem(item.id, {
        lastErrorCode: apiError.code ?? apiError.kind.toUpperCase(),
        status: retryable ? "queued" : "needs_attention",
      });
      emitChange();
      if (apiError.isNetworkError || apiError.isAuthError) break;
    }
  }
  return getOfflineQueueSummary(owner);
};

export const processOfflineMutationQueue = async (
  includeNeedsAttention = false
): Promise<OfflineQueueSummary> => {
  if (!activeSync) {
    activeSync = syncQueue(includeNeedsAttention).finally(() => {
      activeSync = null;
    });
  }
  return activeSync;
};

export const discardOfflineMutation = async (id: string): Promise<void> => {
  const owner = await getStoredUser();
  const item = (await listOfflineMutationItems()).find(
    (candidate) => candidate.id === id
  );
  if (!owner || !item || item.ownerId !== owner.id || item.ownerRole !== owner.role) {
    return;
  }
  await removeOfflineMutation(id);
  emitChange();
};

export { offlineMutationLabel } from "./offlineMutationPolicy";
