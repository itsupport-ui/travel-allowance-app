import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormScrollView } from "../../src/components/layout/FormScrollView";
import { DateTimeField } from "../../src/components/schedule/ScheduleFormControls";
import { queryClient } from "../../src/query/queryClient";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { deactivatePushToken } from "../../src/services/notificationService";
import {
  getSettings,
  getLocationPolicy,
  getLocationPolicyHistory,
  getReimbursementPolicyHistory,
  updateLocationPolicy,
  updateSettings,
} from "../../src/services/settingsService";
import type { AuthUser } from "../../src/types/auth";
import type { AppSettings, LocationPolicy } from "../../src/types/settings";
import { formatScheduleDate } from "../../src/utils/scheduleForm";
import {
  clearAuthSession,
  getStoredUser,
} from "../../src/utils/storage";

const PRIMARY = colors.primary;
const MONEY_PATTERN = /^\d+(?:\.\d{0,2})?$/;

interface RateForm {
  perKmRate: string;
  dailyAllowance: string;
  doctorReceiptThreshold: string;
}

interface LocationPolicyForm {
  approvalValidHours: string;
  evidenceMaxAgeMinutes: string;
  geofenceRadiusM: string;
  gpsAccuracyThresholdM: string;
  maxEvidenceMovementM: string;
}

