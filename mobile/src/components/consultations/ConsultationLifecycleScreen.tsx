import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../common/AppDatePickerField";
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../doctor/DoctorWorkflowUi";
import { FormScrollView } from "../layout/FormScrollView";
import { queryKeys } from "../../query/queryKeys";
import { getApiErrorMessage } from "../../services/errorHandler";
import {
  cancelDoctorConsultation,
  getDoctorConsultation,
  rescheduleDoctorConsultation,
  scheduleDoctorConsultationFollowUp,
} from "../../services/doctorWorkflowService";
import type { DoctorConsultation } from "../../types/doctorWorkflow";
import {
  formatDoctorDate,
  getLocalIsoDate,
  parsePositiveId,
} from "../../utils/doctorWorkflow";

type LifecycleMode = "cancel" | "follow_up" | "reschedule";
type CancellationCode =
  | "doctor_unavailable"
  | "duplicate"
  | "other"
  | "patient_cancelled";

const cancellationOptions: readonly {
  label: string;
  value: CancellationCode;
}[] = [
  { label: "Patient cancelled", value: "patient_cancelled" },
  { label: "Doctor unavailable", value: "doctor_unavailable" },
  { label: "Duplicate", value: "duplicate" },
  { label: "Other", value: "other" },
];

const copy = {
  cancel: {
    button: "Cancel consultation",
    description: "Keep the original appointment and reason in its audit history.",
    title: "Cancel Consultation",
  },
  follow_up: {
    button: "Schedule follow-up",
    description: "Create a linked appointment from the completed consultation.",
    title: "Schedule Follow-up",
  },
  reschedule: {
    button: "Create replacement",
    description: "Cancel the current booking and create a linked replacement.",
    title: "Reschedule Consultation",
  },
} as const;

export function ConsultationLifecycleScreen({
  role,
}: {
  role: "admin" | "doctor";
}) {
  const params = useLocalSearchParams<{
    id?: string | string[];
    mode?: string | string[];
  }>();
  const consultationId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const modeValue = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode: LifecycleMode | null =
    modeValue === "cancel" ||
    modeValue === "follow_up" ||
    modeValue === "reschedule"
      ? modeValue
      : null;
  const detailHref = (id: number): Href =>
    (role === "doctor"
      ? `/(doctor)/consultation-details?id=${id}`
      : `/(admin)/doctor-workflow-consultation-details?id=${id}`) as Href;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (consultationId !== null) router.replace(detailHref(consultationId));
  };
  const consultationQuery = useQuery({
    enabled: consultationId !== null && mode !== null,
    queryFn: () => {
      if (consultationId === null) throw new Error("A consultation ID is required.");
      return getDoctorConsultation(consultationId);
    },
    queryKey:
      consultationId === null
        ? [role, "consultation-lifecycle", "invalid"]
        : [role, "consultation-lifecycle", consultationId],
  });

  if (consultationId === null || mode === null) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Consultation" />
        <DoctorErrorState
          message="A valid consultation and lifecycle action are required."
          onRetry={goBack}
          title="Invalid action"
        />
      </SafeAreaView>
    );
  }
  if (consultationQuery.isPending && !consultationQuery.data) {
    return <DoctorLoadingState label="Loading consultation..." />;
  }
  if (consultationQuery.error || !consultationQuery.data) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title={copy[mode].title} />
        <DoctorErrorState
          message={getApiErrorMessage(
            consultationQuery.error,
            "Unable to load this consultation."
          )}
          onRetry={() => void consultationQuery.refetch()}
          title="Consultation unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <LifecycleForm
      consultation={consultationQuery.data}
      mode={mode}
      role={role}
      onBack={goBack}
    />
  );
}

