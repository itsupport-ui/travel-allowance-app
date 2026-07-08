import { colors } from "@/src/theme";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { getHomeRoute } from "../../src/utils/authNavigation";
import {
  clearAuthSession,
  getStoredRole,
  getToken,
} from "../../src/utils/storage";

export default function DoctorLayout() {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;

    const verifyRole = async () => {
      const [role, token] = await Promise.all([
        getStoredRole(),
        getToken(),
      ]);

      if (!active) {
        return;
      }

      if (!token) {
        await clearAuthSession();
        router.replace("/(auth)/login");
      } else if (role === "doctor") {
        setAuthorized(true);
      } else if (role) {
        router.replace(getHomeRoute(role));
      } else {
        router.replace("/");
      }
    };

    void verifyRole().catch(() => router.replace("/"));

    return () => {
      active = false;
    };
  }, []);

  if (!authorized) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="consultation-details" />
      <Stack.Screen name="consultation-complete" />
      <Stack.Screen name="visit-details" />
      <Stack.Screen name="visit-create" />
      <Stack.Screen name="treatment-plan-details" />
      <Stack.Screen name="treatment-plan-create" />
      <Stack.Screen name="expense-form" />
      <Stack.Screen name="claim-details" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
});
