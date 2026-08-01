import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import { ProgressBar, WorkflowSectionHeader } from "../../src/components/doctor/AdminWorkflowUi";
import { DoctorBackHeader, DoctorChoiceChips, DoctorDetailRow, DoctorErrorState, DoctorField, DoctorLoadingState, DoctorStatusBadge } from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import { approveTreatmentPlan, createScheduleFromTreatmentPlan, getTreatmentPlan, getTherapistsForTreatmentPlan, rejectTreatmentPlan } from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { TreatmentPlan, TreatmentPlanScheduleRequest } from "../../src/types/doctorWorkflow";
import { formatDoctorDateTime, getLocalIsoDate } from "../../src/utils/doctorWorkflow";

type Panel = "reject" | "schedule" | null;

const priorityOptions = ["normal", "high"] as const;

const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const getScheduleCount = (plan: TreatmentPlan): number => Number(plan.schedule_count ?? 0);
const isScheduleGenerated = (plan: TreatmentPlan): boolean => Boolean(plan.has_schedule) || getScheduleCount(plan) > 0;

export default function AdminTreatmentPlanDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const queryClient = useQueryClient();
  const planId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const [panel, setPanel] = useState<Panel>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ date_mode: "treatment_date", in_time: "", instructions: "", number_of_sessions: "1", out_time: "", priority: "normal", session_date: getLocalIsoDate(), therapist_id: "" });
  const planQuery = useQuery({
    enabled: planId !== null,
    queryFn: () => {
      if (planId === null) throw new Error("A valid treatment plan ID is required.");
      return getTreatmentPlan(planId);
    },
    queryKey: planId === null ? ["admin", "doctor-workflow", "treatment-plan", "invalid"] : ["admin", "doctor-workflow", "treatment-plan", planId],
  });
  const therapistsQuery = useQuery({ queryFn: getTherapistsForTreatmentPlan, queryKey: queryKeys.adminDoctorWorkflow.therapists });
  const plan = planQuery.data;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminDoctorWorkflow.treatmentPlans });
    await planQuery.refetch();
  };

  const approveMutation = useMutation({
    mutationFn: approveTreatmentPlan,
    onError: (error) => Alert.alert("Unable to Approve Plan", getApiErrorMessage(error, "Unable to approve this treatment plan.")),
    onSuccess: async () => { await invalidate(); Alert.alert("Treatment Plan Approved", "The plan is now approved."); },
  });
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Treatment plan is unavailable.");
      return rejectTreatmentPlan(plan.id, rejectionReason.trim());
    },
    onError: (error) => Alert.alert("Unable to Reject Plan", getApiErrorMessage(error, "Unable to reject this treatment plan.")),
    onSuccess: async () => { await invalidate(); setPanel(null); setRejectionReason(""); Alert.alert("Treatment Plan Rejected", "The plan was returned."); },
  });
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Treatment plan is unavailable.");
      const usesTreatmentDate = scheduleForm.date_mode === "treatment_date";
      const request: TreatmentPlanScheduleRequest = {
        in_time: scheduleForm.in_time.trim(),
        instructions: scheduleForm.instructions.trim(),
        number_of_sessions: Number(scheduleForm.number_of_sessions),
        out_time: scheduleForm.out_time.trim(),
        priority: scheduleForm.priority,
        start_date: usesTreatmentDate ? null : scheduleForm.session_date.trim(),
        therapist_id: Number(scheduleForm.therapist_id),
        treatment_date: usesTreatmentDate ? scheduleForm.session_date.trim() : null,
      };
      return createScheduleFromTreatmentPlan(plan.id, request);
    },
    onError: (error) => Alert.alert("Unable to Generate Schedule", getApiErrorMessage(error, "Unable to generate therapist schedules.")),
    onSuccess: async (schedules) => { await invalidate(); setPanel(null); Alert.alert("Schedule Generated", `${schedules.length} treatment session${schedules.length === 1 ? "" : "s"} created.`); },
  });

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/(admin)/doctor-workflow-treatment-plans"); };
  const confirmApprove = () => {
    if (!plan) return;
    Alert.alert("Approve Treatment Plan?", `Approve the plan for ${plan.patient_name}?`, [{ style: "cancel", text: "Cancel" }, { onPress: () => approveMutation.mutate(plan.id), text: "Approve" }]);
  };
  const openReject = () => { setFormError(null); setRejectionReason(""); setPanel("reject"); };
  const openSchedule = () => {
    if (!plan || isScheduleGenerated(plan)) { Alert.alert("Schedule already generated", "This treatment plan already has therapist schedules."); return; }
    setFormError(null);
    setScheduleForm({ date_mode: "treatment_date", in_time: "", instructions: plan.special_instructions ?? "", number_of_sessions: String(plan.sessions_required || 1), out_time: "", priority: "normal", session_date: getLocalIsoDate(), therapist_id: "" });
    setPanel("schedule");
  };
  const submitReject = () => { if (!rejectionReason.trim()) { setFormError("Rejection reason is required."); return; } setFormError(null); rejectMutation.mutate(); };
  const submitSchedule = () => {
    const sessions = Number(scheduleForm.number_of_sessions);
    if (!scheduleForm.therapist_id || !scheduleForm.session_date.trim() || !scheduleForm.in_time.trim() || !scheduleForm.out_time.trim() || !scheduleForm.instructions.trim()) { setFormError("Therapist, date, time, sessions, and instructions are required."); return; }
    if (!Number.isInteger(sessions) || sessions < 1) { setFormError("Sessions must be a positive whole number."); return; }
    if (!isIsoDate(scheduleForm.session_date)) { setFormError("Select a valid session date."); return; }
    if (scheduleForm.session_date < getLocalIsoDate()) { setFormError("Session date cannot be in the past."); return; }
    if (!isTime(scheduleForm.in_time) || !isTime(scheduleForm.out_time)) { setFormError("In time and out time must use HH:MM 24-hour format."); return; }
    if (scheduleForm.out_time <= scheduleForm.in_time) { setFormError("Out time must be later than in time."); return; }
    setFormError(null); scheduleMutation.mutate();
  };

  if (planQuery.isPending && !planQuery.data) return <DoctorLoadingState label="Loading treatment plan details..." />;
  if (planId === null) return <DetailError onBack={goBack} message="A valid treatment plan ID is required." title="Invalid treatment plan" />;
  if (planQuery.error && !plan) return <DetailError onBack={goBack} message={getApiErrorMessage(planQuery.error, "Unable to load treatment plan details.")} onRetry={() => void planQuery.refetch()} title="Treatment plan unavailable" />;
  if (!plan) return null;

  const generated = isScheduleGenerated(plan);
  const totalSessions = plan.sessions_required ?? 0;
  const scheduledSessions = getScheduleCount(plan);
  const busy = approveMutation.isPending || rejectMutation.isPending || scheduleMutation.isPending;
  const selectedTherapist = therapistsQuery.data?.find((therapist) => therapist.id === Number(scheduleForm.therapist_id));

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Treatment Plan Details" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl colors={[colors.primary]} refreshing={planQuery.isRefetching} tintColor={colors.primary} onRefresh={() => void planQuery.refetch()} />} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}><View style={styles.heroIcon}><Ionicons color={colors.primary} name="medkit-outline" size={28} /></View><View style={styles.heroCopy}><Text style={styles.heroName}>{plan.patient_name}</Text><Text style={styles.heroSubtitle}>{plan.doctor_name ?? `Doctor #${plan.doctor_id}`} · Visit #{plan.doctor_visit_id}</Text></View><DoctorStatusBadge status={plan.status} /></View>
        <DetailSection icon="person-outline" title="Patient information"><DoctorDetailRow label="Patient name" value={plan.patient_name} /><DoctorDetailRow label="Phone" value="Not available" /><DoctorDetailRow label="Address" value="Not available" /></DetailSection>
        <DetailSection icon="medical-outline" title="Treatment information"><DoctorDetailRow label="Treatment name" value={plan.treatment_plan || "Not available"} /><DoctorDetailRow label="Diagnosis" value={plan.diagnosis || "Not available"} /><DoctorDetailRow label="Chief complaint" value={plan.chief_complaint || "Not available"} /><DoctorDetailRow label="Medicines" value={plan.medicines || "Not available"} /><DoctorDetailRow label="Instructions" value={plan.special_instructions || "Not available"} /><DoctorDetailRow label="Doctor" value={plan.doctor_name ?? `Doctor #${plan.doctor_id}`} /><DoctorDetailRow label="Therapist" value={generated ? "Assigned through generated schedule" : "Not assigned"} /><DoctorDetailRow label="Status" value={<DoctorStatusBadge status={plan.status} />} /></DetailSection>
        <DetailSection icon="calendar-outline" title="Schedule"><DoctorDetailRow label="Start date" value="Not scheduled" /><DoctorDetailRow label="End date" value={plan.duration || "Not scheduled"} /><DoctorDetailRow label="Total sessions" value={totalSessions ? String(totalSessions) : "Not available"} /><DoctorDetailRow label="Scheduled sessions" value={scheduledSessions ? String(scheduledSessions) : "Not available"} /><DoctorDetailRow label="Completed sessions" value="Not available" /><DoctorDetailRow label="Remaining sessions" value={totalSessions ? String(Math.max(totalSessions - scheduledSessions, 0)) : "Not available"} /><View style={styles.progressBlock}><View style={styles.progressLabelRow}><Text style={styles.progressLabel}>Schedule generation progress</Text><Text style={styles.progressValue}>{totalSessions ? `${Math.round(Math.min(scheduledSessions / totalSessions, 1) * 100)}%` : "-"}</Text></View><ProgressBar progress={totalSessions ? scheduledSessions / totalSessions : 0} /></View></DetailSection>
        <DetailSection icon="document-text-outline" title="Notes"><DoctorDetailRow label="Doctor notes" value={plan.remarks || "Not available"} /><DoctorDetailRow label="Therapist notes" value="Not available" /><DoctorDetailRow label="Completion notes" value="Not available" /></DetailSection>
        <TimelineCard plan={plan} generated={generated} />
        <View style={styles.actionsCard}><Text style={styles.actionsTitle}>Available actions</Text>{plan.status === "pending" ? <View style={styles.actionRow}><ActionButton disabled={busy} destructive icon="close-circle-outline" label="Reject" onPress={openReject} /><ActionButton disabled={busy} icon="checkmark-circle-outline" label="Approve" onPress={confirmApprove} /></View> : null}{plan.status === "approved" && !generated ? <ActionButton disabled={busy} fullWidth icon="calendar-outline" label="Generate therapist schedule" onPress={openSchedule} /> : null}{generated ? <View style={styles.notice}><Ionicons color={colors.teal} name="checkmark-circle" size={20} /><Text style={styles.noticeText}>Schedule already generated</Text></View> : null}</View>
      </ScrollView>
      <RejectModal error={formError} reason={rejectionReason} saving={rejectMutation.isPending} visible={panel === "reject"} onChange={setRejectionReason} onClose={() => setPanel(null)} onSubmit={submitReject} />
      <ScheduleModal error={formError} form={scheduleForm} saving={scheduleMutation.isPending} selectedTherapist={selectedTherapist?.username ?? null} therapists={therapistsQuery.data ?? []} visible={panel === "schedule"} onChange={setScheduleForm} onClose={() => setPanel(null)} onSubmit={submitSchedule} />
    </SafeAreaView>
  );
}

