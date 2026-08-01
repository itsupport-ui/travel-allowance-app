import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import { StatusBadge } from "../../src/components/doctor/AdminConsultationUi";
import {
  DoctorBackHeader,
  DoctorDetailRow,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  confirmDoctorConsultation,
  createVisitFromConsultation,
  getConsultationDoctors,
  getDoctorConsultation,
  getDoctorVisit,
  rejectDoctorConsultation,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { DoctorConsultation } from "../../src/types/doctorWorkflow";
import {
  formatDoctorDate,
  formatDoctorDateTime,
  getLocalIsoDate,
  nullableDoctorText,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

type Panel = "reject" | "visit" | null;

const actionablePatientDecisions = new Set(["pending", "follow_up"]);

const isIsoDate = (value: string): boolean =>
  !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

const isTime = (value: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

type TimelineEvent = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  timestamp: string | null;
  tone: string;
};

export default function AdminDoctorConsultationDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const queryClient = useQueryClient();
  const consultationId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const [panel, setPanel] = useState<Panel>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [visitForm, setVisitForm] = useState({
    remarks: "",
    visit_date: getLocalIsoDate(),
    visit_time: "",
  });

  const consultationQuery = useQuery({
    enabled: consultationId !== null,
    queryFn: () => {
      if (consultationId === null) throw new Error("A valid consultation ID is required.");
      return getDoctorConsultation(consultationId);
    },
    queryKey:
      consultationId === null
        ? ["admin", "doctor-workflow", "consultation", "invalid"]
        : ["admin", "doctor-workflow", "consultation", consultationId],
  });

  const consultation = consultationQuery.data;
  const doctorsQuery = useQuery({
    queryFn: getConsultationDoctors,
    queryKey: queryKeys.adminDoctorWorkflow.doctors,
  });
  const doctorName = doctorsQuery.data?.find(
    (doctor) => doctor.id === consultation?.doctor_id
  )?.name ?? (consultation ? `Doctor #${consultation.doctor_id}` : "Not available");
  const visitId = consultation?.visit_id ?? consultation?.doctor_visit_id ?? null;
  const visitQuery = useQuery({
    enabled: visitId !== null,
    queryFn: () => {
      if (visitId === null) throw new Error("A valid doctor visit ID is required.");
      return getDoctorVisit(visitId);
    },
    queryKey: visitId === null ? ["admin", "doctor-visit", "invalid"] : ["admin", "doctor-visit", visitId],
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.adminDoctorWorkflow.consultations,
    });
    await consultationQuery.refetch();
  };

  const confirmMutation = useMutation({
    mutationFn: confirmDoctorConsultation,
    onError: (error) =>
      Alert.alert("Unable to Confirm", getApiErrorMessage(error, "Unable to confirm this consultation.")),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Consultation Confirmed", "Patient decision was confirmed.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!consultation) throw new Error("Consultation is unavailable.");
      return rejectDoctorConsultation(consultation.id, rejectionReason.trim());
    },
    onError: (error) =>
      Alert.alert("Unable to Reject", getApiErrorMessage(error, "Unable to reject this consultation.")),
    onSuccess: async () => {
      await invalidate();
      setPanel(null);
      setRejectionReason("");
      Alert.alert("Consultation Rejected", "Rejection reason was saved.");
    },
  });

  const createVisitMutation = useMutation({
    mutationFn: async () => {
      if (!consultation) throw new Error("Consultation is unavailable.");
      return createVisitFromConsultation(consultation.id, {
        remarks: nullableDoctorText(visitForm.remarks),
        visit_date: visitForm.visit_date.trim(),
        visit_time: visitForm.visit_time.trim(),
      });
    },
    onError: (error) =>
      Alert.alert("Unable to Create Visit", getApiErrorMessage(error, "Unable to create a visit from this consultation.")),
    onSuccess: async (visit) => {
      await invalidate();
      setPanel(null);
      setVisitForm({ remarks: "", visit_date: getLocalIsoDate(), visit_time: "" });
      Alert.alert("Visit Created", `Doctor visit #${visit.id} was created.`);
    },
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(admin)/doctor-workflow-consultations");
  };

  const openReject = () => {
    setFormError(null);
    setRejectionReason("");
    setPanel("reject");
  };

  const openVisit = () => {
    if (!consultation || isConsultationConverted(consultation)) {
      Alert.alert("Visit already created", "This consultation has already been converted to a doctor visit.");
      return;
    }
    setFormError(null);
    setVisitForm({ remarks: "", visit_date: getLocalIsoDate(), visit_time: "" });
    setPanel("visit");
  };

  const confirmConsultation = () => {
    if (!consultation) return;
    Alert.alert(
      "Confirm Consultation?",
      `Confirm the patient decision for ${consultation.patient_name}?`,
      [
        { style: "cancel", text: "Cancel" },
        { onPress: () => confirmMutation.mutate(consultation.id), text: "Confirm" },
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

  const submitVisit = () => {
    if (!visitForm.visit_date.trim() || !visitForm.visit_time.trim()) {
      setFormError("Visit date and time are required.");
      return;
    }
    if (!isIsoDate(visitForm.visit_date)) {
      setFormError("Select a valid visit date.");
      return;
    }
    if (visitForm.visit_date < getLocalIsoDate()) {
      setFormError("Visit date cannot be in the past.");
      return;
    }
    if (!isTime(visitForm.visit_time)) {
      setFormError("Visit time must use HH:MM 24-hour format.");
      return;
    }
    setFormError(null);
    createVisitMutation.mutate();
  };

  if (consultationQuery.isPending && !consultationQuery.data) {
    return <DoctorLoadingState label="Loading consultation details..." />;
  }

  if (consultationId === null) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Consultation Details" />
        <DoctorErrorState message="A valid consultation ID is required." onRetry={goBack} title="Invalid consultation" />
      </SafeAreaView>
    );
  }

  if (consultationQuery.error && !consultation) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Consultation Details" />
        <DoctorErrorState
          message={getApiErrorMessage(consultationQuery.error, "Unable to load consultation details.")}
          onRetry={() => void consultationQuery.refetch()}
          title="Consultation unavailable"
        />
      </SafeAreaView>
    );
  }

  if (!consultation) return null;

  const converted = isConsultationConverted(consultation);
  const canUpdateDecision =
    consultation.status === "completed" &&
    !converted &&
    actionablePatientDecisions.has(consultation.patient_decision);
  const canCreateVisit = consultation.patient_decision === "confirmed" && !converted;
  const busy = confirmMutation.isPending || rejectMutation.isPending || createVisitMutation.isPending;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Consultation Details" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={consultationQuery.isRefetching || visitQuery.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void Promise.all([consultationQuery.refetch(), visitQuery.refetch()])}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.primary} name="person-outline" size={28} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroName}>{consultation.patient_name}</Text>
            <Text style={styles.heroPhone}>{consultation.patient_phone || "Phone not available"}</Text>
          </View>
          <StatusBadge status={consultation.status} />
        </View>

        <DetailSection icon="person-outline" title="Patient information">
          <DoctorDetailRow label="Patient name" value={consultation.patient_name} />
          <DoctorDetailRow label="Phone number" value={consultation.patient_phone || "Not available"} />
          <DoctorDetailRow label="Address" value={consultation.patient_address || "Not available"} />
        </DetailSection>

        <DetailSection icon="clipboard-outline" title="Consultation information">
          <DoctorDetailRow label="Assigned doctor" value={doctorName} />
          <DoctorDetailRow label="Purpose" value={consultation.purpose} />
          <DoctorDetailRow label="Notes" value={consultation.notes || "Not available"} />
          <DoctorDetailRow label="Scheduled date" value={formatDoctorDate(consultation.scheduled_date)} />
          <DoctorDetailRow label="Scheduled time" value={consultation.scheduled_time.slice(0, 5)} />
          <DoctorDetailRow label="Status" value={<StatusBadge status={consultation.status} />} />
          <DoctorDetailRow label="Patient decision" value={<StatusBadge status={consultation.patient_decision} />} />
          <DoctorDetailRow label="Created date" value={formatDoctorDateTime(consultation.created_at)} />
          {consultation.rejection_reason ? <DoctorDetailRow label="Rejection reason" value={consultation.rejection_reason} /> : null}
        </DetailSection>

        <DetailSection icon="medkit-outline" title="Visit information">
          {visitQuery.isPending ? (
            <Text style={styles.mutedText}>Loading visit details...</Text>
          ) : visitQuery.data ? (
            <>
              <DoctorDetailRow label="Visit ID" value={`#${visitQuery.data.id}`} />
              <DoctorDetailRow label="Visit date" value={formatDoctorDate(visitQuery.data.visit_date)} />
              <DoctorDetailRow label="Visit time" value={visitQuery.data.visit_time.slice(0, 5)} />
              <DoctorDetailRow label="Remarks" value={visitQuery.data.remarks || "Not available"} />
              <DoctorDetailRow label="Status" value={<StatusBadge status={visitQuery.data.status} />} />
            </>
          ) : converted ? (
            <Text style={styles.mutedText}>Visit #{visitId} was created, but its details are unavailable.</Text>
          ) : (
            <View style={styles.noVisitState}>
              <Ionicons color={colors.textSubtle} name="time-outline" size={22} />
              <Text style={styles.mutedText}>No doctor visit has been created.</Text>
            </View>
          )}
        </DetailSection>

        <TimelineCard consultation={consultation} visitCreated={converted} visitCreatedAt={visitQuery.data?.created_at ?? null} />

        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Available actions</Text>
          {canUpdateDecision ? (
            <View style={styles.actionRow}>
              <ActionButton disabled={busy} destructive icon="close-circle-outline" label="Reject" onPress={openReject} />
              <ActionButton disabled={busy} icon="checkmark-circle-outline" label="Confirm" onPress={confirmConsultation} />
            </View>
          ) : null}
          {canCreateVisit ? (
            <ActionButton disabled={busy} fullWidth icon="add-circle-outline" label="Create Visit Form" onPress={openVisit} />
          ) : null}
          {converted ? (
            <View style={styles.actionNotice}>
              <Ionicons color={colors.teal} name="checkmark-circle" size={20} />
              <Text style={styles.actionNoticeText}>Visit already created</Text>
            </View>
          ) : null}
          {!canUpdateDecision && !canCreateVisit && !converted ? (
            <Text style={styles.mutedText}>No actions are available for this consultation state.</Text>
          ) : null}
        </View>
      </ScrollView>

      <RejectModal
        error={formError}
        reason={rejectionReason}
        saving={rejectMutation.isPending}
        visible={panel === "reject"}
        onChange={setRejectionReason}
        onClose={() => setPanel(null)}
        onSubmit={submitReject}
      />
      <VisitModal
        error={formError}
        form={visitForm}
        patientName={consultation.patient_name}
        saving={createVisitMutation.isPending}
        visible={panel === "visit"}
        onChange={setVisitForm}
        onClose={() => setPanel(null)}
        onSubmit={submitVisit}
      />
    </SafeAreaView>
  );
}

