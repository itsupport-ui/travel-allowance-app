import { colors, radius, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
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

import { FormScrollView } from "../../src/components/layout/FormScrollView";
import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  completeDoctorConsultation,
  getDoctorConsultation,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { PatientDecision } from "../../src/types/doctorWorkflow";
import {
  formatDoctorDate,
  nullableDoctorText,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

const decisions: readonly {
  label: string;
  value: PatientDecision;
}[] = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Rejected", value: "rejected" },
  { label: "Follow up", value: "follow_up" },
];

export default function CompleteDoctorConsultationScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const consultationId = useMemo(
    () => parsePositiveId(params.id),
    [params.id]
  );
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const [callOutcome, setCallOutcome] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [patientDecision, setPatientDecision] =
    useState<PatientDecision>("pending");
  const [proposedTreatment, setProposedTreatment] = useState("");
  const consultationQuery = useQuery({
    enabled: consultationId !== null,
    queryFn: () => {
      if (consultationId === null) {
        throw new Error("A valid consultation ID is required.");
      }
      return getDoctorConsultation(consultationId);
    },
    queryKey:
      consultationId === null
        ? ["doctor", "consultations", "complete", "invalid"]
        : queryKeys.doctor.consultations.detail(consultationId),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (consultationId === null) {
        throw new Error("A valid consultation ID is required.");
      }

      const amount =
        estimatedAmount.trim() === "" ? null : Number(estimatedAmount);

      return completeDoctorConsultation(consultationId, {
        call_outcome: callOutcome.trim(),
        estimated_amount: amount,
        patient_decision: patientDecision,
        preliminary_diagnosis: nullableDoctorText(diagnosis),
        proposed_treatment: nullableDoctorText(proposedTreatment),
        follow_up_date: patientDecision === "follow_up" ? followUpDate : null,
        follow_up_time: patientDecision === "follow_up" ? followUpTime : null,
        follow_up_reason:
          patientDecision === "follow_up" ? followUpReason.trim() : null,
        lifecycle_version: consultationQuery.data?.lifecycle_version ?? 1,
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Complete",
        getApiErrorMessage(
          error,
          "Unable to complete this consultation."
        )
      );
    },
    onSuccess: async (consultation) => {
      queryClient.setQueryData(
        queryKeys.doctor.consultations.detail(consultation.id),
        consultation
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.doctor.consultations.all,
      });
      Alert.alert("Consultation Completed", "The outcome was saved.", [
        {
          onPress: () =>
            router.replace({
              pathname: "/(doctor)/consultation-details",
              params: { id: String(consultation.id) },
            }),
          text: "View Details",
        },
      ]);
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/consultations");
    }
  };
  const submit = () => {
    if (submittingRef.current || mutation.isPending) {
      return;
    }

    if (!callOutcome.trim()) {
      setFormError("Call outcome is required.");
      return;
    }

    if (estimatedAmount.trim()) {
      const amount = Number(estimatedAmount);

      if (!Number.isFinite(amount) || amount < 0) {
        setFormError("Estimated amount must be zero or more.");
        return;
      }
    }

    if (patientDecision === "follow_up") {
      if (!followUpDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(followUpTime)) {
        setFormError("Follow-up date and time are required.");
        return;
      }
      if (followUpReason.trim().length < 3) {
        setFormError("Enter a clear follow-up reason.");
        return;
      }
    }

    setFormError(null);
    submittingRef.current = true;
    mutation.mutate();
  };

  if (consultationQuery.isPending && !consultationQuery.data) {
    return <DoctorLoadingState label="Loading consultation..." />;
  }

  const consultation = consultationQuery.data;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Complete Consultation" />
      {consultationId === null ? (
        <DoctorErrorState
          message="A valid consultation ID is required."
          onRetry={goBack}
          title="Invalid consultation"
        />
      ) : consultationQuery.error && !consultation ? (
        <DoctorErrorState
          message={getApiErrorMessage(
            consultationQuery.error,
            "Unable to load this consultation."
          )}
          onRetry={() => void consultationQuery.refetch()}
        />
      ) : consultation?.status !== "scheduled" ? (
        <DoctorErrorState
          message="Only scheduled consultations can be completed."
          onRetry={goBack}
          title="Consultation not editable"
        />
      ) : consultation ? (
        <View style={styles.flex}>
          <FormScrollView
            contentContainerStyle={styles.content}
          >
            <View style={styles.contextCard}>
              <Text style={styles.patientName}>
                {consultation.patient_name}
              </Text>
              <Text style={styles.contextText}>
                {formatDoctorDate(consultation.scheduled_date)} at{" "}
                {consultation.scheduled_time.slice(0, 5)}
              </Text>
              <Text style={styles.purpose}>{consultation.purpose}</Text>
            </View>

            <DoctorField
              error={
                formError === "Call outcome is required."
                  ? formError
                  : null
              }
              label="Call outcome"
              multiline
              placeholder="Describe the outcome of the patient call"
              required
              value={callOutcome}
              onChangeText={(value) => {
                setCallOutcome(value);
                setFormError(null);
              }}
            />
            <DoctorField
              label="Preliminary diagnosis"
              multiline
              value={diagnosis}
              onChangeText={setDiagnosis}
            />
            <DoctorField
              label="Proposed treatment"
              multiline
              value={proposedTreatment}
              onChangeText={setProposedTreatment}
            />
            <DoctorField
              error={
                formError ===
                "Estimated amount must be zero or more."
                  ? formError
                  : null
              }
              keyboardType="decimal-pad"
              label="Estimated amount"
              placeholder="0.00"
              value={estimatedAmount}
              onChangeText={(value) => {
                setEstimatedAmount(value);
                setFormError(null);
              }}
            />

            <Text style={styles.choiceLabel}>Patient decision *</Text>
            <DoctorChoiceChips
              onChange={(value) => {
                setPatientDecision(value);
                setFormError(null);
              }}
              options={decisions}
              value={patientDecision}
            />

            {patientDecision === "follow_up" ? (
              <View style={styles.followUpCard}>
                <Text style={styles.followUpTitle}>Set a follow-up task</Text>
                <AppDatePickerField
                  label="Follow-up date"
                  required
                  value={followUpDate}
                  onChange={setFollowUpDate}
                />
                <DoctorField
                  label="Follow-up time"
                  placeholder="HH:MM"
                  required
                  value={followUpTime}
                  onChangeText={setFollowUpTime}
                />
                <DoctorField
                  label="Follow-up reason"
                  multiline
                  required
                  value={followUpReason}
                  onChangeText={setFollowUpReason}
                />
              </View>
            ) : null}

            {formError &&
            formError !== "Call outcome is required." &&
            formError !== "Estimated amount must be zero or more." ? (
              <Text accessibilityRole="alert" style={styles.formError}>
                {formError}
              </Text>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: mutation.isPending }}
              disabled={mutation.isPending}
              style={[
                styles.submitButton,
                mutation.isPending && styles.disabledButton,
              ]}
              onPress={submit}
            >
              {mutation.isPending ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : null}
              <Text style={styles.submitText}>
                {mutation.isPending
                  ? "Saving..."
                  : "Complete Consultation"}
              </Text>
            </TouchableOpacity>
          </FormScrollView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  contextCard: {
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  contextText: {
    color: colors.blueDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  purpose: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.md,
  },
  choiceLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  followUpCard: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  followUpTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.md,
  },
  formError: {
    color: colors.danger,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.lg,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xxxl,
    minHeight: 52,
  },
  disabledButton: {
    opacity: 0.65,
  },
  submitText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
});
