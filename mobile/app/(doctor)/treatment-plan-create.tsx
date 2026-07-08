import { colors, radius, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
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
  DoctorBackHeader,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  createTreatmentPlan,
  getMyDoctorVisits,
  getMyTreatmentPlans,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  formatDoctorDate,
  nullableDoctorText,
} from "../../src/utils/doctorWorkflow";

export default function CreateDoctorTreatmentPlanScreen() {
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [duration, setDuration] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [frequency, setFrequency] = useState("");
  const [medicines, setMedicines] = useState("");
  const [remarks, setRemarks] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(
    null
  );
  const [sessionsRequired, setSessionsRequired] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const plansQuery = useQuery({
    queryFn: getMyTreatmentPlans,
    queryKey: queryKeys.doctor.treatmentPlans.all,
  });
  const visitsQuery = useQuery({
    queryFn: getMyDoctorVisits,
    queryKey: queryKeys.doctor.treatmentPlans.visits,
  });
  const eligibleVisits = useMemo(() => {
    const plannedVisitIds = new Set(
      (plansQuery.data ?? []).map((plan) => plan.doctor_visit_id)
    );
    return (visitsQuery.data ?? []).filter(
      (visit) =>
        visit.status === "visited" && !plannedVisitIds.has(visit.id)
    );
  }, [plansQuery.data, visitsQuery.data]);
  const selectedVisit = eligibleVisits.find(
    (visit) => visit.id === selectedVisitId
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedVisit) {
        throw new Error("Select a completed doctor visit.");
      }

      return createTreatmentPlan({
        chief_complaint: nullableDoctorText(chiefComplaint),
        diagnosis: nullableDoctorText(diagnosis),
        doctor_id: selectedVisit.doctor_id,
        doctor_visit_id: selectedVisit.id,
        duration: nullableDoctorText(duration),
        frequency: nullableDoctorText(frequency),
        medicines: nullableDoctorText(medicines),
        patient_name: selectedVisit.patient_name,
        remarks: nullableDoctorText(remarks),
        sessions_required: sessionsRequired.trim()
          ? Number(sessionsRequired)
          : null,
        special_instructions: nullableDoctorText(specialInstructions),
        treatment_plan: nullableDoctorText(treatmentPlan),
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Submit Plan",
        getApiErrorMessage(error, "Unable to submit this treatment plan.")
      );
    },
    onSuccess: async (plan) => {
      queryClient.setQueryData(
        queryKeys.doctor.treatmentPlans.detail(plan.id),
        plan
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.treatmentPlans.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.treatmentPlans.visits,
        }),
      ]);
      Alert.alert(
        "Treatment Plan Submitted",
        "The plan is awaiting admin approval.",
        [
          {
            onPress: () =>
              router.replace({
                pathname: "/(doctor)/treatment-plan-details",
                params: { id: String(plan.id) },
              }),
            text: "View Plan",
          },
        ]
      );
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/treatment-plans");
    }
  };
  const selectVisit = (visitId: number) => {
    const visit = eligibleVisits.find((item) => item.id === visitId);
    setSelectedVisitId(visitId);
    setChiefComplaint(visit?.chief_complaint ?? "");
    setFormError(null);
  };
  const submit = () => {
    if (submittingRef.current || mutation.isPending) {
      return;
    }

    if (!selectedVisit) {
      setFormError("Select a completed doctor visit.");
      return;
    }

    if (sessionsRequired.trim()) {
      const sessions = Number(sessionsRequired);

      if (!Number.isInteger(sessions) || sessions < 1) {
        setFormError("Sessions required must be a positive whole number.");
        return;
      }
    }

    setFormError(null);
    submittingRef.current = true;
    mutation.mutate();
  };

  if (
    (plansQuery.isPending && !plansQuery.data) ||
    (visitsQuery.isPending && !visitsQuery.data)
  ) {
    return <DoctorLoadingState label="Loading eligible visits..." />;
  }

  if (
    (plansQuery.error && !plansQuery.data) ||
    (visitsQuery.error && !visitsQuery.data)
  ) {
    const error = plansQuery.error ?? visitsQuery.error;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Create Treatment Plan" />
        <DoctorErrorState
          message={getApiErrorMessage(
            error,
            "Unable to load eligible doctor visits."
          )}
          onRetry={() =>
            void Promise.all([
              plansQuery.refetch(),
              visitsQuery.refetch(),
            ])
          }
          title="Visits unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Create Treatment Plan" />
      {eligibleVisits.length === 0 ? (
        <View style={styles.emptyContainer}>
          <DoctorEmptyState
            description="A visit must be marked visited and cannot already have a treatment plan."
            icon="calendar-outline"
            title="No eligible visits"
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>Completed doctor visit *</Text>
            <View style={styles.visitList}>
              {eligibleVisits.map((visit) => {
                const selected = selectedVisitId === visit.id;

                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={visit.id}
                    style={[
                      styles.visitCard,
                      selected && styles.selectedVisit,
                    ]}
                    onPress={() => selectVisit(visit.id)}
                  >
                    <View style={styles.visitText}>
                      <Text style={styles.visitPatient}>
                        {visit.patient_name}
                      </Text>
                      <Text style={styles.visitMeta}>
                        Visit #{visit.id} ·{" "}
                        {formatDoctorDate(visit.visit_date)} at{" "}
                        {visit.visit_time.slice(0, 5)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radio,
                        selected && styles.selectedRadio,
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
            {formError === "Select a completed doctor visit." ? (
              <Text style={styles.formError}>{formError}</Text>
            ) : null}

            <DoctorField
              label="Diagnosis"
              multiline
              value={diagnosis}
              onChangeText={setDiagnosis}
            />
            <DoctorField
              label="Chief complaint"
              multiline
              value={chiefComplaint}
              onChangeText={setChiefComplaint}
            />
            <DoctorField
              label="Treatment plan"
              multiline
              value={treatmentPlan}
              onChangeText={setTreatmentPlan}
            />
            <DoctorField
              label="Medicines"
              multiline
              value={medicines}
              onChangeText={setMedicines}
            />
            <DoctorField
              error={
                formError ===
                "Sessions required must be a positive whole number."
                  ? formError
                  : null
              }
              keyboardType="number-pad"
              label="Sessions required"
              value={sessionsRequired}
              onChangeText={(value) => {
                setSessionsRequired(value);
                setFormError(null);
              }}
            />
            <DoctorField
              label="Frequency"
              placeholder="e.g. 3 times weekly"
              value={frequency}
              onChangeText={setFrequency}
            />
            <DoctorField
              label="Duration"
              placeholder="e.g. 4 weeks"
              value={duration}
              onChangeText={setDuration}
            />
            <DoctorField
              label="Special instructions"
              multiline
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
            />
            <DoctorField
              label="Remarks"
              multiline
              value={remarks}
              onChangeText={setRemarks}
            />

            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Submission sends this plan for admin approval. The
                backend does not provide a Doctor edit endpoint after
                submission.
              </Text>
            </View>

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
                  ? "Submitting..."
                  : "Submit for Approval"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  sectionLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  visitList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  visitCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    minHeight: 68,
    padding: spacing.lgPlus,
  },
  selectedVisit: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  visitText: {
    flex: 1,
  },
  visitPatient: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  visitMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  radio: {
    borderColor: colors.inputBorder,
    borderRadius: radius.rounded,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  selectedRadio: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 5,
  },
  formError: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginBottom: spacing.xl,
    marginTop: -spacing.lg,
  },
  notice: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    padding: spacing.lg,
  },
  noticeText: {
    color: colors.warningDark,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.s19,
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
