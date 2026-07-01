import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DateTimeField,
  FormTextField,
  ScheduleFormSkeleton,
  SearchableSelect,
  type SelectOption,
} from "../../src/components/schedule/ScheduleFormControls";
import {
  DoctorServiceError,
  getDoctors,
} from "../../src/services/doctorService";
import {
  createSchedule,
  ScheduleServiceError,
} from "../../src/services/scheduleService";
import {
  getTherapists,
  TherapistServiceError,
} from "../../src/services/therapistService";
import type {
  SchedulePriority,
  ScheduleTransportMode,
  ScheduleType,
} from "../../src/types/schedule";
import type {
  ScheduleFormErrors,
  ScheduleFormState,
} from "../../src/types/scheduleForm";
import {
  buildCreateScheduleRequest,
  createInitialScheduleForm,
  getScheduleFormFingerprint,
  startOfDay,
  validateScheduleForm,
} from "../../src/utils/scheduleForm";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

interface SegmentOption<T extends string> {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  accessibilityLabel: string;
  error?: string;
  label: string;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  required?: boolean;
  value: T;
}

const SegmentedControl = <T extends string,>({
  accessibilityLabel,
  error,
  label,
  onChange,
  options,
  required = false,
  value,
}: SegmentedControlProps<T>) => (
  <View style={styles.segmentedField}>
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      style={styles.segmentedControl}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <TouchableOpacity
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            activeOpacity={0.82}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected ? styles.selectedSegment : null,
            ]}
          >
            <Ionicons
              color={selected ? colors.surface : colors.textMutedDark}
              name={option.icon}
              size={17}
            />
            <Text
              style={[
                styles.segmentText,
                selected ? styles.selectedSegmentText : null,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
    {error ? (
      <Text accessibilityLiveRegion="polite" style={styles.errorText}>
        {error}
      </Text>
    ) : null}
  </View>
);

const scheduleTypeOptions: readonly SegmentOption<ScheduleType>[] = [
  {
    icon: "calendar-outline",
    label: "One Time",
    value: "one_time",
  },
  {
    icon: "repeat-outline",
    label: "Recurring",
    value: "recurring",
  },
];

const priorityOptions: readonly SegmentOption<SchedulePriority>[] = [
  {
    icon: "remove-outline",
    label: "Normal",
    value: "normal",
  },
  {
    icon: "alert-outline",
    label: "High",
    value: "high",
  },
];

const transportOptions: SelectOption[] = [
  { id: "vehicle", label: "Vehicle" },
  { id: "auto", label: "Auto" },
  { id: "bus", label: "Bus" },
  { id: "metro", label: "Metro" },
  { id: "cab", label: "Cab" },
  { id: "other", label: "Other" },
];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to create the schedule.";
};

