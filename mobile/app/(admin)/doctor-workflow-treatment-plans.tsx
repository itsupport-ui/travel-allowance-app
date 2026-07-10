import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorDetailRow,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  approveTreatmentPlan,
  createScheduleFromTreatmentPlan,
  getApprovedTreatmentPlans,
  getPendingTreatmentPlans,
  getTherapistsForTreatmentPlan,
  rejectTreatmentPlan,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type {
  TreatmentPlan,
  TreatmentPlanScheduleRequest,
} from "../../src/types/doctorWorkflow";
import {
  formatDoctorDate,
  getLocalIsoDate,
} from "../../src/utils/doctorWorkflow";

type PlanTab = "approved" | "pending";
type ActivePanel = "reject" | "schedule" | null;

const tabOptions = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
] as const;

const transportOptions = [
  "vehicle",
  "auto",
  "bus",
  "metro",
  "cab",
] as const;

const priorityOptions = ["normal", "high"] as const;

const EMPTY_PLANS: TreatmentPlan[] = [];
const DOCTOR_WORKFLOW_ROUTE = "/(admin)/doctor-workflow" as const;

const goToDoctorWorkflow = () => {
  router.replace(DOCTOR_WORKFLOW_ROUTE);
};

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

const isTime = (value: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const getScheduleCount = (plan: TreatmentPlan): number =>
  Number(plan.schedule_count ?? 0);

const isPlanScheduleGenerated = (
  plan: TreatmentPlan,
  generatedPlanIds: Set<number>
): boolean =>
  Boolean(plan.has_schedule) ||
  getScheduleCount(plan) > 0 ||
  generatedPlanIds.has(plan.id);

const getScheduleGeneratedLabel = (plan: TreatmentPlan): string => {
  const count = getScheduleCount(plan);
  if (count > 0) {
    return `${count} ${count === 1 ? "schedule" : "schedules"} generated`;
  }
  return "Schedule already generated";
};

export default function AdminTreatmentPlansWorkflowScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PlanTab>("pending");
  const [panel, setPanel] = useState<ActivePanel>(null);
  const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(
    null
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [generatedPlanIds, setGeneratedPlanIds] = useState<Set<number>>(
    () => new Set()
  );
  const [scheduleForm, setScheduleForm] = useState({
    date_mode: "treatment_date",
    in_time: "",
    instructions: "",
    number_of_sessions: "1",
    out_time: "",
    priority: "normal",
    session_date: getLocalIsoDate(),
    therapist_id: "",
    transport_mode: "vehicle",
  });
  const pendingQuery = useQuery({
    queryFn: getPendingTreatmentPlans,
    queryKey: [
      ...queryKeys.adminDoctorWorkflow.treatmentPlans,
      "pending",
    ],
  });
  const approvedQuery = useQuery({
    queryFn: getApprovedTreatmentPlans,
    queryKey: [
      ...queryKeys.adminDoctorWorkflow.treatmentPlans,
      "approved",
    ],
  });
  const therapistsQuery = useQuery({
    queryFn: getTherapistsForTreatmentPlan,
    queryKey: queryKeys.adminDoctorWorkflow.therapists,
  });
  const pendingPlans = pendingQuery.data ?? EMPTY_PLANS;
  const approvedPlans = approvedQuery.data ?? EMPTY_PLANS;
  const visiblePlans = useMemo(
    () => (activeTab === "pending" ? pendingPlans : approvedPlans),
    [activeTab, approvedPlans, pendingPlans]
  );

  const invalidatePlans = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.adminDoctorWorkflow.treatmentPlans,
    });
  };

  const approveMutation = useMutation({
    mutationFn: approveTreatmentPlan,
    onError: (error) => {
      Alert.alert(
        "Unable to Approve Plan",
        getApiErrorMessage(error, "Unable to approve this treatment plan.")
      );
    },
    onSuccess: async () => {
      await invalidatePlans();
      setActiveTab("approved");
      Alert.alert("Treatment Plan Approved", "The plan is now approved.");
    },
  });
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) {
        throw new Error("Select a treatment plan first.");
      }
      return rejectTreatmentPlan(selectedPlan.id, rejectionReason.trim());
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Reject Plan",
        getApiErrorMessage(error, "Unable to reject this treatment plan.")
      );
    },
    onSuccess: async () => {
      await invalidatePlans();
      setPanel(null);
      setSelectedPlan(null);
      setRejectionReason("");
      Alert.alert("Treatment Plan Rejected", "The plan was returned.");
    },
  });
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) {
        throw new Error("Select a treatment plan first.");
      }
      const usesTreatmentDate =
        scheduleForm.date_mode === "treatment_date";
      const payload: TreatmentPlanScheduleRequest = {
        in_time: scheduleForm.in_time.trim(),
        instructions: scheduleForm.instructions.trim(),
        number_of_sessions: Number(scheduleForm.number_of_sessions),
        out_time: scheduleForm.out_time.trim(),
        priority: scheduleForm.priority,
        start_date: usesTreatmentDate
          ? null
          : scheduleForm.session_date.trim(),
        therapist_id: Number(scheduleForm.therapist_id),
        transport_mode: scheduleForm.transport_mode,
        treatment_date: usesTreatmentDate
          ? scheduleForm.session_date.trim()
          : null,
      };
      return createScheduleFromTreatmentPlan(selectedPlan.id, payload);
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Generate Schedule",
        getApiErrorMessage(error, "Unable to generate therapist schedules.")
      );
    },
    onSuccess: async (schedules) => {
      if (selectedPlan) {
        setGeneratedPlanIds((current) => {
          const next = new Set(current);
          next.add(selectedPlan.id);
          return next;
        });
      }
      await invalidatePlans();
      setPanel(null);
      setSelectedPlan(null);
      Alert.alert(
        "Schedule Generated",
        `${schedules.length} treatment session${
          schedules.length === 1 ? "" : "s"
        } created.`
      );
    },
  });

  const openReject = (plan: TreatmentPlan) => {
    setFormError(null);
    setSelectedPlan(plan);
    setRejectionReason("");
    setPanel("reject");
  };
  const openSchedule = (plan: TreatmentPlan) => {
    if (isPlanScheduleGenerated(plan, generatedPlanIds)) {
      Alert.alert(
        "Schedule already generated",
        "This treatment plan already has therapist schedules."
      );
      return;
    }
    setFormError(null);
    setSelectedPlan(plan);
    setScheduleForm({
      date_mode: "treatment_date",
      in_time: "",
      instructions: plan.special_instructions ?? "",
      number_of_sessions: String(plan.sessions_required || 1),
      out_time: "",
      priority: "normal",
      session_date: getLocalIsoDate(),
      therapist_id: "",
      transport_mode: "vehicle",
    });
    setPanel("schedule");
  };
  const confirmApprove = (plan: TreatmentPlan) => {
    Alert.alert(
      "Approve Treatment Plan?",
      `Approve the plan for ${plan.patient_name}?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => approveMutation.mutate(plan.id),
          text: "Approve",
        },
      ]
    );
  };
  const submitReject = () => {
    if (!rejectionReason.trim()) {
      setFormError("Rejection reason is required.");
      return;
    }
    setFormError(null);
    rejectMutation.mutate();
  };
  const submitSchedule = () => {
    if (
      selectedPlan &&
      isPlanScheduleGenerated(selectedPlan, generatedPlanIds)
    ) {
      Alert.alert(
        "Schedule already generated",
        "This treatment plan already has therapist schedules."
      );
      setPanel(null);
      setSelectedPlan(null);
      return;
    }
    const sessions = Number(scheduleForm.number_of_sessions);
    if (
      !scheduleForm.therapist_id ||
      !scheduleForm.session_date.trim() ||
      !scheduleForm.in_time.trim() ||
      !scheduleForm.out_time.trim() ||
      !scheduleForm.instructions.trim()
    ) {
      setFormError("Therapist, date, time, sessions, and instructions are required.");
      return;
    }
    if (!Number.isInteger(sessions) || sessions < 1) {
      setFormError("Sessions must be a positive whole number.");
      return;
    }
    if (!isIsoDate(scheduleForm.session_date)) {
      setFormError("Select a valid session date.");
      return;
    }
    if (scheduleForm.session_date < getLocalIsoDate()) {
      setFormError("Session date cannot be in the past.");
      return;
    }
    if (!isTime(scheduleForm.in_time) || !isTime(scheduleForm.out_time)) {
      setFormError("In time and out time must use HH:MM 24-hour format.");
      return;
    }
    if (scheduleForm.out_time <= scheduleForm.in_time) {
      setFormError("Out time must be later than in time.");
      return;
    }
    setFormError(null);
    scheduleMutation.mutate();
  };

  if (
    (pendingQuery.isPending && !pendingQuery.data) ||
    (approvedQuery.isPending && !approvedQuery.data) ||
    (therapistsQuery.isPending && !therapistsQuery.data)
  ) {
    return <DoctorLoadingState label="Loading treatment plans..." />;
  }

  if (
    (pendingQuery.error && !pendingQuery.data) ||
    (approvedQuery.error && !approvedQuery.data) ||
    (therapistsQuery.error && !therapistsQuery.data)
  ) {
    const error =
      pendingQuery.error ?? approvedQuery.error ?? therapistsQuery.error;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader
          onBack={goToDoctorWorkflow}
          title="Treatment Plans"
        />
        <DoctorErrorState
          message={getApiErrorMessage(
            error,
            "Unable to load treatment plans."
          )}
          onRetry={() =>
            void Promise.all([
              pendingQuery.refetch(),
              approvedQuery.refetch(),
              therapistsQuery.refetch(),
            ])
          }
          title="Treatment plans unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        onBack={goToDoctorWorkflow}
        title="Treatment Plans"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              refreshing={
                pendingQuery.isRefetching || approvedQuery.isRefetching
              }
              tintColor={colors.primary}
              onRefresh={() =>
                void Promise.all([
                  pendingQuery.refetch(),
                  approvedQuery.refetch(),
                ])
              }
            />
          }
        >
          <Text style={styles.eyebrow}>Doctor Workflow</Text>
          <Text style={styles.title}>Treatment Plans</Text>
          <Text style={styles.subtitle}>
            Review doctor submissions and generate schedules for approved plans.
          </Text>

          <View style={styles.tabCard}>
            <DoctorChoiceChips
              onChange={setActiveTab}
              options={tabOptions}
              value={activeTab}
            />
            <View style={styles.countRow}>
              <CountPill label="Pending" value={pendingPlans.length} />
              <CountPill label="Approved" value={approvedPlans.length} />
            </View>
          </View>

          {panel === "reject" && selectedPlan ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Reject treatment plan</Text>
              <Text style={styles.panelSubtitle}>
                {selectedPlan.patient_name}
              </Text>
              <DoctorField
                label="Rejection reason"
                multiline
                required
                value={rejectionReason}
                onChangeText={setRejectionReason}
              />
              <PanelActions
                busy={rejectMutation.isPending}
                destructive
                error={formError}
                primaryLabel="Reject"
                onCancel={goToDoctorWorkflow}
                onSubmit={submitReject}
              />
            </View>
          ) : null}

          {panel === "schedule" && selectedPlan ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Generate therapist schedule</Text>
              <Text style={styles.panelSubtitle}>
                {selectedPlan.patient_name}
              </Text>
              <Text style={styles.selectorLabel}>Therapist *</Text>
              <View style={styles.chipList}>
                {(therapistsQuery.data ?? []).map((therapist) => {
                  const selected =
                    scheduleForm.therapist_id === String(therapist.id);
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={therapist.id}
                      style={[
                        styles.chip,
                        selected && styles.selectedChip,
                      ]}
                      onPress={() =>
                        setScheduleForm((current) => ({
                          ...current,
                          therapist_id: String(therapist.id),
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.selectedChipText,
                        ]}
                      >
                        {therapist.username}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.selectorLabel}>Date input</Text>
              <DoctorChoiceChips
                onChange={(value) =>
                  setScheduleForm((current) => ({
                    ...current,
                    date_mode: value,
                  }))
                }
                options={[
                  { label: "Treatment date", value: "treatment_date" },
                  { label: "Start date", value: "start_date" },
                ]}
                value={
                  scheduleForm.date_mode as "start_date" | "treatment_date"
                }
              />
              <AppDatePickerField
                label="First session date"
                required
                value={scheduleForm.session_date}
                onChange={(value) =>
                  setScheduleForm((current) => ({
                    ...current,
                    session_date: value,
                  }))
                }
              />
              <DoctorField
                keyboardType="number-pad"
                label="Sessions"
                required
                value={scheduleForm.number_of_sessions}
                onChangeText={(value) =>
                  setScheduleForm((current) => ({
                    ...current,
                    number_of_sessions: value,
                  }))
                }
              />
              <DoctorField
                label="In time"
                placeholder="HH:MM"
                required
                value={scheduleForm.in_time}
                onChangeText={(value) =>
                  setScheduleForm((current) => ({
                    ...current,
                    in_time: value,
                  }))
                }
              />
              <DoctorField
                label="Out time"
                placeholder="HH:MM"
                required
                value={scheduleForm.out_time}
                onChangeText={(value) =>
                  setScheduleForm((current) => ({
                    ...current,
                    out_time: value,
                  }))
                }
              />
              <Text style={styles.selectorLabel}>Priority</Text>
              <View style={styles.chipList}>
                {priorityOptions.map((priority) => {
                  const selected = scheduleForm.priority === priority;
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={priority}
                      style={[
                        styles.chip,
                        selected && styles.selectedChip,
                      ]}
                      onPress={() =>
                        setScheduleForm((current) => ({
                          ...current,
                          priority,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.selectedChipText,
                        ]}
                      >
                        {priority}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.selectorLabel}>Transport mode</Text>
              <View style={styles.chipList}>
                {transportOptions.map((mode) => {
                  const selected = scheduleForm.transport_mode === mode;
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={mode}
                      style={[
                        styles.chip,
                        selected && styles.selectedChip,
                      ]}
                      onPress={() =>
                        setScheduleForm((current) => ({
                          ...current,
                          transport_mode: mode,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.selectedChipText,
                        ]}
                      >
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <DoctorField
                label="Instructions"
                multiline
                required
                value={scheduleForm.instructions}
                onChangeText={(value) =>
                  setScheduleForm((current) => ({
                    ...current,
                    instructions: value,
                  }))
                }
              />
              <PanelActions
                busy={scheduleMutation.isPending}
                error={formError}
                primaryLabel="Generate"
                onCancel={goToDoctorWorkflow}
                onSubmit={submitSchedule}
              />
            </View>
          ) : null}

          {visiblePlans.length === 0 ? (
            <DoctorEmptyState
              description={`No ${activeTab} treatment plans found.`}
              icon="medkit-outline"
              title="No treatment plans"
            />
          ) : (
            visiblePlans.map((plan) => (
              <PlanCard
                activeTab={activeTab}
                busy={
                  approveMutation.isPending ||
                  rejectMutation.isPending ||
                  scheduleMutation.isPending
                }
                generated={isPlanScheduleGenerated(
                  plan,
                  generatedPlanIds
                )}
                key={plan.id}
                plan={plan}
                onApprove={confirmApprove}
                onReject={openReject}
                onSchedule={openSchedule}
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countPill}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function PanelActions({
  busy,
  destructive = false,
  error,
  onCancel,
  onSubmit,
  primaryLabel,
}: {
  busy: boolean;
  destructive?: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  primaryLabel: string;
}) {
  return (
    <>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.panelActions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.secondaryButton}
          onPress={onCancel}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={[
            styles.submitButton,
            destructive && styles.destructiveButton,
            busy && styles.disabledButton,
          ]}
          onPress={onSubmit}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : null}
          <Text style={styles.submitButtonText}>
            {busy ? "Saving..." : primaryLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function PlanCard({
  activeTab,
  busy,
  generated,
  onApprove,
  onReject,
  onSchedule,
  plan,
}: {
  activeTab: PlanTab;
  busy: boolean;
  generated: boolean;
  onApprove: (plan: TreatmentPlan) => void;
  onReject: (plan: TreatmentPlan) => void;
  onSchedule: (plan: TreatmentPlan) => void;
  plan: TreatmentPlan;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.patientName}>{plan.patient_name}</Text>
          <Text style={styles.mutedText}>
            {plan.doctor_name ?? `Doctor #${plan.doctor_id}`} · Visit #
            {plan.doctor_visit_id}
          </Text>
        </View>
        <DoctorStatusBadge status={plan.status} />
      </View>

      <View style={styles.detailCard}>
        <DoctorDetailRow
          label="Chief complaint"
          value={plan.chief_complaint || "Not available"}
        />
        <DoctorDetailRow
          label="Diagnosis"
          value={plan.diagnosis || "Not available"}
        />
        <DoctorDetailRow
          label="Treatment"
          value={plan.treatment_plan || "Not available"}
        />
        <DoctorDetailRow
          label="Medicines"
          value={plan.medicines || "Not available"}
        />
        <DoctorDetailRow
          label="Sessions"
          value={String(plan.sessions_required || "Not available")}
        />
        <DoctorDetailRow
          label="Frequency"
          value={plan.frequency || "Not available"}
        />
        <DoctorDetailRow
          label="Duration"
          value={plan.duration || "Not available"}
        />
        <DoctorDetailRow
          label="Special instructions"
          value={plan.special_instructions || "Not available"}
        />
        <DoctorDetailRow
          label="Created"
          value={formatDoctorDate(plan.created_at)}
        />
      </View>

      {generated ? (
        <View style={styles.workflowNotice}>
          <Text style={styles.workflowNoticeText}>
            {getScheduleGeneratedLabel(plan)}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardActions}>
        {activeTab === "pending" ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              style={[styles.smallButton, styles.approveButton]}
              onPress={() => onApprove(plan)}
            >
              <Text style={styles.approveButtonText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              style={[styles.smallButton, styles.rejectButton]}
              onPress={() => onReject(plan)}
            >
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || generated}
            style={[
              styles.smallButton,
              styles.scheduleButton,
              (busy || generated) && styles.disabledButton,
            ]}
            onPress={() => onSchedule(plan)}
          >
            <Text style={styles.scheduleButtonText}>
              {generated
                ? getScheduleGeneratedLabel(plan)
                : "Generate Schedule"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginBottom: spacing.xl,
    marginTop: spacing.s5,
  },
  tabCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  countRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  countPill: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    flex: 1,
    padding: spacing.lg,
  },
  countValue: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
  },
  countLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xs,
  },
  panelSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginBottom: spacing.lg,
  },
  selectorLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
  chipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lgPlus,
    paddingVertical: spacing.md,
  },
  selectedChip: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
    textTransform: "capitalize",
  },
  selectedChipText: {
    color: colors.primary,
  },
  panelActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryButtonText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
  },
  destructiveButton: {
    backgroundColor: colors.danger,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.55,
  },
  formError: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.lgPlus,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  cardTitleBlock: {
    flex: 1,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  detailCard: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  workflowNotice: {
    backgroundColor: colors.neutral100,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  workflowNoticeText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  smallButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  rejectButton: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorderStrong,
    borderWidth: 1,
  },
  rejectButtonText: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  scheduleButton: {
    backgroundColor: colors.blue,
  },
  scheduleButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
});
