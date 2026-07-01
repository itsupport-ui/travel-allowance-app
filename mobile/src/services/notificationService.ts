import { colors } from "@/src/theme";
import { AxiosError } from "axios";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { api } from "../api/apiClient";
import { appConfig } from "../config/env";
import { ApiError } from "./errorHandler";
import type {
  PushTokenRegistrationRequest,
  PushTokenRegistrationResponse,
  PushTokenDeactivationResponse,
} from "../types/notification";
import { supportsRemotePushNotifications } from "../utils/notificationRuntime";
import { getToken } from "../utils/storage";

const PUSH_TOKEN_KEY = "expo_push_token";
const INSTALLATION_ID_KEY = "push_installation_id";
const ANDROID_CHANNEL_ID = "general";
const MAX_REGISTRATION_ATTEMPTS = 3;
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible:
    SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

interface ApiErrorBody {
  detail?: unknown;
}

type NativePushToken =
  import("expo-notifications").DevicePushToken;
type NotificationsModule = typeof import("expo-notifications");

export class NotificationServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "configuration"
      | "device"
      | "network"
      | "permission"
      | "registration"
      | "storage",
    public readonly status?: number
  ) {
    super(message);
    this.name = "NotificationServiceError";
  }
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const loadNotifications =
  async (): Promise<NotificationsModule> => {
    if (!appConfig.features.pushNotifications) {
      throw new NotificationServiceError(
        "Push notifications are disabled for this environment.",
        "configuration"
      );
    }

    if (!supportsRemotePushNotifications()) {
      throw new NotificationServiceError(
        "Remote push notifications require an Expo development or production build.",
        "device"
      );
    }

    return import("expo-notifications");
  };

const getConfiguredProjectId = (): string | null => {
  if (appConfig.easProjectId) {
    return appConfig.easProjectId;
  }

  const easProjectId = Constants.easConfig?.projectId;

  if (easProjectId) {
    return easProjectId;
  }

  const easExtra = Constants.expoConfig?.extra?.eas;

  if (
    typeof easExtra === "object" &&
    easExtra !== null &&
    "projectId" in easExtra &&
    typeof easExtra.projectId === "string"
  ) {
    return easExtra.projectId;
  }

  return null;
};

const ensureSecureStorage = async (): Promise<void> => {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new NotificationServiceError(
      "Secure storage is unavailable on this device.",
      "storage"
    );
  }
};

const savePushToken = async (pushToken: string): Promise<void> => {
  await ensureSecureStorage();

  try {
    await SecureStore.setItemAsync(
      PUSH_TOKEN_KEY,
      pushToken,
      SECURE_STORE_OPTIONS
    );
  } catch {
    throw new NotificationServiceError(
      "Unable to store the push token securely.",
      "storage"
    );
  }
};

const getInstallationId = async (): Promise<string> => {
  await ensureSecureStorage();

  try {
    const storedId = await SecureStore.getItemAsync(
      INSTALLATION_ID_KEY,
      SECURE_STORE_OPTIONS
    );

    if (storedId) {
      return storedId;
    }

    const installationId = Crypto.randomUUID();
    await SecureStore.setItemAsync(
      INSTALLATION_ID_KEY,
      installationId,
      SECURE_STORE_OPTIONS
    );
    return installationId;
  } catch (error) {
    if (error instanceof NotificationServiceError) {
      throw error;
    }

    throw new NotificationServiceError(
      "Unable to create a secure device installation identifier.",
      "storage"
    );
  }
};

const configureAndroidChannel = async (
  Notifications: NotificationsModule
): Promise<void> => {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(
    ANDROID_CHANNEL_ID,
    {
      description:
        "Schedule, claim, and workday notifications",
      enableVibrate: true,
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: colors.primary,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
      name: "General Notifications",
      showBadge: true,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    }
  );
};

const normalizeRegistrationError = (
  error: unknown
): NotificationServiceError => {
  if (error instanceof NotificationServiceError) {
    return error;
  }

  if (error instanceof ApiError) {
    return new NotificationServiceError(
      error.message,
      error.isNetworkError ? "network" : "registration",
      error.status
    );
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      return new NotificationServiceError(
        "Unable to register this device for notifications. Check your connection and try again.",
        "network"
      );
    }

    const body = error.response.data as ApiErrorBody | undefined;
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : "Unable to register this device for notifications.";

    return new NotificationServiceError(
      detail,
      "registration",
      error.response.status
    );
  }

  return new NotificationServiceError(
    "Unable to initialize push notifications.",
    "registration"
  );
};

const isRetryableRegistrationError = (error: unknown): boolean => {
  if (error instanceof ApiError) {
    return (
      error.isNetworkError ||
      error.status === 408 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500)
    );
  }

  if (!(error instanceof AxiosError)) {
    return false;
  }

  const status = error.response?.status;
  return (
    !error.response ||
    status === 408 ||
    status === 429 ||
    (typeof status === "number" && status >= 500)
  );
};