function LifecycleForm({
  consultation,
  mode,
  onBack,
  role,
}: {
  consultation: DoctorConsultation;
  mode: LifecycleMode;
  onBack: () => void;
  role: "admin" | "doctor";
}) {
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const [cancellationCode, setCancellationCode] =
    useState<CancellationCode>("patient_cancelled");
  const [date, setDate] = useState(
    mode === "follow_up" ? consultation.follow_up_date ?? "" : ""
  );
  const [time, setTime] = useState(
    mode === "follow_up" ? consultation.follow_up_time?.slice(0, 5) ?? "" : ""
  );
  const [reason, setReason] = useState(
    mode === "follow_up" ? consultation.follow_up_reason ?? "" : ""
  );
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const common = {
        lifecycle_version: consultation.lifecycle_version,
        reason: reason.trim(),
      };
      if (mode === "cancel") {
        return cancelDoctorConsultation(consultation.id, {
          ...common,
          cancellation_code: cancellationCode,
        });
      }
      if (mode === "reschedule") {
        return rescheduleDoctorConsultation(consultation.id, {
          ...common,
          scheduled_date: date,
          scheduled_time: time,
        });
      }
      return scheduleDoctorConsultationFollowUp(consultation.id, {
        ...common,
        scheduled_date: date,
        scheduled_time: time,
      });
    },
    onError: (error) => {
      submittingRef.current = false;
      setFormError(getApiErrorMessage(error, "Unable to update this consultation."));
    },
    onSuccess: async (updated) => {
      submittingRef.current = false;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.doctor.consultations.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.adminDoctorWorkflow.consultations,
        }),
      ]);
      const message =
        mode === "cancel"
          ? "The appointment was cancelled and its history was retained."
          : "The linked appointment is ready in the consultation list.";
      Alert.alert("Consultation updated", message, [
        {
          onPress: () =>
            router.replace(
              (role === "doctor"
                ? `/(doctor)/consultation-details?id=${updated.id}`
                : `/(admin)/doctor-workflow-consultation-details?id=${updated.id}`) as Href
            ),
          text: "View appointment",
        },
      ]);
    },
  });

  const submit = () => {
    if (mutation.isPending || submittingRef.current) return;
    if (reason.trim().length < (mode === "follow_up" ? 3 : 5)) {
      setFormError("Enter a clear reason before continuing.");
      return;
    }
    if (mode !== "cancel") {
      if (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        setFormError("Select a date and enter time in HH:MM format.");
        return;
      }
      if (date < getLocalIsoDate()) {
        setFormError("The new appointment cannot be in the past.");
        return;
      }
    }
    setFormError(null);
    submittingRef.current = true;
    mutation.mutate();
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={onBack} title={copy[mode].title} />
      <FormScrollView contentContainerStyle={styles.content}>
        <View style={styles.contextCard}>
          <View style={styles.contextIcon}>
            <Ionicons color={colors.primary} name="calendar-outline" size={22} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={styles.patientName}>{consultation.patient_name}</Text>
            <Text style={styles.contextText}>
              {formatDoctorDate(consultation.scheduled_date)} at{" "}
              {consultation.scheduled_time.slice(0, 5)}
            </Text>
          </View>
        </View>
        <Text style={styles.description}>{copy[mode].description}</Text>

        {mode === "cancel" ? (
          <>
            <Text style={styles.label}>Cancellation category *</Text>
            <DoctorChoiceChips
              onChange={setCancellationCode}
              options={cancellationOptions}
              value={cancellationCode}
            />
          </>
        ) : (
          <>
            <AppDatePickerField
              label="New appointment date"
              required
              value={date}
              onChange={setDate}
            />
            <DoctorField
              label="New appointment time"
              placeholder="HH:MM"
              required
              value={time}
              onChangeText={setTime}
            />
          </>
        )}
        <DoctorField
          label={mode === "follow_up" ? "Follow-up reason" : "Reason"}
          multiline
          required
          value={reason}
          onChangeText={(value) => {
            setReason(value);
            setFormError(null);
          }}
        />
        {formError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {formError}
          </Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: mutation.isPending }}
          disabled={mutation.isPending}
          style={[
            styles.submitButton,
            mode === "cancel" && styles.destructiveButton,
            mutation.isPending && styles.disabledButton,
          ]}
          onPress={submit}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : null}
          <Text style={styles.submitText}>
            {mutation.isPending ? "Saving..." : copy[mode].button}
          </Text>
        </TouchableOpacity>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  contextCard: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  contextIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  contextCopy: { flex: 1 },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  contextText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.xs,
  },
  description: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  label: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.md,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 52,
  },
  destructiveButton: { backgroundColor: colors.danger },
  disabledButton: { opacity: 0.6 },
  submitText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
});
