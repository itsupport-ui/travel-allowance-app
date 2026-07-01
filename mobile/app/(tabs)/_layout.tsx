import { colors, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getHomeRoute } from "../../src/utils/authNavigation";
import {
  clearAuthSession,
  getStoredRole,
  getToken,
} from "../../src/utils/storage";

const PRIMARY = colors.primary;
// Slightly shrinking the icon size can drastically open up breathing room on 5-tab layouts
const TAB_ICON_SIZE = 20; 

export default function TabLayout() {
  const [authorized, setAuthorized] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;

    const verifyRole = async () => {
      try {
        const [role, token] = await Promise.all([
          getStoredRole(),
          getToken(),
        ]);

        if (!active) return;

        if (!token) {
          await clearAuthSession();
          router.replace("/(auth)/login");
        } else if (role === "therapist") {
          setAuthorized(true);
        } else if (role === "admin") {
          router.replace(getHomeRoute(role));
        } else {
          router.replace("/");
        }
      } catch {
        if (active) {
          router.replace("/");
        }
      }
    };

    verifyRole();

    return () => {
      active = false;
    };
  }, []);

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
});
