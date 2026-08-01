import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormScrollView } from "../layout/FormScrollView";
import {
  DateTimeField,
  FormTextField,
  ScheduleFormSkeleton,
  SearchableSelect,
  type SelectOption,
} from "./ScheduleFormControls";
import {
  AdminScheduleServiceError,
  getAdminScheduleFormOptions,
  getTherapistAvailability,
} from "../../services/adminScheduleService";
import {
  createSchedule,
  getScheduleById,
  ScheduleServiceError,
  updateSchedule,
} from "../../services/scheduleService";
import type {
  AdminScheduleFormOptions,
  TherapistAvailability,
} from "../../types/adminSchedule";
import type {
  SchedulePriority,
  ScheduleType,
  ScheduleVisitType,
} from "../../types/schedule";
import type {
  ScheduleFormErrors,
  ScheduleFormState,
} from "../../types/scheduleForm";
import {
  buildCreateScheduleRequest,
  buildUpdateScheduleRequest,
  createInitialScheduleForm,
  getScheduleFormFingerprint,
  scheduleResponseToForm,
  startOfDay,
  validateScheduleForm,
} from "../../utils/scheduleForm";
import { clearAuthSession } from "../../utils/storage";

interface AdminScheduleFormScreenProps {
  mode: "create" | "edit";
  reschedule?: boolean;
  scheduleId?: number;
}

interface SegmentOption<T extends string> {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: T;
}

const scheduleTypeOptions: readonly SegmentOption<ScheduleType>[] = [
  { icon: "calendar-outline", label: "One Time", value: "one_time" },
  { icon: "repeat-outline", label: "Recurring", value: "recurring" },
];

const visitTypeOptions: readonly SegmentOption<ScheduleVisitType>[] = [
  { icon: "home-outline", label: "Home", value: "home_visit" },
  { icon: "business-outline", label: "Clinic", value: "clinic_visit" },
  { icon: "refresh-outline", label: "Follow-up", value: "follow_up" },
  { icon: "clipboard-outline", label: "Assessment", value: "assessment" },
];

const priorityOptions: readonly SegmentOption<SchedulePriority>[] = [
  { icon: "remove-outline", label: "Normal", value: "normal" },
  { icon: "alert-outline", label: "High", value: "high" },
];

const durationOptions = [30, 45, 60, 90, 120] as const;

const addMinutes = (value: Date, minutes: number): Date => {
  const next = new Date(value);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
};

const minutesBetween = (start: Date, end: Date): number =>
  end.getHours() * 60 +
  end.getMinutes() -
  (start.getHours() * 60 + start.getMinutes());

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unable to save the schedule.";

