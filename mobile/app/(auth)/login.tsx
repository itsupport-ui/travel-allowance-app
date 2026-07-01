import { colors, radius, spacing, typography } from "@/src/theme";
import { AxiosError } from "axios";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { queryClient } from "../../src/query/queryClient";
import { queryKeys } from "../../src/query/queryKeys";
import { login } from "../../src/services/authService";
import { initializePushNotifications } from "../../src/services/notificationService";
import { resetSessionExpiry } from "../../src/services/sessionService";
import { getCurrentUser } from "../../src/services/userService";
import { isUserRole } from "../../src/types/auth";
import { getHomeRoute } from "../../src/utils/authNavigation";
import { consumePendingNotificationDestination } from "../../src/utils/notificationRouting";
import {
  clearAuthSession,
  saveToken,
  saveUserSession,
} from "../../src/utils/storage";

const PRIMARY = colors.primary;

const getLoginErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return "Unable to reach the server. Check your connection and try again.";
    }

    const body = error.response.data as { detail?: unknown } | undefined;

    if (typeof body?.detail === "string") {
      return body.detail;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to sign in. Please try again.";
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const loginInProgressRef = useRef(false);

  const handleLogin = async () => {
    if (loginInProgressRef.current) {
      return;
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      Alert.alert("Missing Information", "Enter your email and password.");
      return;
    }

    loginInProgressRef.current = true;
    setLoading(true);

    try {
      const result = await login(normalizedEmail, password);
      await saveToken(result.access_token);

      const user = await getCurrentUser();

      if (!isUserRole(user.role)) {
        throw new Error("This account has an unsupported role.");
      }

      await saveUserSession(user);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.auth.user, user);
      resetSessionExpiry();
      const notificationDestination =
        await consumePendingNotificationDestination(user.role);
      router.replace(
        notificationDestination ?? getHomeRoute(user.role)
      );
      void initializePushNotifications().catch((error: unknown) => {
        if (__DEV__) {
          console.warn(
            "Push notification initialization failed after login.",
            error
          );
        }
      });
    } catch (error) {
      await clearAuthSession();
      queryClient.clear();
      Alert.alert("Login Failed", getLoginErrorMessage(error));
    } finally {
      loginInProgressRef.current = false;
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logo}>Travel Allowance</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        editable={!loading}
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor={colors.textSubtle}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        autoComplete="password"
        editable={!loading}
        placeholder="Password"
        placeholderTextColor={colors.textSubtle}
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
      />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        activeOpacity={0.85}
        disabled={loading}
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxxl,
    backgroundColor: colors.background,
  },
  logo: {
    color: PRIMARY,
    fontSize: typography.size.displayLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.body,
    marginBottom: spacing.sectionLg,
    textAlign: "center",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.body,
    marginBottom: spacing.xl,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.s13,
  },
  button: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 52,
    padding: spacing.lgPlus,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.bold,
    textAlign: "center",
  },
});