export const requestPermissions = async (): Promise<boolean> => {
  if (!appConfig.features.pushNotifications) {
    return false;
  }

  if (!supportsRemotePushNotifications()) {
    return false;
  }

  try {
    const Notifications = await loadNotifications();
    await configureAndroidChannel(Notifications);

    const currentPermissions =
      await Notifications.getPermissionsAsync();

    if (currentPermissions.status === "granted") {
      return true;
    }

    if (!currentPermissions.canAskAgain) {
      return false;
    }

    const requestedPermissions =
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

    return requestedPermissions.status === "granted";
  } catch {
    throw new NotificationServiceError(
      "Unable to check notification permissions.",
      "permission"
    );
  }
};

export const getPushToken = async (
  devicePushToken?: NativePushToken
): Promise<string> => {
  if (!Device.isDevice) {
    throw new NotificationServiceError(
      "Push notifications require a physical device.",
      "device"
    );
  }

  if (!supportsRemotePushNotifications()) {
    throw new NotificationServiceError(
      "Remote push notifications require an Expo development or production build.",
      "device"
    );
  }

  if (
    Platform.OS !== "android" &&
    Platform.OS !== "ios"
  ) {
    throw new NotificationServiceError(
      "Push notifications are supported only on Android and iOS.",
      "device"
    );
  }

  if (!(await requestPermissions())) {
    throw new NotificationServiceError(
      "Notification permission was not granted.",
      "permission"
    );
  }

  const projectId = getConfiguredProjectId();

  if (!projectId) {
    throw new NotificationServiceError(
      "Expo project ID is missing. Configure EXPO_PUBLIC_EAS_PROJECT_ID or extra.eas.projectId.",
      "configuration"
    );
  }

  const Notifications = await loadNotifications();

  for (
    let attempt = 1;
    attempt <= MAX_REGISTRATION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const pushToken =
        await Notifications.getExpoPushTokenAsync({
          devicePushToken,
          projectId,
        });
      await savePushToken(pushToken.data);
      return pushToken.data;
    } catch (error) {
      if (error instanceof NotificationServiceError) {
        throw error;
      }

      if (attempt < MAX_REGISTRATION_ATTEMPTS) {
        const backoffMilliseconds =
          750 * 2 ** (attempt - 1) +
          Math.floor(Math.random() * 250);
        await wait(backoffMilliseconds);
      }
    }
  }

  throw new NotificationServiceError(
    "Unable to retrieve an Expo push token. Check the network and notification credentials.",
    "network"
  );
};

export const registerPushToken = async (
  pushToken?: string
): Promise<PushTokenRegistrationResponse> => {
  const token = await getToken();

  if (!token) {
    throw new NotificationServiceError(
      "Authentication is required to register notifications.",
      "registration",
      401
    );
  }

  const resolvedPushToken = pushToken ?? (await getPushToken());
  const installationId = await getInstallationId();

  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new NotificationServiceError(
      "Push notifications are supported only on Android and iOS.",
      "device"
    );
  }

  const payload: PushTokenRegistrationRequest = {
    installation_id: installationId,
    platform: Platform.OS,
    push_token: resolvedPushToken,
  };

  for (
    let attempt = 1;
    attempt <= MAX_REGISTRATION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const response =
        await api.post<PushTokenRegistrationResponse>(
          "/notifications/push-token",
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 8_000,
          }
        );

      return response.data;
    } catch (error) {
      const shouldRetry =
        attempt < MAX_REGISTRATION_ATTEMPTS &&
        isRetryableRegistrationError(error);

      if (!shouldRetry) {
        throw normalizeRegistrationError(error);
      }

      const backoffMilliseconds =
        750 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await wait(backoffMilliseconds);
    }
  }

  throw new NotificationServiceError(
    "Unable to register this device for notifications.",
    "registration"
  );
};

export const initializePushNotifications =
  async (): Promise<void> => {
    if (!supportsRemotePushNotifications()) {
      return;
    }

    const pushToken = await getPushToken();
    await registerPushToken(pushToken);
  };

export const refreshPushToken = async (
  devicePushToken: NativePushToken
): Promise<void> => {
  const pushToken = await getPushToken(devicePushToken);
  await registerPushToken(pushToken);
};

export const clearStoredPushToken = async (): Promise<void> => {
  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.deleteItemAsync(
    PUSH_TOKEN_KEY,
    SECURE_STORE_OPTIONS
  );
};

export const deactivatePushToken = async (): Promise<boolean> => {
  const token = await getToken();

  if (!token || !(await SecureStore.isAvailableAsync())) {
    return false;
  }

  const installationId = await SecureStore.getItemAsync(
    INSTALLATION_ID_KEY,
    SECURE_STORE_OPTIONS
  );

  if (!installationId) {
    return false;
  }

  const response = await api.delete<PushTokenDeactivationResponse>(
    "/notifications/push-token",
    {
      data: { installation_id: installationId },
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 8_000,
    }
  );

  await clearStoredPushToken();
  return response.data.deactivated;
};
