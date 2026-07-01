import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";

import type { UserRole } from "../types/auth";
import type {
  NotificationPayload,
  NotificationType,
} from "../types/notification";

const PENDING_NOTIFICATION_KEY = "pending_notification";

const notificationTypes: NotificationType[] = [
  "schedule_assigned",
  "schedule_updated",
  "claim_approved",
  "claim_rejected",
  "workday_reminder",
];

const isRecord = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNotificationType = (
  value: unknown
): value is NotificationType =>
  typeof value === "string" &&
  notificationTypes.includes(value as NotificationType);

const readPositiveInteger = (
  data: Record<string, unknown>,
  keys: string[]
): number | null => {
  for (const key of keys) {
    const value = data[key];
    const parsedValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : Number.NaN;

    if (Number.isInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  return null;
};

export const parseNotificationPayload = (
  data: unknown
): NotificationPayload | null => {
  if (!isRecord(data) || !isNotificationType(data.type)) {
    return null;
  }

  return {
    claimId: readPositiveInteger(data, ["claim_id", "claimId"]),
    scheduleId: readPositiveInteger(data, [
      "schedule_id",
      "scheduleId",
    ]),
    type: data.type,
  };
};

export const getNotificationDestination = (
  payload: NotificationPayload,
  role: UserRole
): Href => {
  if (
    payload.type === "schedule_assigned" ||
    payload.type === "schedule_updated"
  ) {
    if (role === "admin") {
      return "/(admin)/schedules";
    }

    return payload.scheduleId
      ? {
          pathname: "/schedule-details",
          params: { id: String(payload.scheduleId) },
        }
      : "/(tabs)/schedules";
  }

  if (
    payload.type === "claim_approved" ||
    payload.type === "claim_rejected"
  ) {
    if (role === "admin") {
      return "/(admin)/claims";
    }

    return payload.claimId
      ? {
          pathname: "/claim-details",
          params: { id: String(payload.claimId) },
        }
      : "/(tabs)/claims";
  }

  return role === "admin" ? "/(admin)" : "/(tabs)";
};

export const queueNotificationPayload = async (
  payload: NotificationPayload
): Promise<void> => {
  await AsyncStorage.setItem(
    PENDING_NOTIFICATION_KEY,
    JSON.stringify(payload)
  );
};

export const queueNotificationData = async (
  data: unknown
): Promise<boolean> => {
  const payload = parseNotificationPayload(data);

  if (!payload) {
    return false;
  }

  await queueNotificationPayload(payload);
  return true;
};

export const clearPendingNotification =
  async (): Promise<void> => {
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_KEY);
  };

export const consumePendingNotificationDestination = async (
  role: UserRole
): Promise<Href | null> => {
  try {
    const storedPayload = await AsyncStorage.getItem(
      PENDING_NOTIFICATION_KEY
    );

    if (!storedPayload) {
      return null;
    }

    await clearPendingNotification();
    const parsedPayload: unknown = JSON.parse(storedPayload);
    const payload = parseNotificationPayload(parsedPayload);

    return payload
      ? getNotificationDestination(payload, role)
      : null;
  } catch {
    try {
      await clearPendingNotification();
    } catch {
      // Notification routing must not block authentication recovery.
    }

    return null;
  }
};