const FormSection = ({
  children,
  icon,
  subtitle,
  title,
}: {
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle: string;
  title: string;
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons color={colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const SegmentedControl = <T extends string,>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  value: T;
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      style={styles.segmented}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
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
              color={selected ? colors.surface : colors.textMuted}
              name={option.icon}
              size={16}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.segmentLabel,
                selected ? styles.selectedSegmentLabel : null,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const AvailabilitySummary = ({
  availability,
  loading,
}: {
  availability: TherapistAvailability | null;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <View style={styles.availability}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.availabilityNeutral}>
          Checking therapist availability...
        </Text>
      </View>
    );
  }
  if (!availability) return null;
  return (
    <View
      accessible
      accessibilityLabel={
        availability.available
          ? "Therapist is available"
          : "Therapist has a scheduling conflict"
      }
      style={[
        styles.availability,
        availability.available
          ? styles.available
          : styles.unavailable,
      ]}
    >
      <Ionicons
        color={
          availability.available ? colors.greenDark : colors.danger
        }
        name={
          availability.available
            ? "checkmark-circle"
            : "warning"
        }
        size={20}
      />
      <View style={styles.availabilityText}>
        <Text
          style={[
            styles.availabilityTitle,
            {
              color: availability.available
                ? colors.greenDark
                : colors.danger,
            },
          ]}
        >
          {availability.available
            ? "Available for this time"
            : "Scheduling conflict"}
        </Text>
        <Text style={styles.availabilityMeta}>
          {availability.todayAppointments} appointments today
          {availability.conflicts.length
            ? ` | overlaps ${availability.conflicts[0].patientName}`
            : ""}
        </Text>
      </View>
    </View>
  );
};

export function AdminScheduleFormScreen({
  mode,
  reschedule = false,
  scheduleId,
}: AdminScheduleFormScreenProps) {
  const { width } = useWindowDimensions();
  const stackColumns = width < 390;
  const [form, setForm] = useState<ScheduleFormState>(
    createInitialScheduleForm
  );
  const [originalForm, setOriginalForm] =
    useState<ScheduleFormState | null>(null);
  const [options, setOptions] =
    useState<AdminScheduleFormOptions | null>(null);
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const [availability, setAvailability] =
    useState<TherapistAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] =
    useState(false);
  const [clinicalExpanded, setClinicalExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSessionExpiry = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (
        (error instanceof AdminScheduleServiceError ||
          error instanceof ScheduleServiceError) &&
        error.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }
      return false;
    },
    []
  );

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [formOptions, schedule] = await Promise.all([
        getAdminScheduleFormOptions(),
        mode === "edit" && scheduleId
          ? getScheduleById(scheduleId)
          : Promise.resolve(null),
      ]);
      setOptions(formOptions);
      if (schedule) {
        const nextForm = scheduleResponseToForm(schedule);
        setForm(nextForm);
        setOriginalForm(nextForm);
        setClinicalExpanded(
          Boolean(nextForm.clinicalNotes || nextForm.precautions)
        );
      }
    } catch (error) {
      if (await handleSessionExpiry(error)) return;
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpiry, mode, scheduleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateField = useCallback(
    <K extends keyof ScheduleFormState>(
      key: K,
      value: ScheduleFormState[K]
    ) => {
      setForm((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
    },
    []
  );

  const availabilityReady =
    form.therapistId !== null &&
    form.inTime !== null &&
    form.outTime !== null &&
    (form.scheduleType === "one_time"
      ? form.treatmentDate !== null
      : form.startDate !== null && form.endDate !== null);

  useEffect(() => {
    const therapistId = form.therapistId;
    const startTime = form.inTime;
    const expectedEndTime = form.outTime;
    if (
      !availabilityReady ||
      therapistId === null ||
      startTime === null ||
      expectedEndTime === null
    ) {
      setAvailability(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoadingAvailability(true);
      try {
        setAvailability(
          await getTherapistAvailability({
            endDate: form.endDate,
            excludeScheduleId:
              mode === "edit" ? scheduleId : undefined,
            expectedEndTime,
            scheduleType: form.scheduleType,
            startDate: form.startDate,
            startTime,
            therapistId,
            treatmentDate: form.treatmentDate,
          })
        );
      } catch (error) {
        if (await handleSessionExpiry(error)) return;
        setAvailability(null);
      } finally {
        setLoadingAvailability(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [
    availabilityReady,
    form.endDate,
    form.inTime,
    form.outTime,
    form.scheduleType,
    form.startDate,
    form.therapistId,
    form.treatmentDate,
    handleSessionExpiry,
    mode,
    scheduleId,
  ]);

  const patientEntries = useMemo(
    () =>
      (options?.patients ?? []).map((patient, index) => ({
        option: {
          description:
            patient.referenceId ?? patient.phone ?? patient.address,
          id: `patient-${index}`,
          label: patient.name,
        },
        patient,
      })),
    [options]
  );
  const patientOptions = useMemo(
    () => patientEntries.map((entry) => entry.option),
    [patientEntries]
  );
  const doctorOptions = useMemo<SelectOption[]>(
    () =>
      options?.doctors.map((doctor) => ({
        description: doctor.specialization ?? undefined,
        id: doctor.id,
        label: doctor.name,
      })) ?? [],
    [options]
  );
  const therapistOptions = useMemo<SelectOption[]>(
    () =>
      options?.therapists.map((therapist) => ({
        description: `${therapist.todayAppointments} appointments today`,
        id: therapist.id,
        label: therapist.name,
      })) ?? [],
    [options]
  );

  const choosePatient = useCallback(
    (option: SelectOption) => {
      const entry = patientEntries.find(
        (candidate) => candidate.option.id === option.id
      );
      if (!entry) return;
      setForm((current) => ({
        ...current,
        patientAddress: entry.patient.address,
        patientName: entry.patient.name,
        patientPhone: entry.patient.phone ?? "",
        patientReferenceId: entry.patient.referenceId ?? "",
      }));
      setErrors((current) => ({
        ...current,
        patientAddress: undefined,
        patientName: undefined,
        patientPhone: undefined,
      }));
    },
    [patientEntries]
  );

  const setDuration = useCallback((minutes: number) => {
    setForm((current) => ({
      ...current,
      estimatedDurationMinutes: minutes,
      outTime: current.inTime
        ? addMinutes(current.inTime, minutes)
        : current.outTime,
    }));
    setErrors((current) => ({ ...current, outTime: undefined }));
  }, []);

  const isDirty = useMemo(
    () =>
      getScheduleFormFingerprint(form) !==
      getScheduleFormFingerprint(
        originalForm ?? createInitialScheduleForm()
      ),
    [form, originalForm]
  );

  const close = useCallback(() => {
    if (!isDirty || submitting) {
      router.back();
      return;
    }
    Alert.alert(
      "Discard Changes?",
      "Unsaved schedule information will be lost.",
      [
        { style: "cancel", text: "Keep Editing" },
        { onPress: () => router.back(), style: "destructive", text: "Discard" },
      ]
    );
  }, [isDirty, submitting]);

  const submit = useCallback(async (): Promise<void> => {
    const nextErrors = validateScheduleForm(form, originalForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      scrollRef.current?.scrollTo({ animated: true, y: 0 });
      return;
    }
    if (availability && !availability.available) {
      Alert.alert(
        "Therapist Unavailable",
        "Choose another therapist or time before saving."
      );
      return;
    }
    if (submitRef.current) return;

    submitRef.current = true;
    setSubmitting(true);
    try {
      let saved;
      if (mode === "create") {
        const request = buildCreateScheduleRequest(form);
        if (!request) return;
        saved = await createSchedule(request);
      } else {
        const request = buildUpdateScheduleRequest(form);
        if (!request || !scheduleId) return;
        saved = await updateSchedule(scheduleId, request);
      }
      Alert.alert(
        mode === "create" ? "Schedule Created" : "Schedule Updated",
        `${saved.patient_name}'s appointment has been saved.`,
        [{ onPress: () => router.replace("/(admin)/schedules"), text: "OK" }],
        { cancelable: false }
      );
    } catch (error) {
      if (await handleSessionExpiry(error)) return;
      Alert.alert("Unable to Save Schedule", getErrorMessage(error));
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  }, [
    availability,
    form,
    handleSessionExpiry,
    mode,
    originalForm,
    scheduleId,
  ]);

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScheduleFormSkeleton />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.errorPage}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={38}
          />
          <Text style={styles.errorTitle}>Form unavailable</Text>
          <Text style={styles.errorMessage}>{loadError}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void loadData()}
            style={styles.primaryButton}
          >
            <Ionicons color={colors.surface} name="refresh" size={18} />
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const title = reschedule
    ? "Reschedule Visit"
    : mode === "create"
      ? "Create Schedule"
      : "Edit Schedule";

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          disabled={submitting}
          onPress={close}
          style={styles.iconButton}
        >
          <Ionicons
            color={colors.textSecondary}
            name="arrow-back"
            size={22}
          />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Schedule Management</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>

      <FormScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <FormSection
          icon="person-outline"
          subtitle="Identify the patient and treatment location"
          title="Patient Information"
        >
          {patientOptions.length ? (
            <SearchableSelect
              accessibilityLabel="Search previous patients"
              emptyMessage="No previous patients match this search."
              icon="search-outline"
              label="Find Existing Patient"
              onSelect={choosePatient}
              options={patientOptions}
              placeholder="Search previous patients"
              searchPlaceholder="Name, ID or phone"
              selectedId={null}
              title="Select Patient"
            />
          ) : null}
          <FormTextField
            accessibilityLabel="Patient name"
            error={errors.patientName}
            icon="person-outline"
            label="Patient Name"
            maxLength={120}
            onChangeText={(value) => updateField("patientName", value)}
            placeholder="Enter patient name"
            required
            value={form.patientName}
          />
          <View
            style={[
              styles.twoColumns,
              stackColumns ? styles.stackedColumns : null,
            ]}
          >
            <View style={styles.column}>
              <FormTextField
                accessibilityLabel="Patient ID"
                icon="card-outline"
                label="Patient ID"
                maxLength={50}
                onChangeText={(value) =>
                  updateField("patientReferenceId", value)
                }
                placeholder="Optional ID"
                value={form.patientReferenceId}
              />
            </View>
            <View style={styles.column}>
              <FormTextField
                accessibilityLabel="Patient phone number"
                error={errors.patientPhone}
                icon="call-outline"
                keyboardType="phone-pad"
                label="Phone Number"
                maxLength={20}
                onChangeText={(value) =>
                  updateField("patientPhone", value)
                }
                placeholder="Optional phone"
                value={form.patientPhone}
              />
            </View>
          </View>
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
            placeholder="Complete visit address"
            required
            value={form.patientAddress}
          />
          <View style={styles.infoRow}>
            <Ionicons
              color={colors.blue}
              name="map-outline"
              size={17}
            />
            <Text style={styles.infoText}>
              The address is verified and geocoded when the schedule is saved.
            </Text>
          </View>
        </FormSection>

        <FormSection
          icon="medkit-outline"
          subtitle="Define the clinical purpose and expected effort"
          title="Treatment Information"
        >
          <FormTextField
            accessibilityLabel="Treatment name"
            error={errors.treatmentName}
            icon="medical-outline"
            label="Treatment Name"
            maxLength={160}
            onChangeText={(value) =>
              updateField("treatmentName", value)
            }
            placeholder="Enter treatment or procedure"
            required
            value={form.treatmentName}
          />
          <FormTextField
            accessibilityLabel="Medicines"
            icon="medical-outline"
            label="Medicines"
            maxLength={500}
            multiline
            onChangeText={(value) => updateField("medicines", value)}
            placeholder="Medicines or supplies, if applicable"
            value={form.medicines}
          />
          <SegmentedControl
            label="Visit Type"
            onChange={(value) => updateField("visitType", value)}
            options={visitTypeOptions}
            value={form.visitType}
          />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Estimated Duration</Text>
            <View style={styles.durationRow}>
              {durationOptions.map((minutes) => {
                const selected =
                  form.estimatedDurationMinutes === minutes;
                return (
                  <TouchableOpacity
                    accessibilityLabel={`${minutes} minutes`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={minutes}
                    onPress={() => setDuration(minutes)}
                    style={[
                      styles.durationChip,
                      selected ? styles.selectedDuration : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        selected
                          ? styles.selectedDurationText
                          : null,
                      ]}
                    >
                      {minutes >= 60
                        ? `${minutes / 60} hr`
                        : `${minutes} min`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </FormSection>

        <FormSection
          icon="people-outline"
          subtitle="Assign accountable clinical staff"
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
          <AvailabilitySummary
            availability={availability}
            loading={loadingAvailability}
          />
          <SegmentedControl
            label="Priority"
            onChange={(value) => updateField("priority", value)}
            options={priorityOptions}
            value={form.priority}
          />
        </FormSection>

        <FormSection
          icon="calendar-outline"
          subtitle="Set the visit date and expected service window"
          title="Schedule"
        >
          <SegmentedControl
            label="Schedule Type"
            onChange={(value) => {
              setForm((current) => ({
                ...current,
                endDate: value === "one_time" ? null : current.endDate,
                scheduleType: value,
                startDate:
                  value === "one_time" ? null : current.startDate,
                treatmentDate:
                  value === "recurring"
                    ? null
                    : current.treatmentDate,
              }));
            }}
            options={scheduleTypeOptions}
            value={form.scheduleType}
          />
          {form.scheduleType === "one_time" ? (
            <DateTimeField
              error={errors.treatmentDate}
              label="Visit Date"
              minimumDate={startOfDay(new Date())}
              mode="date"
              onChange={(value) =>
                updateField("treatmentDate", value)
              }
              placeholder="Select date"
              required
              value={form.treatmentDate}
            />
          ) : (
            <View
              style={[
                styles.twoColumns,
                stackColumns ? styles.stackedColumns : null,
              ]}
            >
              <View style={styles.column}>
                <DateTimeField
                  error={errors.startDate}
                  label="Start Date"
                  minimumDate={startOfDay(new Date())}
                  mode="date"
                  onChange={(value) => updateField("startDate", value)}
                  placeholder="Start date"
                  required
                  value={form.startDate}
                />
              </View>
              <View style={styles.column}>
                <DateTimeField
                  error={errors.endDate}
                  label="End Date"
                  minimumDate={form.startDate ?? startOfDay(new Date())}
                  mode="date"
                  onChange={(value) => updateField("endDate", value)}
                  placeholder="End date"
                  required
                  value={form.endDate}
                />
              </View>
            </View>
          )}
          <View
            style={[
              styles.twoColumns,
              stackColumns ? styles.stackedColumns : null,
            ]}
          >
            <View style={styles.column}>
              <DateTimeField
                error={errors.inTime}
                label="Start Time"
                mode="time"
                onChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    inTime: value,
                    outTime: addMinutes(
                      value,
                      current.estimatedDurationMinutes
                    ),
                  }));
                  setErrors((current) => ({
                    ...current,
                    inTime: undefined,
                    outTime: undefined,
                  }));
                }}
                placeholder="Start time"
                required
                value={form.inTime}
              />
            </View>
            <View style={styles.column}>
              <DateTimeField
                error={errors.outTime}
                label="Expected End Time"
                mode="time"
                onChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    estimatedDurationMinutes: current.inTime
                      ? Math.max(15, minutesBetween(current.inTime, value))
                      : current.estimatedDurationMinutes,
                    outTime: value,
                  }));
                  setErrors((current) => ({
                    ...current,
                    outTime: undefined,
                  }));
                }}
                placeholder="End time"
                required
                value={form.outTime}
              />
            </View>
          </View>
        </FormSection>

        <FormSection
          icon="document-text-outline"
          subtitle="Share clear guidance for the assigned therapist"
          title="Visit Notes"
        >
          <FormTextField
            accessibilityLabel="Visit instructions"
            error={errors.instructions}
            icon="list-outline"
            label="Instructions"
            maxLength={1000}
            multiline
            onChangeText={(value) =>
              updateField("instructions", value)
            }
            placeholder="Required visit instructions"
            required
            value={form.instructions}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded: clinicalExpanded }}
            onPress={() =>
              setClinicalExpanded((current) => !current)
            }
            style={styles.disclosure}
          >
            <View style={styles.disclosureIcon}>
              <Ionicons
                color={colors.primary}
                name="shield-checkmark-outline"
                size={19}
              />
            </View>
            <View style={styles.disclosureText}>
              <Text style={styles.disclosureTitle}>
                Clinical guidance
              </Text>
              <Text style={styles.disclosureSubtitle}>
                Notes and precautions for complex visits
              </Text>
            </View>
            <Ionicons
              color={colors.textMuted}
              name={
                clinicalExpanded ? "chevron-up" : "chevron-down"
              }
              size={20}
            />
          </TouchableOpacity>
          {clinicalExpanded ? (
            <>
              <FormTextField
                accessibilityLabel="Clinical notes"
                icon="clipboard-outline"
                label="Clinical Notes"
                maxLength={1500}
                multiline
                onChangeText={(value) =>
                  updateField("clinicalNotes", value)
                }
                placeholder="Relevant clinical context"
                value={form.clinicalNotes}
              />
              <FormTextField
                accessibilityLabel="Visit precautions"
                icon="warning-outline"
                label="Precautions"
                maxLength={1000}
                multiline
                onChangeText={(value) =>
                  updateField("precautions", value)
                }
                placeholder="Safety, infection-control or mobility precautions"
                value={form.precautions}
              />
            </>
          ) : null}
        </FormSection>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={submitting}
            onPress={close}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void submit()}
            style={[
              styles.primaryButton,
              submitting ? styles.disabled : null,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Ionicons
                color={colors.surface}
                name="checkmark-circle-outline"
                size={19}
              />
            )}
            <Text style={styles.primaryButtonText}>
              {submitting
                ? "Saving..."
                : mode === "create"
                  ? "Create Schedule"
                  : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headerText: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size21,
    fontWeight: typography.weight.extrabold,
    marginTop: 2,
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
    elevation: shadows.elevation.card,
    marginBottom: spacing.xl,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  sectionHeader: {
    alignItems: "center",
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  sectionHeading: { flex: 1 },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: 2,
  },
  sectionBody: { padding: spacing.xl },
  field: { marginBottom: spacing.lg },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  segmented: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  selectedSegment: { backgroundColor: colors.primary },
  segmentLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  selectedSegmentLabel: { color: colors.surface },
  twoColumns: { flexDirection: "row", gap: spacing.md },
  stackedColumns: { flexDirection: "column", gap: 0 },
  column: { flex: 1, minWidth: 0 },
  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  durationChip: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 60,
    paddingHorizontal: spacing.md,
  },
  selectedDuration: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  durationText: {
    color: colors.textSecondary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.semibold,
  },
  selectedDurationText: {
    color: colors.primaryDark,
    fontWeight: typography.weight.extrabold,
  },
  infoRow: {
    alignItems: "flex-start",
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  infoText: {
    color: colors.blueDark,
    flex: 1,
    fontSize: typography.size.captionLarge,
    lineHeight: 18,
  },
  availability: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  available: { backgroundColor: colors.greenSurfaceLight },
  unavailable: { backgroundColor: colors.dangerSurface },
  availabilityText: { flex: 1 },
  availabilityTitle: {
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
  },
  availabilityMeta: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    marginTop: 2,
  },
  availabilityNeutral: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
  },
  disclosure: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 58,
    padding: spacing.md,
  },
  disclosureIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  disclosureText: { flex: 1 },
  disclosureTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  disclosureSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "flex-end",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontWeight: typography.weight.bold,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: typography.weight.bold,
  },
  disabled: { opacity: 0.6 },
  errorPage: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  errorMessage: {
    color: colors.textMuted,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
