import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { AdminDoctorClaim } from "../../types/doctorWorkflow";
import { formatDoctorCurrency, formatDoctorDate, formatDoctorLabel } from "../../utils/doctorWorkflow";
import { DoctorStatusBadge } from "./DoctorWorkflowUi";

export const AdminDoctorClaimCard = memo(function AdminDoctorClaimCard({
  claim,
  onPress,
}: {
  claim: AdminDoctorClaim;
  onPress: (claim: AdminDoctorClaim) => void;
}) {
  return (
    <TouchableOpacity
      accessibilityHint="View claim details and available actions"
      accessibilityLabel={`Open doctor claim ${claim.id}`}
      accessibilityRole="button"
      activeOpacity={0.86}
      style={styles.card}
      onPress={() => onPress(claim)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.claimIcon}><Ionicons color={colors.primary} name="receipt-outline" size={22} /></View>
        <View style={styles.titleBlock}>
          <Text style={styles.claimNumber}>Claim #{claim.id}</Text>
          <Text numberOfLines={1} style={styles.doctorName}>{claim.doctor_name}</Text>
        </View>
        <DoctorStatusBadge status={claim.status} />
      </View>
      <View style={styles.infoGrid}>
        <InfoItem icon="person-circle-outline" label="Doctor" value={claim.doctor_name} />
        <InfoItem icon="calendar-outline" label="Claim date" value={formatDoctorDate(claim.claim_date)} />
        <InfoItem icon="cash-outline" label="Total" value={formatDoctorCurrency(claim.total_amount)} />
      </View>
      <View style={styles.footer}>
        <View style={styles.footerMetric}><Text style={styles.footerValue}>{claim.expense_count}</Text><Text style={styles.footerLabel}>Expenses</Text></View>
        <View style={styles.approvalStatus}><Ionicons color={statusColor(claim.status)} name="checkmark-circle-outline" size={17} /><Text style={[styles.approvalText, { color: statusColor(claim.status) }]}>{claim.status === "pending" ? "Awaiting review" : formatDoctorLabel(claim.status)}</Text></View>
        <Ionicons color={colors.textSubtle} name="chevron-forward" size={18} />
      </View>
    </TouchableOpacity>
  );
});

function InfoItem({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.infoItem}><View style={styles.infoLabelRow}><Ionicons color={colors.textMuted} name={icon} size={15} /><Text style={styles.infoLabel}>{label}</Text></View><Text numberOfLines={1} style={styles.infoValue}>{value}</Text></View>;
}

function statusColor(status: string): string {
  if (status === "approved") return colors.green;
  if (status === "rejected") return colors.danger;
  if (status === "submitted") return colors.purple;
  if (status === "paid") return colors.teal;
  return colors.warning;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, elevation: shadows.elevation.card, marginBottom: spacing.lgPlus, padding: spacing.xl, shadowColor: shadows.color, shadowOffset: shadows.offset.y2, shadowOpacity: shadows.opacity.card, shadowRadius: shadows.radius.card },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  claimIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 46, justifyContent: "center", width: 46 },
  titleBlock: { flex: 1 },
  claimNumber: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold },
  doctorName: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.xs },
  infoGrid: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, paddingVertical: spacing.lg },
  infoItem: { flex: 1, minWidth: 0 },
  infoLabelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  infoLabel: { color: colors.textMuted, fontSize: typography.size.captionLarge, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  infoValue: { color: colors.textStrong, fontSize: typography.size.smallLarge, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  footer: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  footerMetric: { alignItems: "flex-start" },
  footerValue: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold },
  footerLabel: { color: colors.textMuted, fontSize: typography.size.captionLarge, marginTop: spacing.xs, textTransform: "uppercase" },
  approvalStatus: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  approvalText: { fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
});
