import { colors, radius, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  getTreatmentPlan,
  getMyDoctorVisits,
  getMyTreatmentPlans,
  resubmitTreatmentPlan,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  formatDoctorDate,
  nullableDoctorText,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";
import {
  buildFormDraftKey,
  loadFormDraft,
  removeFormDraft,
  saveFormDraft,
} from "../../src/utils/formDraftStorage";
import { getStoredUser } from "../../src/utils/storage";

interface TreatmentPlanFormDraft {
  chiefComplaint: string;
  diagnosis: string;
  duration: string;
  frequency: string;
  medicines: string;
  remarks: string;
  selectedVisitId: number | null;
  sessionsRequired: string;
  specialInstructions: string;
  treatmentPlan: string;
}

const isTreatmentPlanFormDraft = (
  value: unknown
): value is TreatmentPlanFormDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<TreatmentPlanFormDraft>;
  return (
    typeof draft.chiefComplaint === "string" &&
    typeof draft.diagnosis === "string" &&
    typeof draft.duration === "string" &&
    typeof draft.frequency === "string" &&
    typeof draft.medicines === "string" &&
    typeof draft.remarks === "string" &&
    (draft.selectedVisitId === null ||
      typeof draft.selectedVisitId === "number") &&
    typeof draft.sessionsRequired === "string" &&
    typeof draft.specialInstructions === "string" &&
    typeof draft.treatmentPlan === "string"
  );
};

export default function CreateDoctorTreatmentPlanScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const correctionPlanId = useMemo(
    () => parsePositiveId(params.id),
    [params.id]
  );
  const isCorrection = correctionPlanId !== null;
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const draftInitializedRef = useRef(false);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftTouched, setDraftTouched] = useState(false);
  const [draftNotice, setDraftNotice] = useState<"restored" | "saved" | null>(
    null
  );
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
  const correctionQuery = useQuery({
    enabled: isCorrection,
    queryFn: () => {
      if (correctionPlanId === null) {
        throw new Error("A valid treatment plan ID is required.");
      }
      return getTreatmentPlan(correctionPlanId);
    },
    queryKey:
      correctionPlanId === null
        ? ["doctor", "treatment-plans", "correction", "invalid"]
        : queryKeys.doctor.treatmentPlans.detail(correctionPlanId),
  });
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
  useEffect(() => {
    const plan = correctionQuery.data;
    if (!plan || plan.status !== "rejected") return;
    setChiefComplaint(plan.chief_complaint ?? "");
    setDiagnosis(plan.diagnosis ?? "");
    setDuration(plan.duration ?? "");
    setFrequency(plan.frequency ?? "");
    setMedicines(plan.medicines ?? "");
    setRemarks(plan.remarks ?? "");
    setSessionsRequired(
      plan.sessions_required == null ? "" : String(plan.sessions_required)
    );
    setSpecialInstructions(plan.special_instructions ?? "");
    setTreatmentPlan(plan.treatment_plan ?? "");
  }, [correctionQuery.data]);
  useEffect(() => {
    if (draftInitializedRef.current) return;
    if (isCorrection && !correctionQuery.data) return;
    draftInitializedRef.current = true;
    let active = true;

    const initializeDraft = async () => {
      const user = await getStoredUser();
      if (!active || !user) {
        if (active) setDraftReady(true);
        return;
      }
      const key = buildFormDraftKey(
        user.id,
        isCorrection
          ? `doctor-treatment-plan-correction-${correctionPlanId}`
          : "doctor-treatment-plan-create"
      );
      setDraftKey(key);
      try {
        const stored = await loadFormDraft<TreatmentPlanFormDraft>(key);
        if (!active || !stored || !isTreatmentPlanFormDraft(stored.data)) {
          if (stored) await removeFormDraft(key);
          if (active) setDraftReady(true);
          return;
        }
        Alert.alert(
          "Restore treatment plan draft?",
          `An encrypted draft from ${new Date(stored.savedAt).toLocaleString()} is available on this device.`,
          [
            {
              onPress: () => {
                void removeFormDraft(key);
                setDraftReady(true);
              },
              style: "destructive",
              text: "Discard",
            },
            {
              onPress: () => {
                setChiefComplaint(stored.data.chiefComplaint);
                setDiagnosis(stored.data.diagnosis);
                setDuration(stored.data.duration);
                setFrequency(stored.data.frequency);
                setMedicines(stored.data.medicines);
                setRemarks(stored.data.remarks);
                setSelectedVisitId(stored.data.selectedVisitId);
                setSessionsRequired(stored.data.sessionsRequired);
                setSpecialInstructions(stored.data.specialInstructions);
                setTreatmentPlan(stored.data.treatmentPlan);
                setDraftNotice("restored");
                setDraftTouched(true);
                setDraftReady(true);
              },
              text: "Restore",
            },
          ],
          { cancelable: false }
        );
      } catch {
        if (active) setDraftReady(true);
      }
    };

    void initializeDraft();
    return () => {
      active = false;
    };
  }, [correctionPlanId, correctionQuery.data, isCorrection]);

  useEffect(() => {
    if (!draftReady || !draftTouched || !draftKey) return undefined;
    const timeout = setTimeout(() => {
      void saveFormDraft<TreatmentPlanFormDraft>(draftKey, {
        chiefComplaint,
        diagnosis,
        duration,
        frequency,
        medicines,
        remarks,
        selectedVisitId,
        sessionsRequired,
        specialInstructions,
        treatmentPlan,
      })
        .then(() => setDraftNotice("saved"))
        .catch(() => setDraftNotice(null));
    }, 700);
    return () => clearTimeout(timeout);
  }, [
    chiefComplaint,
    diagnosis,
    draftKey,
    draftReady,
    draftTouched,
    duration,
    frequency,
    medicines,
    remarks,
    selectedVisitId,
    sessionsRequired,
    specialInstructions,
    treatmentPlan,
  ]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!isCorrection && !selectedVisit) {
        throw new Error("Select a completed doctor visit.");
      }

      const request = {
        chief_complaint: nullableDoctorText(chiefComplaint),
        diagnosis: nullableDoctorText(diagnosis),
        duration: nullableDoctorText(duration),
        frequency: nullableDoctorText(frequency),
        medicines: nullableDoctorText(medicines),
        remarks: nullableDoctorText(remarks),
        sessions_required: sessionsRequired.trim()
          ? Number(sessionsRequired)
          : null,
        special_instructions: nullableDoctorText(specialInstructions),
        treatment_plan: nullableDoctorText(treatmentPlan),
      };
      if (isCorrection && correctionPlanId !== null) {
        return resubmitTreatmentPlan(correctionPlanId, request);
      }
      return createTreatmentPlan({
        ...request,
        doctor_visit_id: selectedVisit!.id,
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Submit Plan",
        getApiErrorMessage(error, "Unable to submit this treatment plan.")
      );
    },
    onSuccess: async (plan) => {
      if (draftKey) await removeFormDraft(draftKey);
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
        isCorrection ? "Plan Resubmitted" : "Treatment Plan Submitted",
        isCorrection
          ? "Your corrected revision is awaiting admin review."
          : "The plan is awaiting admin approval.",
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
    setDraftTouched(true);
    setFormError(null);
  };
  const submit = () => {
    if (submittingRef.current || mutation.isPending) {
      return;
    }

    if (!isCorrection && !selectedVisit) {
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
    (!isCorrection && plansQuery.isPending && !plansQuery.data) ||
    (!isCorrection && visitsQuery.isPending && !visitsQuery.data) ||
    (isCorrection && correctionQuery.isPending && !correctionQuery.data)
  ) {
    return <DoctorLoadingState label="Loading eligible visits..." />;
  }

  if (
    (!isCorrection && plansQuery.error && !plansQuery.data) ||
    (!isCorrection && visitsQuery.error && !visitsQuery.data) ||
    (isCorrection && correctionQuery.error && !correctionQuery.data)
  ) {
    const error = correctionQuery.error ?? plansQuery.error ?? visitsQuery.error;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title={isCorrection ? "Correct Treatment Plan" : "Create Treatment Plan"} />
        <DoctorErrorState
          message={getApiErrorMessage(
            error,
            "Unable to load eligible doctor visits."
          )}
          onRetry={() =>
            void Promise.all([
              isCorrection ? correctionQuery.refetch() : plansQuery.refetch(),
              isCorrection ? Promise.resolve() : visitsQuery.refetch(),
            ])
          }
          title="Visits unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title={isCorrection ? "Correct Treatment Plan" : "Create Treatment Plan"} />
      {!isCorrection && eligibleVisits.length === 0 ? (
        <View style={styles.emptyContainer}>
          <DoctorEmptyState
            description="A visit must be marked visited and cannot already have a treatment plan."
            icon="calendar-outline"
            title="No eligible visits"
          />
        </View>
      ) : (
        <View style={styles.flex}>
          <FormScrollView
            contentContainerStyle={styles.content}
          >
            {draftNotice ? (
              <View style={styles.draftNotice}>
                <View style={styles.draftTextContainer}>
                  <Text accessibilityLiveRegion="polite" style={styles.draftTitle}>
                    {draftNotice === "restored"
                      ? "Encrypted draft restored"
                      : "Encrypted draft saved"}
                  </Text>
                  <Text style={styles.draftText}>
                    This clinical draft stays in device-bound secure storage and is removed after submission or sign-out.
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityLabel="Discard encrypted treatment plan draft"
                  accessibilityRole="button"
                  onPress={() => {
                    if (draftKey) void removeFormDraft(draftKey);
                    setDraftNotice(null);
                    setDraftTouched(false);
                  }}
                >
                  <Text style={styles.discardDraft}>Discard</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {isCorrection ? (
              <View style={styles.correctionNotice}>
                <Text style={styles.correctionTitle}>Correction requested</Text>
                <Text style={styles.correctionText}>
                  {correctionQuery.data?.rejection_reason ||
                    "Please review and correct this treatment plan."}
                </Text>
              </View>
            ) : (
              <>
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
              </>
            )}

            <DoctorField
              label="Diagnosis"
              multiline
              value={diagnosis}
              onChangeText={(value) => {
                setDiagnosis(value);
                setDraftTouched(true);
              }}
            />
            <DoctorField
              label="Chief complaint"
              multiline
              value={chiefComplaint}
              onChangeText={(value) => {
                setChiefComplaint(value);
                setDraftTouched(true);
              }}
            />
            <DoctorField
              label="Treatment plan"
              multiline
              value={treatmentPlan}
              onChangeText={(value) => {
                setTreatmentPlan(value);
                setDraftTouched(true);
              }}
            />
            <DoctorField
              label="Medicines"
              multiline
              value={medicines}
              onChangeText={(value) => {
                setMedicines(value);
                setDraftTouched(true);
              }}
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
                setDraftTouched(true);
                setFormError(null);
              }}
            />
            <DoctorField
              label="Frequency"
              placeholder="e.g. 3 times weekly"
              value={frequency}
              onChangeText={(value) => {
                setFrequency(value);
                setDraftTouched(true);
              }}
            />
            <DoctorField
              label="Duration"
              placeholder="e.g. 4 weeks"
              value={duration}
              onChangeText={(value) => {
                setDuration(value);
                setDraftTouched(true);
              }}
            />
            <DoctorField
              label="Special instructions"
              multiline
              value={specialInstructions}
              onChangeText={(value) => {
                setSpecialInstructions(value);
                setDraftTouched(true);
              }}
            />
            <DoctorField
              label="Remarks"
              multiline
              value={remarks}
              onChangeText={(value) => {
                setRemarks(value);
                setDraftTouched(true);
              }}
            />

            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                {isCorrection
                  ? "Resubmitting keeps the same plan and records a new revision for admin review."
                  : "Submission sends this plan for admin approval."}
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
                  : isCorrection
                    ? "Resubmit Corrected Plan"
                    : "Submit for Approval"}
              </Text>
            </TouchableOpacity>
          </FormScrollView>
        </View>
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
  correctionNotice: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  correctionTitle: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  correctionText: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  draftNotice: {
    alignItems: "flex-start",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  draftTextContainer: { flex: 1 },
  draftTitle: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  draftText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.s19,
    marginTop: spacing.xs,
  },
  discardDraft: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
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
