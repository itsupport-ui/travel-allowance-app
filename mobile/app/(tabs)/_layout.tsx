import { colors, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, Tabs, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getHomeRoute } from "../../src/utils/authNavigation";
import { getCurrentUser } from "../../src/services/userService";
import {
  clearAuthSession,
  getStoredRole,
  getToken,
  saveUserSession,
} from "../../src/utils/storage";

const PRIMARY = colors.primary;
// Slightly shrinking the icon size can drastically open up breathing room on 5-tab layouts
const TAB_ICON_SIZE = 20; 

export function ErrorBoundary({
  error,
  retry,
}: ErrorBoundaryProps) {
  return (
    <View style={styles.loading}>
      <Text style={styles.errorTitle}>Therapist workspace unavailable</Text>
      <Text style={styles.errorText}>
        {error.message ||
          "The therapist workspace could not be displayed. Please try again."}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.retryButton}
        onPress={() => void retry()}
      >
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.loginButton}
        onPress={async () => {
          await clearAuthSession();
          router.replace("/(auth)/login");
        }}
      >
        <Text style={styles.loginText}>Login again</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TabLayout() {
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;

    const verifyRole = async () => {
      try {
        setAuthError(null);
        const [role, token] = await Promise.all([
          getStoredRole(),
          getToken(),
        ]);

        if (!active) return;

        if (!token) {
          await clearAuthSession();
          router.replace("/(auth)/login");
          return;
        }

        let resolvedRole = role;

        if (resolvedRole === null) {
          const user = await getCurrentUser();
          await saveUserSession(user);
          resolvedRole = user.role;
        }

        if (!active) return;

        if (resolvedRole === "therapist") {
          setAuthorized(true);
        } else {
          router.replace(getHomeRoute(resolvedRole));
        }
      } catch {
        if (active) {
          setAuthError(
            "Unable to open therapist workspace. Check your connection and try again."
          );
        }
      }
    };

    verifyRole();

    return () => {
      active = false;
    };
  }, [retryAttempt]);

  if (authError) {
    return (
      <View
        style={[
          styles.loading,
          {
            paddingBottom: insets.bottom,
            paddingTop: insets.top,
          },
        ]}
      >
        <Text style={styles.errorTitle}>Therapist workspace unavailable</Text>
        <Text style={styles.errorText}>{authError}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.retryButton}
          onPress={() => {
            setAuthError(null);
            setAuthorized(false);
            setRetryAttempt((attempt) => attempt + 1);
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.loginButton}
          onPress={async () => {
            await clearAuthSession();
            router.replace("/(auth)/login");
          }}
        >
          <Text style={styles.loginText}>Login again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!authorized) {
    return (
      <View
        style={[
          styles.loading,
          {
            paddingBottom: insets.bottom,
            paddingTop: insets.top,
          },
        ]}
      >
        <ActivityIndicator color={PRIMARY} size="large" />
        <Text style={styles.loadingText}>
          Opening therapist workspace...
        </Text>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
          paddingTop: insets.top,
        },
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarShowLabel: true,
        tabBarStyle: [
          styles.tabBar,
          {
            // Increased baseline height from 56 to 60 for better breathing room
            height: 60 + insets.bottom, 
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "home" : "home-outline"}
              size={TAB_ICON_SIZE}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="schedules"
        options={{
          title: "Schedule", // Changed from "Schedules" to singular to save precious horizontal pixels
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "calendar" : "calendar-outline"}
              size={TAB_ICON_SIZE}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="travel"
        options={{
          title: "Travel",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "navigate" : "navigate-outline"}
              size={TAB_ICON_SIZE}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="claims"
        options={{
          title: "Claims",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "receipt" : "receipt-outline"}
              size={TAB_ICON_SIZE}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "person" : "person-outline"}
              size={TAB_ICON_SIZE}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6, 
    // Soft shadow to give it a premium, separated feel instead of a harsh flat border line
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 4,
  },
  tabIcon: {
    marginBottom: 2, // Keeps a tiny separation between icon and text
  },
  tabLabel: {
    fontSize: typography.size.caption - 1, // Shrink by 1px if your default caption is large
    fontWeight: "500", // "500" (Medium) or "400" (Regular) is much cleaner than Bold for tiny labels
    marginTop: 2,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
    marginTop: 14,
  },
  errorTitle: {
    color: colors.textStrong,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  errorText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: 8,
    paddingHorizontal: 28,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 44,
    minWidth: 120,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  loginButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    minHeight: 44,
  },
  loginText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
