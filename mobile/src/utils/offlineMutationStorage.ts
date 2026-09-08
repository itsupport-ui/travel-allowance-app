import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type {
  OfflineMutationItem,
  OfflineMutationPayload,
} from "../types/offlineMutation";
import {
  isOfflineMutationType,
  isSameOfflineMutationIntent,
} from "../services/offlineMutationPolicy";

const INDEX_KEY = "offline_mutation_index:v1";
const PAYLOAD_PREFIX = "offline_mutation_payload_v1_";
const MAX_QUEUE_SIZE = 20;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let storageTail: Promise<void> = Promise.resolve();

const payloadKey = (id: string): string => `${PAYLOAD_PREFIX}${id}`;

const withStorageLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const prior = storageTail;
  let release: () => void = () => undefined;
  storageTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prior;
  try {
    return await task();
  } finally {
    release();
  }
};

const isQueueItem = (value: unknown): value is OfflineMutationItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<OfflineMutationItem>;
  return (
    typeof item.id === "string" &&
    typeof item.ownerId === "number" &&
    ["admin", "doctor", "therapist"].includes(item.ownerRole ?? "") &&
    isOfflineMutationType(item.operationType) &&
    (item.targetId === null ||
      (typeof item.targetId === "number" && Number.isInteger(item.targetId))) &&
    typeof item.businessDate === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.expiresAt === "string" &&
    ["needs_attention", "queued", "syncing"].includes(item.status ?? "") &&
    typeof item.attemptCount === "number"
  );
};

const readIndexUnlocked = async (): Promise<OfflineMutationItem[]> => {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid queue index");
    return parsed.filter(isQueueItem).slice(-MAX_QUEUE_SIZE);
  } catch {
    await AsyncStorage.removeItem(INDEX_KEY);
    return [];
  }
};

const writeIndexUnlocked = async (
  items: OfflineMutationItem[]
): Promise<void> => {
  if (!items.length) {
    await AsyncStorage.removeItem(INDEX_KEY);
    return;
  }
  await AsyncStorage.setItem(
    INDEX_KEY,
    JSON.stringify(items.slice(-MAX_QUEUE_SIZE))
  );
};

const requireSecureStore = async (): Promise<void> => {
  if (Platform.OS === "web" || !(await SecureStore.isAvailableAsync())) {
    throw new Error(
      "Secure offline storage is unavailable on this device. Reconnect and try again."
    );
  }
};

export const listOfflineMutationItems = async (): Promise<
  OfflineMutationItem[]
> => withStorageLock(readIndexUnlocked);

export const saveOfflineMutation = async (
  item: OfflineMutationItem,
  payload: OfflineMutationPayload
): Promise<OfflineMutationItem> =>
  withStorageLock(async () => {
    await requireSecureStore();
    const items = await readIndexUnlocked();
    const duplicate = items.find(
      (candidate) =>
        isSameOfflineMutationIntent(candidate, item) &&
        candidate.status !== "needs_attention"
    );
    if (duplicate) return duplicate;
    if (items.length >= MAX_QUEUE_SIZE) {
      throw new Error(
        "The secure sync queue is full. Sync or remove an older action before continuing."
      );
    }
    await SecureStore.setItemAsync(
      payloadKey(item.id),
      JSON.stringify(payload),
      SECURE_OPTIONS
    );
    try {
      await writeIndexUnlocked([...items, item]);
    } catch (error) {
      await SecureStore.deleteItemAsync(payloadKey(item.id), SECURE_OPTIONS);
      throw error;
    }
    return item;
  });

export const loadOfflineMutationPayload = async (
  id: string
): Promise<OfflineMutationPayload | null> => {
  await requireSecureStore();
  const raw = await SecureStore.getItemAsync(payloadKey(id), SECURE_OPTIONS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineMutationPayload>;
    if (parsed.version !== 1 || !("body" in parsed)) return null;
    return parsed as OfflineMutationPayload;
  } catch {
    return null;
  }
};

export const updateOfflineMutationItem = async (
  id: string,
  updates: Partial<OfflineMutationItem>
): Promise<OfflineMutationItem | null> =>
  withStorageLock(async () => {
    const items = await readIndexUnlocked();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const next = { ...items[index], ...updates, id: items[index].id };
    items[index] = next;
    await writeIndexUnlocked(items);
    return next;
  });

export const removeOfflineMutation = async (id: string): Promise<void> =>
  withStorageLock(async () => {
    const items = await readIndexUnlocked();
    await Promise.all([
      writeIndexUnlocked(items.filter((item) => item.id !== id)),
      SecureStore.deleteItemAsync(payloadKey(id), SECURE_OPTIONS).catch(
        () => undefined
      ),
    ]);
  });

export const removeOfflineMutationPayload = async (
  id: string
): Promise<void> => {
  await SecureStore.deleteItemAsync(payloadKey(id), SECURE_OPTIONS).catch(
    () => undefined
  );
};

export const clearAllOfflineMutations = async (): Promise<void> =>
  withStorageLock(async () => {
    const items = await readIndexUnlocked();
    await Promise.all(
      items.map((item) =>
        SecureStore.deleteItemAsync(payloadKey(item.id), SECURE_OPTIONS).catch(
          () => undefined
        )
      )
    );
    await AsyncStorage.removeItem(INDEX_KEY);
  });