function parsePositiveId(value: string | string[] | undefined): number | null { const raw = Array.isArray(value) ? value[0] : value; if (!raw || !/^\d+$/.test(raw)) return null; const id = Number(raw); return Number.isSafeInteger(id) && id > 0 ? id : null; }

function DetailError({ message, onBack, onRetry, title }: { message: string; onBack: () => void; onRetry?: () => void; title: string }) {
  return <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}><DoctorBackHeader onBack={onBack} title="Treatment Plan Details" /><DoctorErrorState message={message} onRetry={onRetry ?? onBack} title={title} /></SafeAreaView>;
}

function DetailSection({ children, icon, title }: { children: React.ReactNode; icon: keyof typeof Ionicons.glyphMap; title: string }) { return <View style={styles.detailCard}><WorkflowSectionHeader icon={icon} title={title} />{children}</View>; }

function TimelineCard({ generated, plan }: { generated: boolean; plan: TreatmentPlan }) {
  const events = [{ icon: "add-circle-outline" as const, label: "Treatment plan created", timestamp: plan.created_at }, ...(plan.status !== "pending" ? [{ icon: "checkmark-circle-outline" as const, label: "Treatment plan approved", timestamp: plan.updated_at ?? plan.created_at }] : []), ...(generated ? [{ icon: "calendar-outline" as const, label: "Therapist schedule generated", timestamp: plan.updated_at ?? plan.created_at }] : [])];
  return <View style={styles.detailCard}><WorkflowSectionHeader icon="time-outline" title="Timeline" />{events.map((event, index) => <View key={`${event.label}-${index}`} style={styles.timelineRow}><View style={styles.timelineIcon}><Ionicons color={index === events.length - 1 ? colors.teal : colors.primary} name={event.icon} size={18} />{index < events.length - 1 ? <View style={styles.timelineLine} /> : null}</View><View style={styles.timelineCopy}><Text style={styles.timelineLabel}>{event.label}</Text><Text style={styles.timelineTime}>{formatDoctorDateTime(event.timestamp)}</Text></View></View>)}</View>;
}