function isConsultationConverted(consultation: DoctorConsultation): boolean {
  const visitId = consultation.visit_id ?? consultation.doctor_visit_id;
  return Boolean(consultation.has_visit || visitId);
}

function DetailSection({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons color={colors.primary} name={icon} size={19} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function TimelineCard({
  consultation,
  visitCreated,
  visitCreatedAt,
}: {
  consultation: DoctorConsultation;
  visitCreated: boolean;
  visitCreatedAt: string | null;
}) {
  const events: TimelineEvent[] = [
    { icon: "add-circle-outline", label: "Consultation created", timestamp: consultation.created_at, tone: "primary" },
    { icon: "calendar-outline", label: "Consultation scheduled", timestamp: `${consultation.scheduled_date}T${consultation.scheduled_time}`, tone: "blue" },
  ];
  if (consultation.patient_decision === "confirmed") {
    events.push({ icon: "checkmark-circle-outline", label: "Patient confirmed", timestamp: consultation.completed_at, tone: "success" });
  }
  if (visitCreated) {
    events.push({ icon: "medkit-outline", label: "Doctor visit created", timestamp: visitCreatedAt, tone: "teal" });
  }
  if (consultation.status === "completed") {
    events.push({ icon: "checkmark-done-outline", label: "Consultation completed", timestamp: consultation.completed_at, tone: "success" });
  }

  return (
    <View style={styles.detailCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}><Ionicons color={colors.primary} name="time-outline" size={19} /></View>
        <Text style={styles.sectionTitle}>Timeline</Text>
      </View>
      {events.map((event, index) => (
        <View key={`${event.label}-${index}`} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <Ionicons color={timelineColor(event.tone)} name={event.icon} size={18} />
            {index < events.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineCopy}>
            <Text style={styles.timelineLabel}>{event.label}</Text>
            <Text style={styles.timelineTime}>{formatDoctorDateTime(event.timestamp)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function timelineColor(tone: string): string {
  if (tone === "blue") return colors.blue;
  if (tone === "success") return colors.green;
  if (tone === "teal") return colors.teal;
  return colors.primary;
}

function ActionButton({
  destructive = false,
  disabled,
  fullWidth = false,
  icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  disabled: boolean;
  fullWidth?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.actionButton, destructive && styles.destructiveAction, fullWidth && styles.fullWidthAction, disabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Ionicons color={destructive ? colors.danger : colors.surface} name={icon} size={19} />
      <Text style={[styles.actionButtonText, destructive && styles.destructiveActionText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RejectModal({
  error,
  onChange,
  onClose,
  onSubmit,
  reason,
  saving,
  visible,
}: {
  error: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  reason: string;
  saving: boolean;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <FormScrollView contentContainerStyle={styles.bottomSheetContent}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>Reject consultation</Text>
              <TouchableOpacity accessibilityLabel="Close rejection form" accessibilityRole="button" onPress={onClose}>
                <Ionicons color={colors.textPrimary} name="close" size={24} />
              </TouchableOpacity>
            </View>
            <DoctorField label="Rejection reason" multiline required value={reason} onChangeText={onChange} />
            <ActionPanel busy={saving} destructive error={error} primaryLabel="Reject consultation" onCancel={onClose} onSubmit={onSubmit} />
          </View>
        </FormScrollView>
      </View>
    </Modal>
  );
}

function VisitModal({
  error,
  form,
  onChange,
  onClose,
  onSubmit,
  patientName,
  saving,
  visible,
}: {
  error: string | null;
  form: { remarks: string; visit_date: string; visit_time: string };
  onChange: React.Dispatch<React.SetStateAction<{ remarks: string; visit_date: string; visit_time: string }>>;
  onClose: () => void;
  onSubmit: () => void;
  patientName: string;
  saving: boolean;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalEyebrow}>Doctor workflow</Text>
            <Text style={styles.modalTitle}>Create doctor visit</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Close visit form" accessibilityRole="button" style={styles.closeButton} onPress={onClose}>
            <Ionicons color={colors.textPrimary} name="close" size={26} />
          </TouchableOpacity>
        </View>
        <FormScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.patientContext}>{patientName}</Text>
          <AppDatePickerField label="Visit date" required value={form.visit_date} onChange={(value) => onChange((current) => ({ ...current, visit_date: value }))} />
          <DoctorField label="Visit time" placeholder="HH:MM" required value={form.visit_time} onChangeText={(value) => onChange((current) => ({ ...current, visit_time: value }))} />
          <DoctorField label="Remarks" multiline value={form.remarks} onChangeText={(value) => onChange((current) => ({ ...current, remarks: value }))} />
          <ActionPanel busy={saving} error={error} primaryLabel="Create visit" onCancel={onClose} onSubmit={onSubmit} />
        </FormScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ActionPanel({
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
    <View style={styles.panelActionsContainer}>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.panelActions}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={[styles.submitButton, destructive && styles.destructiveButton, disabledStyle(busy)]} onPress={onSubmit}>
          {busy ? <ActivityIndicator color={colors.surface} size="small" /> : null}
          <Text style={styles.submitButtonText}>{busy ? "Saving..." : primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function disabledStyle(disabled: boolean) {
  return disabled ? styles.disabledButton : undefined;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  heroCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, flexDirection: "row", gap: spacing.lg, marginBottom: spacing.lg, padding: spacing.xl, ...cardShadow() },
  heroIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 54, justifyContent: "center", width: 54 },
  heroCopy: { flex: 1 },
  heroName: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold },
  heroPhone: { color: colors.textMuted, fontSize: typography.size.smallLarge, marginTop: spacing.xs },
  detailCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, marginBottom: spacing.lg, paddingHorizontal: spacing.xl, ...cardShadow() },
  sectionHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.lg },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 36, justifyContent: "center", width: 36 },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.size.body, fontWeight: typography.weight.extrabold },
  mutedText: { color: colors.textMuted, fontSize: typography.size.bodySmall, lineHeight: typography.lineHeight.bodyRelaxed },
  noVisitState: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xl },
  timelineRow: { flexDirection: "row", minHeight: 66, paddingTop: spacing.lg },
  timelineRail: { alignItems: "center", width: 30 },
  timelineLine: { backgroundColor: colors.border, flex: 1, marginTop: spacing.xs, width: 1 },
  timelineCopy: { flex: 1, paddingLeft: spacing.md },
  timelineLabel: { color: colors.textStrong, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  timelineTime: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.xs },
  actionsCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.xl, ...cardShadow() },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50, paddingHorizontal: spacing.lg },
  fullWidthAction: { marginTop: spacing.lg },
  destructiveAction: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorderStrong, borderWidth: 1 },
  actionButtonText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  destructiveActionText: { color: colors.danger },
  actionNotice: { alignItems: "center", backgroundColor: colors.tealSurface, borderRadius: radius.control, flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.lg },
  actionNoticeText: { color: colors.teal, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  disabledButton: { opacity: 0.55 },
  modalContainer: { backgroundColor: colors.background, flex: 1 },
  modalHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  modalEyebrow: { color: colors.primary, fontSize: typography.size.captionLarge, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  modalTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  closeButton: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  modalContent: { padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 64 : spacing.xl },
  patientContext: { color: colors.textMuted, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold, marginBottom: spacing.xl },
  modalOverlay: { backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "flex-end" },
  bottomSheetContent: { flexGrow: 1, justifyContent: "flex-end" },
  bottomSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 42 : spacing.xl },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xl },
  panelActionsContainer: { marginTop: spacing.md },
  panelActions: { flexDirection: "row", gap: spacing.md },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48 },
  secondaryButtonText: { color: colors.textMutedDark, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  submitButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 48 },
  destructiveButton: { backgroundColor: colors.danger },
  submitButtonText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  formError: { color: colors.danger, fontSize: typography.size.smallLarge, marginBottom: spacing.md },
});

function cardShadow() {
  return {
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  };
}