const toForm = (settings: AppSettings): RateForm => ({
  perKmRate: String(settings.per_km_rate),
  dailyAllowance: String(settings.daily_allowance),
  doctorReceiptThreshold: String(settings.doctor_receipt_threshold),
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

const toLocationForm = (policy: LocationPolicy): LocationPolicyForm => ({
  approvalValidHours: String(policy.approval_valid_hours),
  evidenceMaxAgeMinutes: String(policy.evidence_max_age_minutes),
  geofenceRadiusM: String(policy.geofence_radius_m),
  gpsAccuracyThresholdM: String(policy.gps_accuracy_threshold_m),
  maxEvidenceMovementM: String(policy.max_evidence_movement_m),
});

const validateRange = (
  value: string,
  label: string,
  minimum: number,
  maximum: number,
  integer = false
): string | null => {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) return `${label} is required.`;
  if (number < minimum || number > maximum) {
    return `${label} must be between ${minimum} and ${maximum}.`;
  }
  if (integer && !Number.isInteger(number)) return `${label} must be a whole number.`;
  return null;
};

export default function AdminSettingsScreen() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [reimbursementHistory, setReimbursementHistory] = useState<AppSettings[]>([]);
  const [locationPolicy, setLocationPolicy] = useState<LocationPolicy | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationPolicy[]>([]);
  const [form, setForm] = useState<RateForm>({
    perKmRate: "",
    dailyAllowance: "",
    doctorReceiptThreshold: "",
  });
  const [locationForm, setLocationForm] = useState<LocationPolicyForm>({
    approvalValidHours: "8",
    evidenceMaxAgeMinutes: "15",
    geofenceRadiusM: "250",
    gpsAccuracyThresholdM: "250",
    maxEvidenceMovementM: "250",
  });
  const [locationEffectiveDate, setLocationEffectiveDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationSubmitting, setLocationSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  const loadData = useCallback(async (refresh = false): Promise<void> => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [storedUser, currentSettings, reimbursementPolicies, currentLocationPolicy, policyHistory] = await Promise.all([
        getStoredUser(),
        getSettings(),
        getReimbursementPolicyHistory(),
        getLocationPolicy(),
        getLocationPolicyHistory(),
      ]);
      if (!storedUser) {
        router.replace("/(auth)/login");
        return;
      }
      setUser(storedUser);
      setSettings(currentSettings);
      setReimbursementHistory(reimbursementPolicies);
      setForm(toForm(currentSettings));
      setLocationPolicy(currentLocationPolicy);
      setLocationForm(toLocationForm(currentLocationPolicy));
      setLocationHistory(policyHistory);
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
      doctorReceiptThreshold: validateMoney(
        form.doctorReceiptThreshold,
        "Doctor receipt threshold"
      ),
    }),
    [form]
  );

  const isDirty =
    settings !== null &&
    (Number(form.perKmRate) !== settings.per_km_rate ||
      Number(form.dailyAllowance) !== settings.daily_allowance ||
      Number(form.doctorReceiptThreshold) !== settings.doctor_receipt_threshold);
  const hasValidationError =
    validation.perKmRate !== null ||
    validation.dailyAllowance !== null ||
    validation.doctorReceiptThreshold !== null;
  const saveDisabled =
    !isDirty || hasValidationError || submitting;

  const locationValidation = useMemo(() => {
    const radius = Number(locationForm.geofenceRadiusM);
    const accuracy = Number(locationForm.gpsAccuracyThresholdM);
    return {
      approvalValidHours: validateRange(locationForm.approvalValidHours, "Approval validity", 1, 24, true),
      evidenceMaxAgeMinutes: validateRange(locationForm.evidenceMaxAgeMinutes, "Evidence age", 1, 60, true),
      geofenceRadiusM: validateRange(locationForm.geofenceRadiusM, "Geofence radius", 50, 1000),
      gpsAccuracyThresholdM:
        validateRange(locationForm.gpsAccuracyThresholdM, "GPS threshold", 10, 1000) ??
        (accuracy > radius * 2 ? "GPS threshold cannot exceed twice the geofence radius." : null),
      maxEvidenceMovementM: validateRange(locationForm.maxEvidenceMovementM, "Evidence movement", 25, 1000),
    };
  }, [locationForm]);
  const locationDirty =
    locationPolicy !== null &&
    (Number(locationForm.approvalValidHours) !== locationPolicy.approval_valid_hours ||
      Number(locationForm.evidenceMaxAgeMinutes) !== locationPolicy.evidence_max_age_minutes ||
      Number(locationForm.geofenceRadiusM) !== locationPolicy.geofence_radius_m ||
      Number(locationForm.gpsAccuracyThresholdM) !== locationPolicy.gps_accuracy_threshold_m ||
      Number(locationForm.maxEvidenceMovementM) !== locationPolicy.max_evidence_movement_m);
  const locationSaveDisabled =
    !locationDirty ||
    Object.values(locationValidation).some(Boolean) ||
    locationSubmitting;

  const handleSave = async (): Promise<void> => {
    if (saveDisabled || submitInFlight.current) return;

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const savedSettings = await updateSettings({
        per_km_rate: Number(form.perKmRate),
        daily_allowance: Number(form.dailyAllowance),
        doctor_receipt_threshold: Number(form.doctorReceiptThreshold),
      });
      setSettings(savedSettings);
      setForm(toForm(savedSettings));
      Alert.alert(
        "Settings Updated",
        `Policy version ${savedSettings.version} is active. New rates apply to newly generated travel entries and future claims. Historical records keep their saved rates.`
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

  const handleLocationSave = async (): Promise<void> => {
    if (locationSaveDisabled) return;
    setLocationSubmitting(true);
    try {
      const saved = await updateLocationPolicy({
        approval_valid_hours: Number(locationForm.approvalValidHours),
        effective_from: formatScheduleDate(locationEffectiveDate),
        evidence_max_age_minutes: Number(locationForm.evidenceMaxAgeMinutes),
        geofence_radius_m: Number(locationForm.geofenceRadiusM),
        gps_accuracy_threshold_m: Number(locationForm.gpsAccuracyThresholdM),
        max_evidence_movement_m: Number(locationForm.maxEvidenceMovementM),
      });
      setLocationPolicy(saved);
      setLocationForm(toLocationForm(saved));
      setLocationHistory(await getLocationPolicyHistory());
      Alert.alert(
        "Location Policy Updated",
        `Version ${saved.version} applies from ${saved.effective_from}. Existing exception requests retain their captured policy.`
      );
    } catch (saveError) {
      Alert.alert(
        "Unable to Save Location Policy",
        getApiErrorMessage(saveError, "Unable to update field location controls.")
      );
    } finally {
      setLocationSubmitting(false);
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

  if (error || !user || !settings || !locationPolicy) {
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
      <View style={styles.flex}>
        <FormScrollView
          contentContainerStyle={styles.content}
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
                  New versions apply from the India business date. Historical
                  calculations remain unchanged.
                </Text>
              </View>
            </View>

            <View style={styles.policyMeta}>
              <Text style={styles.infoLabel}>Active policy</Text>
              <Text style={styles.infoValue}>
                Version {settings.version} · {settings.effective_from}
              </Text>
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

            <Text style={[styles.inputLabel, styles.secondLabel]}>
              Doctor Receipt Threshold
            </Text>
            <View
              style={[
                styles.inputRow,
                validation.doctorReceiptThreshold && styles.inputRowInvalid,
              ]}
            >
              <Text style={styles.currencyPrefix}>INR</Text>
              <TextInput
                accessibilityLabel="Doctor receipt threshold"
                editable={!submitting}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    doctorReceiptThreshold: value,
                  }))
                }
                placeholder="500.00"
                placeholderTextColor={colors.textSubtle}
                selectTextOnFocus
                style={styles.input}
                value={form.doctorReceiptThreshold}
              />
            </View>
            {validation.doctorReceiptThreshold ? (
              <Text style={styles.validationText}>
                {validation.doctorReceiptThreshold}
              </Text>
            ) : (
              <Text style={styles.inputHelp}>
                Actual-fare expenses at or above this amount require a receipt.
                Manual and special-category expenses always require one.
              </Text>
            )}

            <TouchableOpacity
              accessibilityLabel="Save a new reimbursement policy version"
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
                {submitting ? "Saving..." : "Save New Version"}
              </Text>
            </TouchableOpacity>

            <View style={styles.historyPanel} accessibilityLabel="Reimbursement policy history">
              <Text style={styles.historyTitle}>Recent policy versions</Text>
              {reimbursementHistory.slice(0, 5).map((policy) => (
                <View key={policy.id} style={styles.historyRow}>
                  <Text style={styles.historyVersion}>v{policy.version}</Text>
                  <Text style={styles.historyDate}>
                    {policy.effective_from} â†’ {policy.effective_to ?? "current"}
                  </Text>
                  <Text style={styles.historyValue}>
                    INR {policy.per_km_rate.toFixed(2)}/km Â· receipt {policy.doctor_receipt_threshold.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Field Location Policy</Text>
          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={[styles.iconBox, styles.locationIconBox]}>
                <Ionicons color={colors.warningDark} name="location-outline" size={22} />
              </View>
              <View style={styles.headingText}>
                <Text style={styles.cardTitle}>Geofence & Evidence Controls</Text>
                <Text style={styles.cardSubtitle}>
                  New versions govern field verification. Existing exception decisions retain their original thresholds.
                </Text>
              </View>
            </View>

            <View style={[styles.policyMeta, styles.locationPolicyMeta]}>
              <Text style={styles.infoLabel}>Active location policy</Text>
              <Text style={styles.infoValue}>
                Version {locationPolicy.version} · {locationPolicy.effective_from}
              </Text>
              <Text style={styles.policyDetail}>
                {locationPolicy.geofence_radius_m} m radius · GPS threshold {locationPolicy.gps_accuracy_threshold_m} m
              </Text>
            </View>

            {[
              ["geofenceRadiusM", "Patient geofence radius", "m", "50–1000"],
              ["gpsAccuracyThresholdM", "GPS accuracy threshold", "m", "10–1000"],
              ["evidenceMaxAgeMinutes", "Evidence maximum age", "min", "1–60"],
              ["approvalValidHours", "Approval validity", "hours", "1–24"],
              ["maxEvidenceMovementM", "Approved evidence movement", "m", "25–1000"],
            ].map(([field, label, unit, range], index) => {
              const key = field as keyof LocationPolicyForm;
              const issue = locationValidation[key];
              return (
                <View key={field} style={index ? styles.locationField : undefined}>
                  <Text style={styles.inputLabel}>{label}</Text>
                  <View style={[styles.inputRow, issue && styles.inputRowInvalid]}>
                    <Text style={styles.currencyPrefix}>{unit}</Text>
                    <TextInput
                      accessibilityLabel={label}
                      editable={!locationSubmitting}
                      keyboardType="number-pad"
                      onChangeText={(value) => setLocationForm((current) => ({ ...current, [key]: value }))}
                      placeholder={range}
                      placeholderTextColor={colors.textSubtle}
                      selectTextOnFocus
                      style={styles.input}
                      value={locationForm[key]}
                    />
                  </View>
                  {issue ? <Text style={styles.validationText}>{issue}</Text> : (
                    <Text style={styles.fieldHelp}>Allowed range: {range}</Text>
                  )}
                </View>
              );
            })}

            <View style={styles.locationField}>
              <DateTimeField
                label="Effective date"
                minimumDate={new Date()}
                mode="date"
                onChange={setLocationEffectiveDate}
                placeholder="Choose effective date"
                value={locationEffectiveDate}
              />
            </View>

            <TouchableOpacity
              accessibilityLabel="Save a new location policy version"
              accessibilityRole="button"
              accessibilityState={{ disabled: locationSaveDisabled }}
              disabled={locationSaveDisabled}
              onPress={() => void handleLocationSave()}
              style={[styles.saveButton, styles.locationSaveButton, locationSaveDisabled && styles.buttonDisabled]}
            >
              {locationSubmitting ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Ionicons color={colors.surface} name="shield-checkmark-outline" size={19} />
              )}
              <Text style={styles.saveText}>
                {locationSubmitting ? "Saving..." : "Save Location Policy"}
              </Text>
            </TouchableOpacity>

            <View style={styles.historyPanel}>
              <Text style={styles.historyTitle}>Recent policy versions</Text>
              {locationHistory.slice(0, 5).map((policy) => (
                <View key={policy.id} style={styles.historyRow}>
                  <Text style={styles.historyVersion}>v{policy.version}</Text>
                  <Text style={styles.historyDate}>
                    {policy.effective_from} → {policy.effective_to ?? "current"}
                  </Text>
                  <Text style={styles.historyValue}>{policy.geofence_radius_m} m</Text>
                </View>
              ))}
            </View>
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
        </FormScrollView>
      </View>
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
  policyMeta: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  policyDetail: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  locationIconBox: {
    backgroundColor: colors.warningSurface,
  },
  locationPolicyMeta: {
    backgroundColor: colors.warningSurface,
  },
  locationField: {
    marginTop: spacing.xl,
  },
  fieldHelp: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
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
  inputHelp: {
    color: colors.textMuted,
    fontSize: typography.size.tiny,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  locationSaveButton: {
    backgroundColor: colors.warningDark,
  },
  historyPanel: {
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xxl,
    padding: spacing.lg,
  },
  historyTitle: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
  },
  historyRow: {
    alignItems: "center",
    borderTopColor: colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  historyVersion: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    width: 32,
  },
  historyDate: {
    color: colors.textMuted,
    flex: 1,
    fontSize: typography.size.tiny,
  },
  historyValue: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
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