function ActionButton({ destructive = false, disabled, fullWidth = false, icon, label, onPress }: { destructive?: boolean; disabled: boolean; fullWidth?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) { return <TouchableOpacity accessibilityRole="button" disabled={disabled} style={[styles.actionButton, destructive && styles.destructiveAction, fullWidth && styles.fullWidthAction, disabled && styles.disabled]} onPress={onPress}><Ionicons color={destructive ? colors.danger : colors.surface} name={icon} size={19} /><Text style={[styles.actionText, destructive && styles.destructiveText]}>{label}</Text></TouchableOpacity>; }

function RejectModal({ error, onChange, onClose, onSubmit, reason, saving, visible }: { error: string | null; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void; reason: string; saving: boolean; visible: boolean }) { return <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}><View style={styles.overlay}><FormScrollView contentContainerStyle={styles.sheetContent}><View style={styles.sheet}><View style={styles.sheetHeader}><Text style={styles.modalTitle}>Reject treatment plan</Text><TouchableOpacity accessibilityRole="button" onPress={onClose}><Ionicons color={colors.textPrimary} name="close" size={24} /></TouchableOpacity></View><DoctorField label="Rejection reason" multiline required value={reason} onChangeText={onChange} /><ActionPanel busy={saving} destructive error={error} primaryLabel="Reject" onCancel={onClose} onSubmit={onSubmit} /></View></FormScrollView></View></Modal>; }

