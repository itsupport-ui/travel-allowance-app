import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  isSecureDraftMetadata,
  SECURE_DRAFT_VERSION,
  splitSecureDraft,
  type SecureDraftMetadata,
} from "./formDraftPolicy";

const LEGACY_FORM_DRAFT_PREFIX = "form_draft:v1:";
const DRAFT_METADATA_PREFIX = "form_draft_meta:v2:";
const DRAFT_PAYLOAD_PREFIX = "form_draft_payload_v2_";
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

interface FormDraftEnvelope<T> {
  data: T;
  savedAt: string;
  version: 1;
}

export interface StoredFormDraft<T> {
  data: T;
  savedAt: string;
}

const digestKey = (key: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);

const metadataKey = (digest: string): string =>
  `${DRAFT_METADATA_PREFIX}${digest}`;

const payloadKey = (
  digest: string,
  generation: string,
  index: number
): string => `${DRAFT_PAYLOAD_PREFIX}${digest}_${generation}_${index}`;

const requireSecureStorage = async (): Promise<void> => {
  if (Platform.OS === "web" || !(await SecureStore.isAvailableAsync())) {
    throw new Error("Secure form-draft storage is unavailable on this device.");
  }
};

const readMetadata = async (
  digest: string
): Promise<SecureDraftMetadata | null> => {
  const raw = await AsyncStorage.getItem(metadataKey(digest));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSecureDraftMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const deleteSecurePayload = async (
  digest: string,
  generation: string,
  chunkCount: number
): Promise<void> => {
  await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(
        payloadKey(digest, generation, index),
        SECURE_OPTIONS
      ).catch(() => undefined)
    )
  );
};

const deleteSecureDraft = async (
  digest: string,
  generation: string,
  chunkCount: number
): Promise<void> => {
  await Promise.all([
    AsyncStorage.removeItem(metadataKey(digest)),
    deleteSecurePayload(digest, generation, chunkCount),
  ]);
};

export const buildFormDraftKey = (
  userId: number,
  formName: string
): string => `${LEGACY_FORM_DRAFT_PREFIX}${userId}:${formName}`;

export const saveFormDraft = async <T>(
  key: string,
  data: T
): Promise<string> => {
  await requireSecureStorage();
  const savedAt = new Date().toISOString();
  const digest = await digestKey(key);
  const previous = await readMetadata(digest);
  const generation = Crypto.randomUUID().replaceAll("-", "");
  const envelope: FormDraftEnvelope<T> = { data, savedAt, version: 1 };
  const chunks = splitSecureDraft(JSON.stringify(envelope));

  try {
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(
          payloadKey(digest, generation, index),
          chunk,
          SECURE_OPTIONS
        )
      )
    );
    const metadata: SecureDraftMetadata = {
      chunkCount: chunks.length,
      digest,
      generation,
      savedAt,
      version: SECURE_DRAFT_VERSION,
    };
    await AsyncStorage.setItem(metadataKey(digest), JSON.stringify(metadata));
    await AsyncStorage.removeItem(key).catch(() => undefined);
    if (previous) {
      await deleteSecurePayload(
        previous.digest,
        previous.generation,
        previous.chunkCount
      );
    }
    return savedAt;
  } catch (error) {
    await Promise.all(
      chunks.map((_, index) =>
        SecureStore.deleteItemAsync(
          payloadKey(digest, generation, index),
          SECURE_OPTIONS
        ).catch(() => undefined)
      )
    );
    throw error;
  }
};

export const loadFormDraft = async <T>(
  key: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS
): Promise<StoredFormDraft<T> | null> => {
  await requireSecureStorage();
  const digest = await digestKey(key);
  const metadata = await readMetadata(digest);

  if (!metadata) {
    // Pre-encryption drafts are deleted instead of loading sensitive legacy data.
    await AsyncStorage.removeItem(key);
    return null;
  }
  const savedAtMs = Date.parse(metadata.savedAt);
  if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > maxAgeMs) {
    await deleteSecureDraft(
      digest,
      metadata.generation,
      metadata.chunkCount
    );
    return null;
  }

  try {
    const chunks = await Promise.all(
      Array.from({ length: metadata.chunkCount }, (_, index) =>
        SecureStore.getItemAsync(
          payloadKey(digest, metadata.generation, index),
          SECURE_OPTIONS
        )
      )
    );
    if (chunks.some((chunk) => chunk === null)) {
      throw new Error("Incomplete secure form draft");
    }
    const parsed = JSON.parse(chunks.join("")) as FormDraftEnvelope<T>;
    if (parsed.version !== 1 || parsed.savedAt !== metadata.savedAt) {
      throw new Error("Invalid secure form draft");
    }
    return { data: parsed.data, savedAt: parsed.savedAt };
  } catch {
    await deleteSecureDraft(
      digest,
      metadata.generation,
      metadata.chunkCount
    );
    return null;
  }
};

export const removeFormDraft = async (key: string): Promise<void> => {
  const digest = await digestKey(key);
  const metadata = await readMetadata(digest);
  await AsyncStorage.removeItem(key);
  if (metadata) {
    await deleteSecureDraft(
      digest,
      metadata.generation,
      metadata.chunkCount
    );
  }
};

export const clearAllFormDrafts = async (): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys();
  const metadataKeys = keys.filter((key) => key.startsWith(DRAFT_METADATA_PREFIX));
  const legacyKeys = keys.filter((key) =>
    key.startsWith(LEGACY_FORM_DRAFT_PREFIX)
  );
  const metadata = await Promise.all(
    metadataKeys.map(async (key) => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isSecureDraftMetadata(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
  );
  await Promise.all([
    AsyncStorage.multiRemove([...metadataKeys, ...legacyKeys]),
    ...metadata.flatMap((item) =>
      item
        ? Array.from({ length: item.chunkCount }, (_, index) =>
            SecureStore.deleteItemAsync(
              payloadKey(item.digest, item.generation, index),
              SECURE_OPTIONS
            ).catch(() => undefined)
          )
        : []
    ),
  ]);
};
