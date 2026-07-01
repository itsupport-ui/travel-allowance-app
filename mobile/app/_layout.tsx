import type { NotificationResponse } from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect, useRef } from "react";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";

import "../src/services/notificationTask";
import { QueryProvider } from "../src/query/QueryProvider";
import { queryClient } from "../src/query/queryClient";
import { queryKeys } from "../src/query/queryKeys";
import { refreshPushToken } from "../src/services/notificationService";
import { subscribeToSessionExpiry } from "../src/services/sessionService";
import { supportsRemotePushNotifications } from "../src/utils/notificationRuntime";
import { getStoredRole } from "../src/utils/storage";
import {
  clearPendingNotification,
  getNotificationDestination,
  parseNotificationPayload,
  queueNotificationPayload,
} from "../src/utils/notificationRouting";

export default function RootLayout() {
  const handledNotificationIdRef = useRef<string | null>(null);

  useEffect(
    () =>
      subscribeToSessionExpiry(() => {
        queryClient.clear();
        router.replace("/(auth)/login");
      }),
    []
  );

  useEffect(() => {
    if (!supportsRemotePushNotifications()) {
      return;
    }

    let active = true;
    const subscriptions: { remove: () => void }[] = [];

    const configureNotifications = async (): Promise<void> => {
      const Notifications = await import("expo-notifications");

      if (!active) {
        return;
      }

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      const handleNotificationResponse = async (
        response: NotificationResponse
      ): Promise<void> => {
        const notificationId =
          response.notification.request.identifier;

        if (handledNotificationIdRef.current === notificationId) {
          return;
        }

        handledNotificationIdRef.current = notificationId;
        const payload = parseNotificationPayload(
          response.notification.request.content.data
        );

        if (!payload) {
          return;
        }

        const role = await getStoredRole();

        if (!role) {
          await queueNotificationPayload(payload);
          return;
        }

        await clearPendingNotification();
        router.push(getNotificationDestination(payload, role));
      };

      subscriptions.push(
        Notifications.addNotificationResponseReceivedListener(
          (response) => {
            void handleNotificationResponse(response).catch(
              () => undefined
            );
          }
        ),
        Notifications.addNotificationReceivedListener((notification) => {
          void Notifications.setBadgeCountAsync(0).catch(
            () => undefined
          );
          const payload = parseNotificationPayload(
            notification.request.content.data
          );

          if (
            payload?.type === "schedule_assigned" ||
            payload?.type === "schedule_updated"
          ) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.schedules.all,
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.dashboard.summary,
            });

            if (payload.scheduleId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.schedules.detail(
                  payload.scheduleId
                ),
              });
            }
          }

          if (
            payload?.type === "claim_approved" ||
            payload?.type === "claim_rejected"
          ) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.claims.all,
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.dashboard.summary,
            });

            if (payload.claimId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.claims.detail(payload.claimId),
              });
            }
          }
        }),
        Notifications.addPushTokenListener((devicePushToken) => {
          void refreshPushToken(devicePushToken).catch((error: unknown) => {
            if (__DEV__) {
              console.warn("Unable to refresh the push token.", error);
            }
          });
        })
      );

      const response =
        Notifications.getLastNotificationResponse();

      if (!response) {
        return;
      }

      const notificationId =
        response.notification.request.identifier;

      if (handledNotificationIdRef.current === notificationId) {
        Notifications.clearLastNotificationResponse();
        return;
      }

      handledNotificationIdRef.current = notificationId;
      const payload = parseNotificationPayload(
        response.notification.request.content.data
      );

      if (payload) {
        await queueNotificationPayload(payload);
      }

      Notifications.clearLastNotificationResponse();
    };

    void configureNotifications().catch((error: unknown) => {
      if (__DEV__) {
        console.warn("Notification listeners could not be configured.", error);
      }
    });

    return () => {
      active = false;
      subscriptions.forEach((subscription) =>
        subscription.remove()
      );
    };
  }, []);

  return (
    <QueryProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="schedule-details" />
          <Stack.Screen name="travel-details" />
          <Stack.Screen name="claim-details" />
          <Stack.Screen name="doctor-details" />
        </Stack>
      </SafeAreaProvider>
    </QueryProvider>
  );
}