function ScheduleModal({ error, form, onChange, onClose, onSubmit, saving, selectedTherapist, therapists, visible }: { error: string | null; form: { date_mode: string; in_time: string; instructions: string; number_of_sessions: string; out_time: string; priority: string; session_date: string; therapist_id: string }; onChange: React.Dispatch<React.SetStateAction<{ date_mode: string; in_time: string; instructions: string; number_of_sessions: string; out_time: string; priority: string; session_date: string; therapist_id: string }>>; onClose: () => void; onSubmit: () => void; saving: boolean; selectedTherapist: string | null; therapists: { id: number; username: string }[]; visible: boolean }) {
  return <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>Doctor workflow</Text><Text style={styles.modalTitle}>Generate schedule</Text></View><TouchableOpacity accessibilityRole="button" style={styles.closeButton} onPress={onClose}><Ionicons color={colors.textPrimary} name="close" size={26} /></TouchableOpacity></View><FormScrollView contentContainerStyle={styles.modalContent}><Text style={styles.formSectionTitle}>Assignment</Text><Text style={styles.selectorLabel}>Therapist *</Text><View style={styles.chipList}>{therapists.map((therapist) => { const selected = form.therapist_id === String(therapist.id); return <TouchableOpacity accessibilityRole="button" key={therapist.id} style={[styles.chip, selected && styles.selectedChip]} onPress={() => onChange((current) => ({ ...current, therapist_id: String(therapist.id) }))}><Text style={[styles.chipText, selected && styles.selectedChipText]}>{therapist.username}</Text></TouchableOpacity>; })}</View>{selectedTherapist ? <Text style={styles.selectionHint}>Selected therapist: {selectedTherapist}</Text> : null}<Text style={styles.formSectionTitle}>Schedule</Text><Text style={styles.selectorLabel}>Date input</Text><DoctorChoiceChips onChange={(value) => onChange((current) => ({ ...current, date_mode: value }))} options={[{ label: "Treatment date", value: "treatment_date" }, { label: "Start date", value: "start_date" }]} value={form.date_mode as "start_date" | "treatment_date"} /><AppDatePickerField label="First session date" required value={form.session_date} onChange={(value) => onChange((current) => ({ ...current, session_date: value }))} /><DoctorField keyboardType="number-pad" label="Sessions" required value={form.number_of_sessions} onChangeText={(value) => onChange((current) => ({ ...current, number_of_sessions: value }))} /><DoctorField label="In time" placeholder="HH:MM" required value={form.in_time} onChangeText={(value) => onChange((current) => ({ ...current, in_time: value }))} /><DoctorField label="Out time" placeholder="HH:MM" required value={form.out_time} onChangeText={(value) => onChange((current) => ({ ...current, out_time: value }))} /><Text style={styles.selectorLabel}>Priority</Text><DoctorChoiceChips onChange={(value) => onChange((current) => ({ ...current, priority: value }))} options={priorityOptions.map((value) => ({ label: value, value }))} value={form.priority as "high" | "normal"} /><DoctorField label="Instructions" multiline required value={form.instructions} onChangeText={(value) => onChange((current) => ({ ...current, instructions: value }))} /><ActionPanel busy={saving} error={error} primaryLabel="Generate" onCancel={onClose} onSubmit={onSubmit} /></FormScrollView></SafeAreaView></Modal>;
}