export default function AdminScheduleCreateScreen() {
  const [form, setForm] = useState<ScheduleFormState>(
    createInitialScheduleForm
  );
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const [doctorOptions, setDoctorOptions] = useState<SelectOption[]>([]);
  const [therapistOptions, setTherapistOptions] = useState<
    SelectOption[]
  >([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const updateField = useCallback(
    <K extends keyof ScheduleFormState,>(
      field: K,
      value: ScheduleFormState[K]
    ) => {
      setForm((current) => ({
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

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        (requestError instanceof DoctorServiceError ||
          requestError instanceof TherapistServiceError ||
          requestError instanceof ScheduleServiceError) &&
        requestError.status === 401
      ) {
        await clearAuthSession();
        Alert.alert("Session Expired", requestError.message, [
          {
            onPress: () => router.replace("/(auth)/login"),
            text: "Sign In",
          },
        ]);
        return true;
      }

      return false;
    },
    []
  );

  const loadOptions = useCallback(async (): Promise<void> => {
    setLoadingOptions(true);
    setOptionsError(null);

    try {
      const [doctors, therapists] = await Promise.all([
        getDoctors(),
        getTherapists(),
      ]);

      setDoctorOptions(
        doctors
          .filter((doctor) => doctor.active)
          .map((doctor) => ({
            description: doctor.specialization ?? undefined,
            id: doctor.id,
            label: doctor.name,
          }))
          .sort((first, second) =>
            first.label.localeCompare(second.label)
          )
      );
      setTherapistOptions(
        therapists
          .map((therapist) => ({
            description: therapist.email,
            id: therapist.id,
            label: therapist.username,
          }))
          .sort((first, second) =>
            first.label.localeCompare(second.label)
          )
      );
    } catch (loadError) {
      if (await handleSessionExpiry(loadError)) {
        return;
      }

      setOptionsError(getErrorMessage(loadError));
    } finally {
      setLoadingOptions(false);
    }
  }, [handleSessionExpiry]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const isDirty = useMemo(
    () =>
      getScheduleFormFingerprint(form) !==
      getScheduleFormFingerprint(createInitialScheduleForm()),
    [form]
  );

  const goToScheduleList = useCallback(() => {
    router.replace("/(admin)/schedules");
  }, []);

  const validateForm = useCallback((): boolean => {
    const nextErrors = validateScheduleForm(form);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!validateForm()) {
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: 0,
      });
      return;
    }

    if (submitInFlight.current) {
      return;
    }

    const request = buildCreateScheduleRequest(form);

    if (!request) {
      return;
    }

    submitInFlight.current = true;
    setSubmitting(true);

    try {
      const schedule = await createSchedule(request);

      Alert.alert(
        "Schedule Created",
        `The schedule for ${schedule.patient_name} has been created successfully.`,
        [
          {
            onPress: () => router.back(),
            text: "OK",
          },
        ],
        {
          cancelable: false,
        }
      );
    } catch (submitError) {
      if (await handleSessionExpiry(submitError)) {
        return;
      }

      Alert.alert(
        "Unable to Create Schedule",
        getErrorMessage(submitError)
      );
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }, [form, handleSessionExpiry, validateForm]);

  const cancelForm = useCallback(() => {
    if (submitting) {
      return;
    }

    if (!isDirty) {
      goToScheduleList();
      return;
    }

    Alert.alert(
      "Discard Changes?",
      "The schedule information entered on this form will be lost.",
      [
        {
          style: "cancel",
          text: "Keep Editing",
        },
        {
          onPress: goToScheduleList,
          style: "destructive",
          text: "Discard",
        },
      ]
    );
  }, [goToScheduleList, isDirty, submitting]);

  if (loadingOptions) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScheduleFormSkeleton />
      </SafeAreaView>
    );
  }

  if (optionsError) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.errorPage}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons color={colors.textSecondary} name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={27}
              />
            </View>
            <Text style={styles.errorTitle}>Form data unavailable</Text>
            <Text
              accessibilityLiveRegion="polite"
              style={styles.errorMessage}
            >
              {optionsError}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => void loadOptions()}
              style={styles.retryButton}
            >
              <Ionicons color={colors.surface} name="refresh" size={18} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Cancel schedule creation"
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting }}
            activeOpacity={0.82}
            disabled={submitting}
            hitSlop={8}
            onPress={cancelForm}
            style={styles.backButton}
          >
            <Ionicons color={colors.textSecondary} name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.eyebrow}>Schedule Management</Text>
            <Text style={styles.title}>Create Schedule</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormSection
            icon="person-outline"
            subtitle="Patient and treatment details"
            title="Treatment Information"
          >
            <FormTextField
              accessibilityLabel="Patient name"
              error={errors.patientName}
              icon="person-outline"
              label="Patient Name"
              maxLength={120}
              onChangeText={(value) =>
                updateField("patientName", value)
              }
              placeholder="Enter patient name"
              required
              value={form.patientName}
            />
            <FormTextField
              accessibilityLabel="Treatment name"
              error={errors.treatmentName}
              icon="medical-outline"
              label="Treatment Name"
              maxLength={160}
              onChangeText={(value) =>
                updateField("treatmentName", value)
              }
              placeholder="Enter treatment name"
              required
              value={form.treatmentName}
            />
            <FormTextField
              accessibilityLabel="Medicines"
              icon="medkit-outline"
              label="Medicines"
              maxLength={500}
              multiline
              onChangeText={(value) =>
                updateField("medicines", value)
              }
              placeholder="Enter medicines, if applicable"
              value={form.medicines}
            />
            <FormTextField
              accessibilityLabel="Patient address"
              error={errors.patientAddress}
              icon="location-outline"
              label="Patient Address"
              maxLength={500}
              multiline
              onChangeText={(value) =>
                updateField("patientAddress", value)
              }
              placeholder="Enter complete treatment address"
              required
              value={form.patientAddress}
            />
          </FormSection>

          <FormSection
            icon="people-outline"
            subtitle="Assign the clinical team"
            title="Clinical Assignment"
          >
            <SearchableSelect
              accessibilityLabel="Select doctor"
              emptyMessage="No doctors match this search."
              error={errors.doctorId}
              icon="medical-outline"
              label="Doctor"
              onSelect={(option) =>
                updateField("doctorId", Number(option.id))
              }
              options={doctorOptions}
              placeholder="Select a doctor"
              required
              searchPlaceholder="Search doctors"
              selectedId={form.doctorId}
              title="Select Doctor"
            />
            <SearchableSelect
              accessibilityLabel="Select therapist"
              emptyMessage="No therapists match this search."
              error={errors.therapistId}
              icon="person-circle-outline"
              label="Therapist"
              onSelect={(option) =>
                updateField("therapistId", Number(option.id))
              }
              options={therapistOptions}
              placeholder="Select a therapist"
              required
              searchPlaceholder="Search therapists"
              selectedId={form.therapistId}
              title="Select Therapist"
            />
          </FormSection>

          <FormSection
            icon="calendar-outline"
            subtitle="Schedule dates and visit times"
            title="Schedule Timing"
          >
            <SegmentedControl
              accessibilityLabel="Schedule type"
              error={errors.scheduleType}
              label="Schedule Type"
              onChange={(value) => {
                updateField("scheduleType", value);
                setForm((current) => ({
                  ...current,
                  endDate: value === "one_time" ? null : current.endDate,
                  startDate:
                    value === "one_time" ? null : current.startDate,
                  treatmentDate:
                    value === "recurring"
                      ? null
                      : current.treatmentDate,
                }));
                setErrors((current) => ({
                  ...current,
                  endDate: undefined,
                  startDate: undefined,
                  treatmentDate: undefined,
                }));
              }}
              options={scheduleTypeOptions}
              required
              value={form.scheduleType}
            />

            {form.scheduleType === "one_time" ? (
              <DateTimeField
                error={errors.treatmentDate}
                label="Treatment Date"
                minimumDate={startOfDay(new Date())}
                mode="date"
                onChange={(value) =>
                  updateField("treatmentDate", value)
                }
                placeholder="Select treatment date"
                required
                value={form.treatmentDate}
              />
            ) : (
              <>
                <DateTimeField
                  error={errors.startDate}
                  label="Start Date"
                  minimumDate={startOfDay(new Date())}
                  mode="date"
                  onChange={(value) => {
                    updateField("startDate", value);

                    if (
                      form.endDate &&
                      startOfDay(form.endDate) < startOfDay(value)
                    ) {
                      updateField("endDate", null);
                    }
                  }}
                  placeholder="Select start date"
                  required
                  value={form.startDate}
                />
                <DateTimeField
                  error={errors.endDate}
                  label="End Date"
                  minimumDate={
                    form.startDate ?? startOfDay(new Date())
                  }
                  mode="date"
                  onChange={(value) => updateField("endDate", value)}
                  placeholder="Select end date"
                  required
                  value={form.endDate}
                />
              </>
            )}

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <DateTimeField
                  error={errors.inTime}
                  label="In Time"
                  mode="time"
                  onChange={(value) => updateField("inTime", value)}
                  placeholder="Select time"
                  required
                  value={form.inTime}
                />
              </View>
              <View style={styles.timeField}>
                <DateTimeField
                  error={errors.outTime}
                  label="Out Time"
                  mode="time"
                  onChange={(value) => updateField("outTime", value)}
                  placeholder="Select time"
                  required
                  value={form.outTime}
                />
              </View>
            </View>
          </FormSection>

          <FormSection
            icon="options-outline"
            subtitle="Visit instructions and travel settings"
            title="Visit Details"
          >
            <FormTextField
              accessibilityLabel="Treatment instructions"
              error={errors.instructions}
              icon="document-text-outline"
              label="Instructions"
              maxLength={1000}
              multiline
              onChangeText={(value) =>
                updateField("instructions", value)
              }
              placeholder="Enter treatment instructions"
              required
              value={form.instructions}
            />
            <SegmentedControl
              accessibilityLabel="Schedule priority"
              label="Priority"
              onChange={(value) => updateField("priority", value)}
              options={priorityOptions}
              value={form.priority}
            />
            <SearchableSelect
              accessibilityLabel="Select transport mode"
              emptyMessage="No transport modes match this search."
              icon="car-outline"
              label="Transport Mode"
              onSelect={(option) =>
                updateField(
                  "transportMode",
                  option.id as ScheduleTransportMode
                )
              }
              options={transportOptions}
              placeholder="Select transport mode"
              searchPlaceholder="Search transport modes"
              selectedId={form.transportMode}
              title="Select Transport Mode"
            />
          </FormSection>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              activeOpacity={0.82}
              disabled={submitting}
              onPress={cancelForm}
              style={[
                styles.cancelButton,
                submitting ? styles.disabledButton : null,
              ]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              activeOpacity={0.84}
              disabled={submitting}
              onPress={() => void handleSubmit()}
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
              <Text style={styles.saveText}>
                {submitting ? "Creating..." : "Create Schedule"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface FormSectionProps {
  children: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle: string;
  title: string;
}

const FormSection = ({
  children,
  icon,
  subtitle,
  title,
}: FormSectionProps) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons color={PRIMARY} name={icon} size={21} />
      </View>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
    {children}
  </View>
);

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
    paddingBottom: spacing.screen,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  sectionHeader: {
    alignItems: "center",
    borderBottomColor: colors.neutral150,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: spacing.s13,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    marginRight: spacing.s11,
    width: 40,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.s3,
  },
  segmentedField: {
    marginTop: spacing.xl,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.s7,
  },
  required: {
    color: colors.danger,
  },
  segmentedControl: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    flexDirection: "row",
    gap: spacing.s7,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  selectedSegment: {
    backgroundColor: PRIMARY,
  },
  segmentText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  selectedSegmentText: {
    color: colors.surface,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  timeRow: {
    gap: spacing.none,
  },
  timeField: {
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.s11,
    marginTop: spacing.xs,
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
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
    flex: 1.6,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  saveText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorPage: {
    flex: 1,
    padding: spacing.xxl,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.screen,
    padding: spacing.xxxl,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xlPlus,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
