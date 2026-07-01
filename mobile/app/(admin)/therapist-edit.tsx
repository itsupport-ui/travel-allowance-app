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
  getTherapistById,
  TherapistServiceError,
  updateTherapist,
} from "../../src/services/therapistService";
import type { TherapistResponse } from "../../src/types/therapist";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TherapistForm {
  email: string;
  isActive: boolean;
  name: string;
  password: string;
}

interface FormErrors {
  email?: string;
  name?: string;
  password?: string;
}

const EMPTY_FORM: TherapistForm = {
  email: "",
  isActive: true,
  name: "",
  password: "",
};

const readId = (value: string | string[] | undefined): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toForm = (therapist: TherapistResponse): TherapistForm => ({
  email: therapist.email,
  isActive: therapist.is_active,
  name: therapist.username,
  password: "",
});

export default function TherapistEditScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const therapistId = readId(params.id);
  const [form, setForm] = useState<TherapistForm>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<TherapistForm | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  const loadTherapist = useCallback(async (): Promise<void> => {
    if (!therapistId) {
      setLoadError("A valid therapist ID is required.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const therapist = await getTherapistById(therapistId);
      const nextForm = toForm(therapist);
      setForm(nextForm);
      setInitialForm(nextForm);
    } catch (error) {
      if (error instanceof TherapistServiceError && error.status === 401) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return;
      }
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load therapist profile."
      );
    } finally {
      setLoading(false);
    }
  }, [therapistId]);

  useEffect(() => {
    void loadTherapist();
  }, [loadTherapist]);

  const isDirty = useMemo(
    () =>
      initialForm !== null &&
      (form.name.trim() !== initialForm.name ||
        form.email.trim().toLowerCase() !==
          initialForm.email.toLowerCase() ||
        form.isActive !== initialForm.isActive ||
        form.password.length > 0),
    [form, initialForm]
  );

  const validate = useCallback((): boolean => {
    const nextErrors: FormErrors = {};
    const name = form.name.trim();
    const email = form.email.trim();

    if (name.length < 2) {
      nextErrors.name = "Enter at least 2 characters.";
    }
    if (!EMAIL_PATTERN.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (form.password && form.password.length < 8) {
      nextErrors.password =
        "A new password must contain at least 8 characters.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [form]);

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
      "The unsaved therapist profile changes will be lost.",
      [
        { style: "cancel", text: "Continue Editing" },
        { onPress: leave, style: "destructive", text: "Discard" },
      ]
    );
  }, [isDirty, submitting]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!therapistId || submitInFlight.current || !validate()) return;

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const therapist = await updateTherapist(therapistId, {
        email: form.email.trim().toLowerCase(),
        is_active: form.isActive,
        username: form.name.trim(),
        ...(form.password ? { password: form.password } : {}),
      });
      const nextForm = toForm(therapist);
      setForm(nextForm);
      setInitialForm(nextForm);
      Alert.alert(
        "Therapist Updated",
        `${therapist.username}'s profile was updated successfully.`,
        [{ onPress: () => router.back(), text: "OK" }]
      );
    } catch (error) {
      if (error instanceof TherapistServiceError && error.status === 401) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return;
      }
      Alert.alert(
        "Unable to Update Therapist",
        error instanceof Error
          ? error.message
          : "Unable to update therapist profile."
      );
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }, [form, therapistId, validate]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={PRIMARY} size="large" />
        <Text style={styles.stateMessage}>Loading therapist profile...</Text>
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
            onPress={() => void loadTherapist()}
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
            accessibilityLabel="Cancel therapist editing"
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
            <Text style={styles.eyebrow}>Therapist Management</Text>
            <Text style={styles.title}>Edit Therapist</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(form.name.trim().charAt(0) || "T").toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileTitle}>Staff Profile</Text>
              <Text style={styles.profileSubtitle}>
                Update identity, access, or login credentials.
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              accessibilityLabel="Therapist full name"
              autoCapitalize="words"
              editable={!submitting}
              maxLength={120}
              onChangeText={(name) => {
                setForm((current) => ({ ...current, name }));
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="Enter full name"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, errors.name && styles.inputInvalid]}
              value={form.name}
            />
            {errors.name ? (
              <Text style={styles.errorText}>{errors.name}</Text>
            ) : null}

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              accessibilityLabel="Therapist email address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!submitting}
              keyboardType="email-address"
              onChangeText={(email) => {
                setForm((current) => ({ ...current, email }));
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              placeholder="name@example.com"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, errors.email && styles.inputInvalid]}
              value={form.email}
            />
            {errors.email ? (
              <Text style={styles.errorText}>{errors.email}</Text>
            ) : null}

            <Text style={styles.label}>New Password</Text>
            <TextInput
              accessibilityHint="Leave blank to keep the current password"
              accessibilityLabel="New therapist password"
              autoCapitalize="none"
              editable={!submitting}
              onChangeText={(password) => {
                setForm((current) => ({ ...current, password }));
                setErrors((current) => ({
                  ...current,
                  password: undefined,
                }));
              }}
              placeholder="Leave blank to keep current password"
              placeholderTextColor={colors.textSubtle}
              secureTextEntry
              style={[styles.input, errors.password && styles.inputInvalid]}
              value={form.password}
            />
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password}</Text>
            ) : (
              <Text style={styles.helperText}>
                Password is changed only when this field is completed.
              </Text>
            )}

            <View style={styles.statusRow}>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>Active Account</Text>
                <Text style={styles.statusDescription}>
                  Inactive therapists cannot be assigned new schedules.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Therapist active account"
                disabled={submitting}
                onValueChange={(isActive) =>
                  setForm((current) => ({ ...current, isActive }))
                }
                thumbColor={colors.surface}
                trackColor={{
                  false: colors.inputBorder,
                  true: colors.greenBright,
                }}
                value={form.isActive}
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
    color: PRIMARY,
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
    backgroundColor: colors.primarySurface,
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
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
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
  helperText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
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
    marginTop: spacing.xl,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
    justifyContent: "center",
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
