import { colors, spacing, typography } from "@/src/theme";
import { router } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { queryClient } from "../src/query/queryClient";
import { queryKeys } from "../src/query/queryKeys";
import { getCurrentUser } from "../src/services/userService";
import { initializePushNotifications } from "../src/services/notificationService";
import { resetSessionExpiry } from "../src/services/sessionService";
import { isUserRole } from "../src/types/auth";
import { getHomeRoute } from "../src/utils/authNavigation";
import { consumePendingNotificationDestination } from "../src/utils/notificationRouting";
import {
  clearAuthSession,
  getToken,
  saveUserSession,
} from "../src/utils/storage";

const PRIMARY = colors.primary;

export default function SplashScreen() {
  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      try {
        const token = await getToken();

        if (!token) {
          if (active) {
            router.replace("/(auth)/login");
          }
          return;
        }

        const user = await getCurrentUser();

        if (!isUserRole(user.role)) {
          throw new Error("Unsupported user role.");
        }

        await saveUserSession(user);
        queryClient.setQueryData(queryKeys.auth.user, user);
        resetSessionExpiry();
        const notificationDestination =
          await consumePendingNotificationDestination(user.role);

        if (active) {
          router.replace(
            notificationDestination ?? getHomeRoute(user.role)
          );
          void initializePushNotifications().catch((error: unknown) => {
            if (__DEV__) {
              console.warn(
                "Push notification initialization failed during session restore.",
                error
              );
            }
          });
        }
      } catch {
        try {
          await clearAuthSession();
          queryClient.clear();
        } catch {
          // Navigation must still recover if local storage is unavailable.
        }

        if (active) {
          router.replace("/(auth)/login");
        }
      }
    };

    checkAuth();

    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator color={PRIMARY} size="large" />
      <Text style={styles.title}>Travel Allowance</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  title: {
    color: colors.textStrong,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xxl,
  },
});
