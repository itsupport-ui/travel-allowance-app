import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
  createDoctor,
  DoctorServiceError,
} from "../../src/services/doctorService";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

interface FormErrors {
  name?: string;
  phone?: string;
}

const normalizePhone = (value: string): string =>
  value
    .replace(/[^\d+() -]/g, "")
    .replace(/(?!^)\+/g, "");

const isValidPhone = (value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

export default function DoctorCreateScreen() {
  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const nameInputRef = useRef<TextInput>(null);
  const specializationInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);

  const isDirty = useMemo(
    () =>
      Boolean(
        name.trim() || specialization.trim() || phone.trim()
      ),
    [name, phone, specialization]
  );

  const validateForm = useCallback((): boolean => {
    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      nextErrors.name = "Doctor name is required.";
    } else if (trimmedName.length < 2) {
      nextErrors.name = "Doctor name must contain at least 2 characters.";
    }

    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      nextErrors.phone = "Enter a valid phone number.";
    }

    setErrors(nextErrors);

    if (nextErrors.name) {
      nameInputRef.current?.focus();
    } else if (nextErrors.phone) {
      phoneInputRef.current?.focus();
    }

    return Object.keys(nextErrors).length === 0;
  }, [name, phone]);

  const goToDoctorList = useCallback(() => {
    router.replace("/(admin)/doctors");
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!validateForm()) {
      return;
    }

    if (submitInFlight.current) {
      return;
    }

    Keyboard.dismiss();
    submitInFlight.current = true;
    setSubmitting(true);

    try {
      const doctor = await createDoctor({
        name: name.trim(),
        specialization: specialization.trim() || null,
        phone: phone.trim() || null,
      });

      Alert.alert(
        "Doctor Added",
        `${doctor.name} has been added successfully.`,
        [
          {
            onPress: goToDoctorList,
            text: "OK",
          },
        ]
      );
    } catch (saveError) {
      if (
        saveError instanceof DoctorServiceError &&
        saveError.status === 401
      ) {
        await clearAuthSession();
        Alert.alert(
          "Session Expired",
          saveError.message,
          [
            {
              onPress: () => router.replace("/(auth)/login"),
              text: "Sign In",
            },
          ]
        );
        return;
      }

      Alert.alert(
        "Unable to Add Doctor",
        saveError instanceof Error
          ? saveError.message
          : "Unable to add the doctor. Please try again."
      );
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }, [goToDoctorList, name, phone, specialization, validateForm]);

  const cancelForm = useCallback(() => {
  if (submitting) {
    return;
  }

  if (!isDirty) {
    goToDoctorList();
    return;
  }

  Alert.alert(
    "Discard Changes?",
    "The doctor information entered on this form will be lost.",
    [
      {
        style: "cancel",
        text: "Keep Editing",
      },
      {
        onPress: goToDoctorList,
        style: "destructive",
        text: "Discard",
      },
    ]
  );
}, [goToDoctorList, isDirty, submitting]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Cancel doctor creation"
            accessibilityRole="button"
            activeOpacity={0.82}
            disabled={submitting}
            hitSlop={8}
            onPress={cancelForm}
            style={styles.backButton}
          >
            <Ionicons color={colors.textSecondary} name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.eyebrow}>Doctor Management</Text>
            <Text style={styles.title}>Create Doctor</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introRow}>
            <View style={styles.introIcon}>
              <Ionicons color={PRIMARY} name="medical-outline" size={24} />
            </View>
            <View style={styles.introContent}>
              <Text style={styles.introTitle}>Doctor Information</Text>
              <Text style={styles.introSubtitle}>
                Add clinical and contact details
              </Text>
            </View>
          </View>

            <View style={styles.formSection}>
            <Text style={[styles.inputLabel, styles.firstInputLabel]}>
              Doctor Name <Text style={styles.required}>*</Text>
            </Text>
            <View
              style={[
                styles.inputContainer,
                errors.name ? styles.invalidInput : null,
              ]}
            >
              <Ionicons color={colors.textMuted} name="person-outline" size={19} />
              <TextInput
                ref={nameInputRef}
                accessibilityHint="Required field"
                accessibilityLabel="Doctor name"
                accessibilityState={{ disabled: submitting }}
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect={false}
                editable={!submitting}
                maxLength={120}
                onChangeText={(value) => {
                  setName(value);
                  if (errors.name) {
                    setErrors((current) => ({
                      ...current,
                      name: undefined,
                    }));
                  }
                }}
                placeholder="Enter doctor's full name"
                placeholderTextColor={colors.textSubtle}
                returnKeyType="next"
                onSubmitEditing={() =>
                  specializationInputRef.current?.focus()
                }
                style={styles.input}
                textContentType="name"
                value={name}
              />
            </View>
            {errors.name ? (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.errorText}
              >
                {errors.name}
              </Text>
            ) : null}

            <Text style={styles.inputLabel}>Specialty</Text>
            <View style={styles.inputContainer}>
              <Ionicons color={colors.textMuted} name="medkit-outline" size={19} />
              <TextInput
                ref={specializationInputRef}
                accessibilityLabel="Doctor specialty"
                accessibilityState={{ disabled: submitting }}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!submitting}
                maxLength={120}
                onChangeText={setSpecialization}
                placeholder="e.g. Orthopedics"
                placeholderTextColor={colors.textSubtle}
                returnKeyType="next"
                onSubmitEditing={() => phoneInputRef.current?.focus()}
                style={styles.input}
                value={specialization}
              />
            </View>

            <Text style={styles.inputLabel}>Phone</Text>
            <View
              style={[
                styles.inputContainer,
                errors.phone ? styles.invalidInput : null,
              ]}
            >
              <Ionicons color={colors.textMuted} name="call-outline" size={19} />
              <TextInput
                ref={phoneInputRef}
                accessibilityLabel="Doctor phone number"
                accessibilityState={{ disabled: submitting }}
                autoComplete="tel"
                editable={!submitting}
                keyboardType="phone-pad"
                maxLength={24}
                onChangeText={(value) => {
                  setPhone(normalizePhone(value));
                  if (errors.phone) {
                    setErrors((current) => ({
                      ...current,
                      phone: undefined,
                    }));
                  }
                }}
                placeholder="Enter phone number"
                placeholderTextColor={colors.textSubtle}
                returnKeyType="done"
                onSubmitEditing={() => void handleSave()}
                style={styles.input}
                textContentType="telephoneNumber"
                value={phone}
              />
            </View>
            {errors.phone ? (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.errorText}
              >
                {errors.phone}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              activeOpacity={0.82}
              disabled={submitting}
              onPress={goToDoctorList}
              style={[
                styles.cancelButton,
                submitting ? styles.disabledButton : null,
              ]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              activeOpacity={0.84}
              disabled={submitting}
              onPress={() => void handleSave()}
              style={[
                styles.saveButton,
                submitting ? styles.disabledButton : null,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Ionicons color={colors.surface} name="save-outline" size={19} />
              )}
              <Text style={styles.saveButtonText}>
                {submitting ? "Saving..." : "Save Doctor"}
              </Text>
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
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lgPlus,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headerContent: {
    flex: 1,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size21,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.s36,
  },
  introRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: spacing.xxl,
  },
  introIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 48,
    justifyContent: "center",
    marginRight: spacing.lg,
    width: 48,
  },
  introContent: {
    flex: 1,
  },
  introTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  introSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  formSection: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.s7,
    marginTop: spacing.s15,
  },
  firstInputLabel: {
    marginTop: spacing.none,
  },
  required: {
    color: colors.danger,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.mdPlus,
    minHeight: 50,
    paddingHorizontal: spacing.s13,
  },
  invalidInput: {
    borderColor: colors.dangerBright,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingVertical: spacing.s11,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.s11,
    marginTop: spacing.xxlPlus,
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  cancelButtonText: {
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
  saveButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
