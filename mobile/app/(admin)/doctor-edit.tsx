import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorServiceError,
  getDoctorById,
  updateDoctor,
} from "../../src/services/doctorService";
import type { Doctor } from "../../src/types/doctor";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

interface DoctorForm {
  active: boolean;
  name: string;
  phone: string;
  specialization: string;
}

interface FormErrors {
  name?: string;
  phone?: string;
}

const EMPTY_FORM: DoctorForm = {
  active: true,
  name: "",
  phone: "",
  specialization: "",
};

const readId = (value: string | string[] | undefined): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toForm = (doctor: Doctor): DoctorForm => ({
  active: doctor.active,
  name: doctor.name,
  phone: doctor.phone ?? "",
  specialization: doctor.specialization ?? "",
});

const normalizePhone = (value: string): string =>
  value.replace(/[^\d+() -]/g, "").replace(/(?!^)\+/g, "");

const isValidPhone = (value: string): boolean => {
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
};

export default function DoctorEditScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const doctorId = readId(params.id);
  const [form, setForm] = useState<DoctorForm>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<DoctorForm | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  const loadDoctor = useCallback(async (): Promise<void> => {
    if (!doctorId) {
      setLoadError("A valid doctor ID is required.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const doctor = await getDoctorById(doctorId);
      const nextForm = toForm(doctor);
      setForm(nextForm);
      setInitialForm(nextForm);
    } catch (error) {
      if (error instanceof DoctorServiceError && error.status === 401) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return;
      }
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load doctor profile."
      );
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    void loadDoctor();
  }, [loadDoctor]);

  const isDirty = useMemo(
    () =>
      initialForm !== null &&
      (form.name.trim() !== initialForm.name ||
        form.specialization.trim() !== initialForm.specialization ||
        form.phone.trim() !== initialForm.phone ||
        form.active !== initialForm.active),
    [form, initialForm]
  );

  const validate = useCallback((): boolean => {
    const nextErrors: FormErrors = {};
    if (form.name.trim().length < 2) {
      nextErrors.name = "Enter at least 2 characters.";
    }
    if (form.phone.trim() && !isValidPhone(form.phone.trim())) {
      nextErrors.phone = "Enter a valid phone number.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [form.name, form.phone]);

  const handleBack = useCallback((): void => {
    if (submitting) return;
    const leave = () =>
      router.canGoBack()
        ? router.back()
        : router.replace("/(admin)/therapists");

    if (!isDirty) {
      leave();
      return;
    }

    Alert.alert(
      "Discard Changes?",
      "The unsaved doctor profile changes will be lost.",
      [
        { style: "cancel", text: "Continue Editing" },
        { onPress: leave, style: "destructive", text: "Discard" },
      ]
    );
  }, [isDirty, submitting]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!doctorId || submitInFlight.current || !validate()) return;

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const doctor = await updateDoctor(doctorId, {
        active: form.active,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        specialization: form.specialization.trim() || null,
      });
      const nextForm = toForm(doctor);
      setForm(nextForm);
      setInitialForm(nextForm);
      Alert.alert(
        "Doctor Updated",
        `${doctor.name}'s profile was updated successfully.`,
        [{ onPress: () => router.back(), text: "OK" }]
      );
    } catch (error) {
      if (error instanceof DoctorServiceError && error.status === 401) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return;
      }
      Alert.alert(
        "Unable to Update Doctor",
        error instanceof Error
          ? error.message
          : "Unable to update doctor profile."
      );
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }, [doctorId, form, validate]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={PRIMARY} size="large" />
        <Text style={styles.stateMessage}>Loading doctor profile...</Text>
      </View>
    );
  }

  if (loadError || !initialForm) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centerState}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={34}
          />
          <Text style={styles.stateTitle}>Profile unavailable</Text>
          <Text style={styles.stateMessage}>{loadError}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void loadDoctor()}
            style={styles.retryButton}
          >
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
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Cancel doctor editing"
            accessibilityRole="button"
            disabled={submitting}
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
            <Text style={styles.eyebrow}>Doctor Management</Text>
            <Text style={styles.title}>Edit Doctor</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Ionicons color={colors.blueDark} name="medical" size={24} />
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileTitle}>Physician Profile</Text>
              <Text style={styles.profileSubtitle}>
                Update clinical details and directory availability.
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Doctor Name</Text>
            <TextInput
              accessibilityLabel="Doctor name"
              autoCapitalize="words"
              editable={!submitting}
              maxLength={120}
              onChangeText={(name) => {
                setForm((current) => ({ ...current, name }));
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="Enter doctor's full name"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, errors.name && styles.inputInvalid]}
              value={form.name}
            />
            {errors.name ? (
              <Text style={styles.errorText}>{errors.name}</Text>
            ) : null}

            <Text style={styles.label}>Specialization</Text>
            <TextInput
              accessibilityLabel="Doctor specialization"
              autoCapitalize="words"
              editable={!submitting}
              maxLength={120}
              onChangeText={(specialization) =>
                setForm((current) => ({ ...current, specialization }))
              }
              placeholder="e.g. Orthopedics"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              value={form.specialization}
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              accessibilityLabel="Doctor phone number"
              editable={!submitting}
              keyboardType="phone-pad"
              maxLength={24}
              onChangeText={(value) => {
                setForm((current) => ({
                  ...current,
                  phone: normalizePhone(value),
                }));
                setErrors((current) => ({ ...current, phone: undefined }));
              }}
              placeholder="Enter phone number"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, errors.phone && styles.inputInvalid]}
              value={form.phone}
            />
            {errors.phone ? (
              <Text style={styles.errorText}>{errors.phone}</Text>
            ) : null}

            <View style={styles.statusRow}>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>Active Doctor</Text>
                <Text style={styles.statusDescription}>
                  Inactive doctors remain in history but should not receive new
                  schedules.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Doctor active status"
                disabled={submitting}
                onValueChange={(active) =>
                  setForm((current) => ({ ...current, active }))
                }
                thumbColor={colors.surface}
                trackColor={{
                  false: colors.inputBorder,
                  true: colors.greenBright,
                }}
                value={form.active}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={submitting}
              onPress={handleBack}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{
                disabled: submitting || !isDirty,
              }}
              disabled={submitting || !isDirty}
              onPress={() => void handleSave()}
              style={[
                styles.saveButton,
                (submitting || !isDirty) && styles.buttonDisabled,
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
                {submitting ? "Saving..." : "Save Changes"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lgPlus,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerText: { flex: 1, marginLeft: spacing.lg },
  eyebrow: {
    color: colors.blueDark,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size23,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  content: { padding: spacing.xxl, paddingBottom: spacing.s80 },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    padding: spacing.xl,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  profileText: { flex: 1, marginLeft: spacing.lg },
  profileTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  profileSubtitle: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.body,
    marginTop: spacing.xs,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.s7,
    marginTop: spacing.xl,
  },
  input: {
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.body,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  inputInvalid: { borderColor: colors.danger },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  statusRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
  },
  statusText: { flex: 1, marginRight: spacing.lg },
  statusTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  statusDescription: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  cancelButton: {
    alignItems: "center",
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flex: 1.4,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 50,
  },
  saveText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  buttonDisabled: { opacity: 0.5 },
  centerState: {
    alignItems: "center",
    backgroundColor: colors.background,
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
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
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
