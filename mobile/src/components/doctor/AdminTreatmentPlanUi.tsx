import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";

import { DoctorStatusBadge } from "./DoctorWorkflowUi";
import type { TreatmentPlan } from "../../types/doctorWorkflow";
import { formatDoctorDate } from "../../utils/doctorWorkflow";
import { ProgressBar } from "./AdminWorkflowUi";

export const AdminTreatmentPlanCard = memo(function AdminTreatmentPlanCard({
  generated,
  onPress,
  plan,
}: {
  generated: boolean;
  onPress: (plan: TreatmentPlan) => void;
  plan: TreatmentPlan;
}) {
  const totalSessions = plan.sessions_required ?? 0;
  const scheduledSessions = plan.schedule_count ?? 0;
  const progress = totalSessions > 0 ? Math.min(scheduledSessions / totalSessions, 1) : 0;

  return (
    <TouchableOpacity
      accessibilityHint="View treatment plan details and available actions"
      accessibilityLabel={`Open treatment plan for ${plan.patient_name}`}
      accessibilityRole="button"
      activeOpacity={0.86}
      style={styles.card}
      onPress={() => onPress(plan)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.patientIcon}>
          <Ionicons color={colors.primary} name="person-outline" size={22} />
        </View>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.patientName}>{plan.patient_name}</Text>
          <Text numberOfLines={1} style={styles.doctorName}>
            {plan.doctor_name ?? `Doctor #${plan.doctor_id}`}
          </Text>
        </View>
        <DoctorStatusBadge status={plan.status} />
      </View>

      <View style={styles.infoGrid}>
        <InfoItem icon="person-circle-outline" label="Doctor" value={plan.doctor_name ?? `#${plan.doctor_id}`} />
        <InfoItem icon="people-outline" label="Therapist" value={generated ? "Assigned" : "Not assigned"} />
        <InfoItem icon="calendar-outline" label="Created" value={formatDoctorDate(plan.created_at)} />
      </View>

      <View style={styles.footer}>
        <View style={styles.sessionSummary}>
          <SessionMetric label="Total" value={totalSessions ? String(totalSessions) : "-"} />
          <SessionMetric label="Scheduled" value={scheduledSessions ? String(scheduledSessions) : "-"} />
          <SessionMetric label="Remaining" value={totalSessions ? String(Math.max(totalSessions - scheduledSessions, 0)) : "-"} />
        </View>
        <Ionicons color={colors.textSubtle} name="chevron-forward" size={18} />
      </View>
      {generated ? (
        <View style={styles.progressRow}>
          <ProgressBar progress={progress} />
          <Text style={styles.progressText}>{scheduledSessions} schedule{scheduledSessions === 1 ? "" : "s"} generated</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

function InfoItem({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoLabelRow}><Ionicons color={colors.textMuted} name={icon} size={15} /><Text style={styles.infoLabel}>{label}</Text></View>
      <Text numberOfLines={1} style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SessionMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, elevation: shadows.elevation.card, marginBottom: spacing.lgPlus, padding: spacing.xl, shadowColor: shadows.color, shadowOffset: shadows.offset.y2, shadowOpacity: shadows.opacity.card, shadowRadius: shadows.radius.card },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  patientIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 46, justifyContent: "center", width: 46 },
  titleBlock: { flex: 1 },
  patientName: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold },
  doctorName: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.xs },
  infoGrid: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, paddingVertical: spacing.lg },
  infoItem: { flex: 1, minWidth: 0 },
  infoLabelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  infoLabel: { color: colors.textMuted, fontSize: typography.size.captionLarge, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  infoValue: { color: colors.textStrong, fontSize: typography.size.smallLarge, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  footer: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  sessionSummary: { flexDirection: "row", gap: spacing.xxl },
  metric: { minWidth: 46 },
  metricValue: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold },
  metricLabel: { color: colors.textMuted, fontSize: typography.size.captionLarge, marginTop: spacing.xs, textTransform: "uppercase" },
  progressRow: { gap: spacing.sm, marginTop: spacing.lg },
  progressText: { color: colors.teal, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
});
