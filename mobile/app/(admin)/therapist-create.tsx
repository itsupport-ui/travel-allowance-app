import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createTherapist,
  TherapistServiceError,
} from "../../src/services/therapistService";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

type FormState = {
  fullName: string;
  email: string;
  password: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialFormState: FormState = {
  fullName: "",
  email: "",
  password: "",
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to create therapist.";
};

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export default function TherapistCreateScreen() {
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      formData.fullName.trim().length > 0 &&
      formData.email.trim().length > 0 &&
      formData.password.length > 0 &&
      !submitting
    );
  }, [formData, submitting]);

  const updateField = useCallback(
    <Key extends keyof FormState>(field: Key, value: FormState[Key]) => {
      setFormData((current) => ({
        ...current,
        [field]: value,
      }));

      setErrors((current) => ({
        ...current,
        [field]: undefined,
      }));
    },
    []
  );

  const validateForm = useCallback((): boolean => {
    const nextErrors: FormErrors = {};

    const fullName = formData.fullName.trim();
    const email = formData.email.trim();

    if (!fullName) {
      nextErrors.fullName = "Full name is required.";
    } else if (fullName.length < 3) {
      nextErrors.fullName = "Full name should be at least 3 characters.";
    }

    if (!email) {
      nextErrors.email = "Email address is required.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!formData.password) {
      nextErrors.password = "Password is required.";
    } else if (formData.password.length < 6) {
      nextErrors.password = "Password should be at least 6 characters.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }, [formData]);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        requestError instanceof TherapistServiceError &&
        requestError.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }

      return false;
    },
    []
  );

  const goToTherapistList = useCallback(() => {
    router.replace("/(admin)/therapists");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      await createTherapist({
        username: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: "therapist",
        is_active: true,
      });

      Alert.alert(
        "Therapist Created",
        "Therapist account has been created successfully.",
        [
          {
            text: "OK",
            onPress: goToTherapistList,
          },
        ]
      );
    } catch (createError) {
      if (await handleSessionExpiry(createError)) {
        return;
      }

      Alert.alert(
        "Unable to Create Therapist",
        getErrorMessage(createError)
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    formData,
    goToTherapistList,
    handleSessionExpiry,
    validateForm,
  ]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <TouchableOpacity
              accessibilityLabel="Go back"
              accessibilityRole="button"
              activeOpacity={0.82}
              hitSlop={8}
              onPress={goToTherapistList}
              style={styles.backButton}
            >
              <Ionicons
                color={colors.textSecondary}
                name="arrow-back"
                size={22}
              />
            </TouchableOpacity>

            <View style={styles.pageHeaderContent}>
              <Text style={styles.eyebrow}>Administration</Text>
              <Text style={styles.title}>Register User</Text>
              <Text style={styles.subtitle}>
                Create therapist login account
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>

              <View
                style={[
                  styles.inputContainer,
                  errors.fullName && styles.inputError,
                ]}
              >
                <Ionicons
                  color={colors.textMuted}
                  name="person-outline"
                  size={19}
                />

                <TextInput
                  autoCapitalize="words"
                  autoCorrect={false}
                  onChangeText={(value) => updateField("fullName", value)}
                  placeholder="Enter name"
                  placeholderTextColor={colors.textSubtle}
                  returnKeyType="next"
                  style={styles.input}
                  value={formData.fullName}
                />
              </View>

              {errors.fullName ? (
                <Text style={styles.errorText}>{errors.fullName}</Text>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>

              <View
                style={[
                  styles.inputContainer,
                  errors.email && styles.inputError,
                ]}
              >
                <Ionicons
                  color={colors.textMuted}
                  name="mail-outline"
                  size={19}
                />

                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={(value) => updateField("email", value)}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.textSubtle}
                  returnKeyType="next"
                  style={styles.input}
                  value={formData.email}
                />
              </View>

              {errors.email ? (
                <Text style={styles.errorText}>{errors.email}</Text>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>

              <View
                style={[
                  styles.inputContainer,
                  errors.password && styles.inputError,
                ]}
              >
                <Ionicons
                  color={colors.textMuted}
                  name="lock-closed-outline"
                  size={19}
                />

                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => updateField("password", value)}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSubtle}
                  returnKeyType="done"
                  secureTextEntry
                  style={styles.input}
                  value={formData.password}
                />
              </View>

              {errors.password ? (
                <Text style={styles.errorText}>{errors.password}</Text>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Assigned System Role</Text>

              <View style={styles.roleSelector}>
                <Text style={styles.roleSelectorText}>Therapist</Text>
                <Ionicons
                  color={colors.textSecondary}
                  name="chevron-down"
                  size={20}
                />
              </View>

              <Text style={styles.helperText}>
                This account will be created as therapist.
              </Text>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.86}
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={[
                styles.submitButton,
                !canSubmit && styles.disabledButton,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <>
                  <Ionicons
                    color={colors.surface}
                    name="person-add-outline"
                    size={19}
                  />
                  <Text style={styles.submitButtonText}>Create User</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.section,
  },
  pageHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xlPlus,
  },
  pageHeaderContent: {
    flex: 1,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size25,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.s3,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xxxl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  inputGroup: {
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    letterSpacing: 0.6,
    marginBottom: spacing.s7,
    textTransform: "uppercase",
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  inputError: {
    borderColor: colors.danger,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingVertical: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.s5,
  },
  roleSelector: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  roleSelectorText: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  disabledButton: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
