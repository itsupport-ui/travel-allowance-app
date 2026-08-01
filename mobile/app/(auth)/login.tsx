import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormScrollView } from "../../src/components/layout/FormScrollView";
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
  const [passwordVisible, setPasswordVisible] = useState(false);
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
      <FormScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandBlock}>
          <View style={styles.brandIcon}>
            <Ionicons color={colors.surface} name="medical" size={30} />
          </View>
          <Text style={styles.eyebrow}>HOSPITAL MANAGEMENT SYSTEM</Text>
          <Text style={styles.logo}>Travel Allowance</Text>
          <Text style={styles.subtitle}>
            Secure access for your hospital care team
          </Text>
        </View>

        <View style={styles.loginCard}>
          <Text style={styles.welcomeTitle}>Welcome back</Text>
          <Text style={styles.welcomeCopy}>
            Sign in with your registered hospital account.
          </Text>

          <Text style={styles.fieldLabel}>Email address</Text>
          <View style={styles.inputShell}>
            <Ionicons
              color={colors.textMuted}
              name="mail-outline"
              size={20}
            />
            <TextInput
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
              keyboardType="email-address"
              placeholder="doctor@hospital.com"
              placeholderTextColor={colors.textSubtle}
              returnKeyType="next"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.fieldLabel}>Password</Text>
          <View style={styles.inputShell}>
            <Ionicons
              color={colors.textMuted}
              name="lock-closed-outline"
              size={20}
            />
            <TextInput
              accessibilityLabel="Password"
              autoComplete="password"
              editable={!loading}
              placeholder="Enter your password"
              placeholderTextColor={colors.textSubtle}
              returnKeyType="done"
              secureTextEntry={!passwordVisible}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              accessibilityLabel={
                passwordVisible ? "Hide password" : "Show password"
              }
              accessibilityRole="button"
              style={styles.passwordToggle}
              onPress={() => setPasswordVisible((visible) => !visible)}
            >
              <Ionicons
                color={colors.textMuted}
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={21}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            accessibilityLabel="Sign in securely"
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
              <>
                <Text style={styles.buttonText}>Sign in securely</Text>
                <Ionicons
                  color={colors.surface}
                  name="arrow-forward"
                  size={19}
                />
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.securityNote}>
          <Ionicons
            color={colors.primary}
            name="shield-checkmark-outline"
            size={18}
          />
          <Text style={styles.securityText}>
            Protected access. Your session is securely stored on this device.
          </Text>
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
    paddingVertical: spacing.sectionLg,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  brandIcon: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.largePanel,
    height: 64,
    justifyContent: "center",
    marginBottom: spacing.xl,
    width: 64,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    letterSpacing: 1,
    textAlign: "center",
  },
  logo: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.md,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.md,
    textAlign: "center",
  },
  loginCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.largePanel,
    borderWidth: 1,
    padding: spacing.xxl,
  },
  welcomeTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
  },
  welcomeCopy: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.inputBorder,
    borderRadius: radius.panel,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 54,
    paddingLeft: spacing.lg,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    minHeight: 52,
    paddingVertical: spacing.md,
  },
  passwordToggle: {
    alignItems: "center",
    height: 52,
    justifyContent: "center",
    width: 48,
  },
  button: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.panel,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xxl,
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
  securityNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  securityText: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: typography.size.captionLarge,
    lineHeight: typography.lineHeight.small,
  },
});