function ActionPanel({ busy, destructive = false, error, onCancel, onSubmit, primaryLabel }: { busy: boolean; destructive?: boolean; error: string | null; onCancel: () => void; onSubmit: () => void; primaryLabel: string }) { return <View style={styles.panelActionsContainer}>{error ? <Text style={styles.formError}>{error}</Text> : null}<View style={styles.panelActions}><TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={onCancel}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={busy} style={[styles.submitButton, destructive && styles.destructiveButton, busy && styles.disabled]} onPress={onSubmit}>{busy ? <ActivityIndicator color={colors.surface} size="small" /> : null}<Text style={styles.submitText}>{busy ? "Saving..." : primaryLabel}</Text></TouchableOpacity></View></View>; }

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, content: { padding: spacing.xl, paddingBottom: spacing.sectionLg }, heroCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, flexDirection: "row", gap: spacing.lg, marginBottom: spacing.lg, padding: spacing.xl, ...cardShadow() }, heroIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 54, justifyContent: "center", width: 54 }, heroCopy: { flex: 1 }, heroName: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold }, heroSubtitle: { color: colors.textMuted, fontSize: typography.size.smallLarge, marginTop: spacing.xs }, detailCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, marginBottom: spacing.lg, paddingHorizontal: spacing.xl, ...cardShadow() }, progressBlock: { gap: spacing.sm, paddingBottom: spacing.xl, paddingTop: spacing.lg }, progressLabelRow: { flexDirection: "row", justifyContent: "space-between" }, progressLabel: { color: colors.textMuted, fontSize: typography.size.small, fontWeight: typography.weight.bold }, progressValue: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold }, actionsCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.xl, ...cardShadow() }, actionsTitle: { color: colors.textPrimary, fontSize: typography.size.body, fontWeight: typography.weight.extrabold }, actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }, actionButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50, paddingHorizontal: spacing.lg }, fullWidthAction: { marginTop: spacing.lg }, actionText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, destructiveAction: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorderStrong, borderWidth: 1 }, destructiveText: { color: colors.danger }, notice: { alignItems: "center", backgroundColor: colors.tealSurface, borderRadius: radius.control, flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.lg }, noticeText: { color: colors.teal, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, disabled: { opacity: 0.55 }, timelineRow: { flexDirection: "row", minHeight: 66, paddingTop: spacing.lg }, timelineIcon: { alignItems: "center", width: 30 }, timelineLine: { backgroundColor: colors.border, flex: 1, marginTop: spacing.xs, width: 1 }, timelineCopy: { flex: 1, paddingLeft: spacing.md }, timelineLabel: { color: colors.textStrong, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, timelineTime: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.xs }, modalSafe: { backgroundColor: colors.background, flex: 1 }, modalHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }, modalEyebrow: { color: colors.primary, fontSize: typography.size.captionLarge, fontWeight: typography.weight.extrabold, textTransform: "uppercase" }, modalTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold, marginTop: spacing.xs }, closeButton: { alignItems: "center", height: 48, justifyContent: "center", width: 48 }, modalContent: { padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 64 : spacing.xl }, formSectionTitle: { color: colors.primary, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold, marginBottom: spacing.lg, marginTop: spacing.sm, textTransform: "uppercase" }, selectorLabel: { color: colors.textMutedDark, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, marginBottom: spacing.sm, marginTop: spacing.md, textTransform: "uppercase" }, chipList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg }, chip: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, selectedChip: { backgroundColor: colors.primarySurface, borderColor: colors.primary }, chipText: { color: colors.textMutedDark, fontSize: typography.size.smallLarge, fontWeight: typography.weight.bold }, selectedChipText: { color: colors.primary }, selectionHint: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.bold, marginBottom: spacing.lg }, panelActionsContainer: { marginTop: spacing.md, paddingBottom: spacing.lg }, panelActions: { flexDirection: "row", gap: spacing.md }, secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48 }, secondaryText: { color: colors.textMutedDark, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, submitButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 48 }, destructiveButton: { backgroundColor: colors.danger }, submitText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, formError: { color: colors.danger, fontSize: typography.size.smallLarge, marginBottom: spacing.md }, overlay: { backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "flex-end" }, sheetContent: { flexGrow: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 42 : spacing.xl }, sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xl },
});

function cardShadow() { return { elevation: shadows.elevation.card, shadowColor: shadows.color, shadowOffset: shadows.offset.y2, shadowOpacity: shadows.opacity.card, shadowRadius: shadows.radius.card }; }
