import { colors, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getHomeRoute } from "../../src/utils/authNavigation";
import { clearAuthSession, getStoredRole, getToken } from "../../src/utils/storage";

const PRIMARY = colors.primary;
const TAB_ICON_SIZE = 20;

export default function AdminLayout() {
  const [authorized, setAuthorized] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;

    const verifyRole = async () => {
      try {
        const [role, token] = await Promise.all([getStoredRole(), getToken()]);
        if (!active) return;

        if (!token) {
          await clearAuthSession();
          router.replace("/(auth)/login");
        } else if (role === "admin") {
          setAuthorized(true);
        } else if (role === "therapist") {
          router.replace(getHomeRoute(role));
        } else {
          router.replace("/");
        }
      } catch {
        if (active) router.replace("/");
      }
    };

    verifyRole();
    return () => { active = false; };
  }, []);

  if (!authorized) {
    return (
      <View style={[styles.loading, { paddingBottom: insets.bottom, paddingTop: insets.top }]}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 60 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? "grid" : "grid-outline"} size={TAB_ICON_SIZE} />
          ),
        }}
      />

      {/* This is the magic fix: We use your existing "therapists" route, 
        but rename the visual title to "Directory" so it represents both Doctors & Therapists.
      */}
      <Tabs.Screen
        name="therapists"
        options={{
          title: "Therapists",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? "people" : "people-outline"} size={TAB_ICON_SIZE} />
          ),
        }}
      />

      <Tabs.Screen
        name="schedules"
        options={{
          title: "Schedules",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? "calendar" : "calendar-outline"} size={TAB_ICON_SIZE} />
          ),
        }}
      />

      <Tabs.Screen
        name="claims"
        options={{
          title: "Claims",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? "receipt" : "receipt-outline"} size={TAB_ICON_SIZE} />
          ),
        }}
      />

      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? "bar-chart" : "bar-chart-outline"} size={TAB_ICON_SIZE} />
          ),
        }}
      />

      {/* --- HIDDEN ROUTES (Hiding doctors & utilities out of the tab bar) --- */}
      <Tabs.Screen name="doctors" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="doctor-create" options={{ href: null }} />
      <Tabs.Screen name="doctor-edit" options={{ href: null }} />
      <Tabs.Screen name="schedule-create" options={{ href: null }} />
      <Tabs.Screen name="schedule-edit" options={{ href: null }} />
      <Tabs.Screen name="therapist-create" options={{ href: null }} />
      <Tabs.Screen name="therapist-edit" options={{ href: null }} />
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 4,
  },
  tabIcon: {
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: typography.size.caption - 1,
    fontWeight: "500",
    marginTop: 2,
  },
});
