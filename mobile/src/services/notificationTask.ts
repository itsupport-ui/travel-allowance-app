import type {
  NotificationResponse,
  NotificationTaskPayload,
} from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { supportsRemotePushNotifications } from "../utils/notificationRuntime";
import { queueNotificationData } from "../utils/notificationRouting";

const BACKGROUND_NOTIFICATION_TASK =
  "travel-allowance-background-notification";

const isNotificationResponse = (
  value: NotificationTaskPayload
): value is NotificationResponse =>
  "actionIdentifier" in value && "notification" in value;

if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<NotificationTaskPayload>(
    BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error || !isNotificationResponse(data)) {
        return;
      }

      await queueNotificationData(
        data.notification.request.content.data
      );
    }
  );
}

const registerBackgroundNotificationTask =
  async (): Promise<void> => {
    if (!supportsRemotePushNotifications()) {
      return;
    }

    const Notifications = await import("expo-notifications");
    const registered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_NOTIFICATION_TASK
    );

    if (!registered) {
      await Notifications.registerTaskAsync(
        BACKGROUND_NOTIFICATION_TASK
      );
    }
  };

void registerBackgroundNotificationTask().catch(() => undefined);
