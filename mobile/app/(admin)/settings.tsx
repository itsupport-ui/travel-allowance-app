import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { queryClient } from "../../src/query/queryClient";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { deactivatePushToken } from "../../src/services/notificationService";
import {
  getSettings,
  updateSettings,
} from "../../src/services/settingsService";
import type { AuthUser } from "../../src/types/auth";
import type { AppSettings } from "../../src/types/settings";
import {
  clearAuthSession,
  getStoredUser,
} from "../../src/utils/storage";

const PRIMARY = colors.primary;
const MONEY_PATTERN = /^\d+(?:\.\d{0,2})?$/;

interface RateForm {
  perKmRate: string;
  dailyAllowance: string;
}

const toForm = (settings: AppSettings): RateForm => ({
  perKmRate: String(settings.per_km_rate),
  dailyAllowance: String(settings.daily_allowance),
});

const validateMoney = (value: string, label: string): string | null => {
  const normalized = value.trim();
  if (!normalized) return `${label} is required.`;
  if (!MONEY_PATTERN.test(normalized)) {
    return `${label} must be zero or a positive number with up to two decimal places.`;
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return `${label} must be a valid non-negative amount.`;
  }
  return null;
};

export default function AdminSettingsScreen() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [form, setForm] = useState<RateForm>({
    perKmRate: "",
    dailyAllowance: "",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  const loadData = useCallback(async (refresh = false): Promise<void> => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [storedUser, currentSettings] = await Promise.all([
        getStoredUser(),
        getSettings(),
      ]);
      if (!storedUser) {
        router.replace("/(auth)/login");
        return;
      }
      setUser(storedUser);
      setSettings(currentSettings);
      setForm(toForm(currentSettings));
    } catch (loadError) {
      const message = getApiErrorMessage(
        loadError,
        "Unable to load application settings."
      );
      if (refresh) Alert.alert("Refresh Failed", message);
      else setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const validation = useMemo(
    () => ({
      perKmRate: validateMoney(form.perKmRate, "Per-KM rate"),
      dailyAllowance: validateMoney(
        form.dailyAllowance,
        "Daily allowance"
      ),
    }),
    [form]
  );

  const isDirty =
    settings !== null &&
    (Number(form.perKmRate) !== settings.per_km_rate ||
      Number(form.dailyAllowance) !== settings.daily_allowance);
  const hasValidationError =
    validation.perKmRate !== null ||
    validation.dailyAllowance !== null;
  const saveDisabled =
    !isDirty || hasValidationError || submitting;

  const handleSave = async (): Promise<void> => {
    if (saveDisabled || submitInFlight.current) return;

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const savedSettings = await updateSettings({
        per_km_rate: Number(form.perKmRate),
        daily_allowance: Number(form.dailyAllowance),
      });
      setSettings(savedSettings);
      setForm(toForm(savedSettings));
      Alert.alert(
        "Settings Updated",
        "New rates will apply to newly generated travel entries and future claims. Historical records keep their saved rates."
      );
    } catch (saveError) {
      Alert.alert(
        "Unable to Save Settings",
        getApiErrorMessage(
          saveError,
          "Unable to update application settings."
        )
      );
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      try {
        await deactivatePushToken();
      } catch (deactivationError) {
        if (__DEV__) {
          console.warn(
            "Unable to deactivate push token during logout.",
            deactivationError
          );
        }
      }
      await clearAuthSession();
      queryClient.clear();
      router.replace("/(auth)/login");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleBack = (): void => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(admin)");
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={PRIMARY} size="large" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  if (error || !user || !settings) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.stateContainer}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={34}
          />
          <Text style={styles.stateTitle}>Settings unavailable</Text>
          <Text style={styles.stateMessage}>
            {error ?? "Unable to load application settings."}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void loadData()}
            style={styles.retryButton}
          >
            <Ionicons color={colors.surface} name="refresh" size={18} />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[PRIMARY]}
              onRefresh={() => void loadData(true)}
              refreshing={refreshing}
              tintColor={PRIMARY}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              accessibilityLabel="Back to admin dashboard"
              accessibilityRole="button"
              activeOpacity={0.8}
              hitSlop={8}
              onPress={handleBack}
              style={styles.backButton}
            >
              <Ionicons
                color={colors.textSecondary}
                name="arrow-back"
                size={22}
              />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Administration</Text>
              <Text style={styles.title}>Settings</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Travel Rates</Text>
          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.iconBox}>
                <Ionicons
                  color={PRIMARY}
                  name="cash-outline"
                  size={22}
                />
              </View>
              <View style={styles.headingText}>
                <Text style={styles.cardTitle}>Allowance Configuration</Text>
                <Text style={styles.cardSubtitle}>
                  Used for new travel entries and claims.
                </Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>Per-KM Rate</Text>
            <View
              style={[
                styles.inputRow,
                validation.perKmRate && styles.inputRowInvalid,
              ]}
            >
              <Text style={styles.currencyPrefix}>INR</Text>
              <TextInput
                accessibilityLabel="Per-KM rate"
                editable={!submitting}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    perKmRate: value,
                  }))
                }
                placeholder="0.00"
                placeholderTextColor={colors.textSubtle}
                selectTextOnFocus
                style={styles.input}
                value={form.perKmRate}
              />
            </View>
            {validation.perKmRate ? (
              <Text style={styles.validationText}>
                {validation.perKmRate}
              </Text>
            ) : null}

            <Text style={[styles.inputLabel, styles.secondLabel]}>
              Daily Allowance
            </Text>
            <View
              style={[
                styles.inputRow,
                validation.dailyAllowance && styles.inputRowInvalid,
              ]}
            >
              <Text style={styles.currencyPrefix}>INR</Text>
              <TextInput
                accessibilityLabel="Daily allowance"
                editable={!submitting}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    dailyAllowance: value,
                  }))
                }
                placeholder="0.00"
                placeholderTextColor={colors.textSubtle}
                selectTextOnFocus
                style={styles.input}
                value={form.dailyAllowance}
              />
            </View>
            {validation.dailyAllowance ? (
              <Text style={styles.validationText}>
                {validation.dailyAllowance}
              </Text>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: saveDisabled }}
              activeOpacity={0.85}
              disabled={saveDisabled}
              onPress={() => void handleSave()}
              style={[
                styles.saveButton,
                saveDisabled && styles.buttonDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Ionicons
                  color={colors.surface}
                  name="save-outline"
                  size={19}
                />
              )}
              <Text style={styles.saveText}>
                {submitting ? "Saving..." : "Save Rates"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Account</Text>
          <View style={[styles.card, styles.accountCard]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.username.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.username}>{user.username}</Text>
            <Text style={styles.email}>{user.email}</Text>

            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValue}>Administrator</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Status</Text>
              <Text style={styles.activeValue}>
                {user.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: loggingOut }}
            activeOpacity={0.85}
            disabled={loggingOut}
            onPress={() => void handleLogout()}
            style={[
              styles.logoutButton,
              loggingOut && styles.buttonDisabled,
            ]}
          >
            {loggingOut ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Ionicons
                color={colors.danger}
                name="log-out-outline"
                size={20}
              />
            )}
            <Text style={styles.logoutText}>
              {loggingOut ? "Signing Out..." : "Log Out"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.s80,
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.lg,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: spacing.xlPlus,
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xxl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  cardHeading: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: spacing.xxl,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headingText: { flex: 1, marginLeft: spacing.lg },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
  },
  secondLabel: { marginTop: spacing.xl },
  inputRow: {
    alignItems: "center",
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
    overflow: "hidden",
  },
  inputRowInvalid: { borderColor: colors.danger },
  currencyPrefix: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xlPlus,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  validationText: {
    color: colors.danger,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.small,
    marginTop: spacing.sm,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xxl,
    minHeight: 50,
  },
  saveText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  buttonDisabled: { opacity: 0.55 },
  accountCard: { alignItems: "center" },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 62,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 62,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.size25,
    fontWeight: typography.weight.extrabold,
  },
  username: {
    color: colors.textPrimary,
    fontSize: typography.size.size19,
    fontWeight: typography.weight.extrabold,
  },
  email: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.xs,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xlPlus,
    width: "100%",
  },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.s13,
    width: "100%",
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  infoValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  activeValue: {
    color: colors.primaryDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xxxl,
    minHeight: 52,
  },
  logoutText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  stateContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.section,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  stateMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.md,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
