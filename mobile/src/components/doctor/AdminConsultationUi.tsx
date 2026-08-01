import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { DoctorConsultation } from "../../types/doctorWorkflow";
import { formatDoctorDate, formatDoctorLabel } from "../../utils/doctorWorkflow";

const visitIdFor = (consultation: DoctorConsultation): number | null =>
  consultation.visit_id ?? consultation.doctor_visit_id ?? null;

const hasVisit = (consultation: DoctorConsultation): boolean =>
  Boolean(consultation.has_visit) || visitIdFor(consultation) !== null;

export const AdminConsultationCard = memo(function AdminConsultationCard({
  consultation,
  doctorName,
  onPress,
}: {
  consultation: DoctorConsultation;
  doctorName: string;
  onPress: (consultation: DoctorConsultation) => void;
}) {
  const converted = hasVisit(consultation);

  return (
    <TouchableOpacity
      accessibilityLabel={`Open consultation for ${consultation.patient_name}`}
      accessibilityRole="button"
      accessibilityHint="View consultation details and available actions"
      activeOpacity={0.86}
      style={styles.card}
      onPress={() => onPress(consultation)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.patientIcon}>
          <Ionicons color={colors.primary} name="person-outline" size={22} />
        </View>
        <View style={styles.patientBlock}>
          <Text numberOfLines={1} style={styles.patientName}>
            {consultation.patient_name}
          </Text>
          <Text numberOfLines={1} style={styles.patientPhone}>
            {consultation.patient_phone || "Phone not available"}
          </Text>
        </View>
        <StatusBadge status={consultation.status} />
      </View>

      <View style={styles.infoGrid}>
        <InfoItem icon="person-circle-outline" label="Doctor" value={doctorName} />
        <InfoItem
          icon="calendar-outline"
          label="Scheduled"
          value={formatDoctorDate(consultation.scheduled_date)}
        />
        <InfoItem
          icon="time-outline"
          label="Time"
          value={consultation.scheduled_time.slice(0, 5)}
        />
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerStatus}>
          <Text style={styles.footerLabel}>Patient decision</Text>
          <StatusBadge status={consultation.patient_decision} />
        </View>
        <View style={styles.visitIndicator}>
          <Ionicons
            color={converted ? colors.teal : colors.warning}
            name={converted ? "checkmark-circle" : "time-outline"}
            size={17}
          />
          <Text style={[styles.visitText, converted && styles.visitTextCreated]}>
            {converted
              ? `Visit created${visitIdFor(consultation) ? ` #${visitIdFor(consultation)}` : ""}`
              : "Pending visit"}
          </Text>
        </View>
      </View>

      <View style={styles.cardChevron}>
        <Ionicons color={colors.textSubtle} name="chevron-forward" size={18} />
      </View>
    </TouchableOpacity>
  );
});

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoLabelRow}>
        <Ionicons color={colors.textMuted} name={icon} size={15} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = status?.trim().toLowerCase() || "unknown";
  const tone = getStatusTone(normalized);

  return (
    <View style={[styles.badge, styles[`${tone}Badge`]]}>
      <Text style={[styles.badgeText, styles[`${tone}Text`]]}>
        {formatDoctorLabel(normalized)}
      </Text>
    </View>
  );
}

export const ConsultationSearchBar = memo(function ConsultationSearchBar({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.searchBar}>
      <Ionicons color={colors.textMuted} name="search-outline" size={20} />
      <TextInput
        accessibilityLabel="Search consultations"
        autoCapitalize="none"
        clearButtonMode="while-editing"
        placeholder="Search patient, phone, doctor, or purpose"
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
      />
      {value ? (
        <TouchableOpacity
          accessibilityLabel="Clear consultation search"
          accessibilityRole="button"
          style={styles.clearSearchButton}
          onPress={() => onChangeText("")}
        >
          <Ionicons color={colors.textMuted} name="close-circle" size={19} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export function ConsultationSkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeleton, styles.skeletonIcon]} />
        <View style={styles.skeletonTextBlock}>
          <View style={[styles.skeleton, styles.skeletonName]} />
          <View style={[styles.skeleton, styles.skeletonPhone]} />
        </View>
        <View style={[styles.skeleton, styles.skeletonBadge]} />
      </View>
      <View style={styles.skeletonGrid}>
        <View style={[styles.skeleton, styles.skeletonMeta]} />
        <View style={[styles.skeleton, styles.skeletonMeta]} />
        <View style={[styles.skeleton, styles.skeletonMeta]} />
      </View>
      <View style={[styles.skeleton, styles.skeletonFooter]} />
    </View>
  );
}

export function ConsultationEmptyState({
  description,
  onCreate,
  searchActive,
}: {
  description: string;
  onCreate: () => void;
  searchActive: boolean;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons color={colors.primary} name="clipboard-outline" size={30} />
      </View>
      <Text style={styles.emptyTitle}>No consultations found</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {!searchActive ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.emptyButton}
          onPress={onCreate}
        >
          <Ionicons color={colors.surface} name="add" size={18} />
          <Text style={styles.emptyButtonText}>Create Consultation</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function getStatusTone(
  status: string
): "danger" | "info" | "neutral" | "success" | "teal" | "warning" {
  if (["approved", "completed", "confirmed", "visited"].includes(status)) {
    return "success";
  }
  if (status === "cancelled" || status === "rejected") return "danger";
  if (status === "scheduled" || status === "submitted") return "info";
  if (status === "follow_up") return "teal";
  if (status === "draft" || status === "pending") return "warning";
  return "neutral";
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.card,
    borderWidth: 1,
    elevation: shadows.elevation.card,
    marginBottom: spacing.lgPlus,
    padding: spacing.xl,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  patientIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  patientBlock: { flex: 1 },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  patientPhone: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  infoGrid: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
  },
  infoItem: { flex: 1, minWidth: 0 },
  infoLabelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  infoLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  infoValue: {
    color: colors.textStrong,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingRight: spacing.xl,
  },
  footerStatus: { alignItems: "flex-start", gap: spacing.xs },
  footerLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  visitIndicator: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  visitText: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  visitTextCreated: { color: colors.teal },
  cardChevron: { position: "absolute", right: spacing.md, top: spacing.xl },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  badgeText: {
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  successBadge: { backgroundColor: colors.greenSurface },
  successText: { color: colors.primaryDark },
  dangerBadge: { backgroundColor: colors.dangerSurfaceStrong },
  dangerText: { color: colors.danger },
  infoBadge: { backgroundColor: colors.blueSurface },
  infoText: { color: colors.blueDark },
  tealBadge: { backgroundColor: colors.tealSurface },
  tealText: { color: colors.teal },
  warningBadge: { backgroundColor: colors.warningSurface },
  warningText: { color: colors.warningDark },
  neutralBadge: { backgroundColor: colors.neutral100 },
  neutralText: { color: colors.textMutedDark },
  searchBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    minHeight: 48,
  },
  clearSearchButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  skeletonHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  skeletonTextBlock: { flex: 1, gap: spacing.sm },
  skeleton: { backgroundColor: colors.neutral150, borderRadius: radius.sm },
  skeletonIcon: { borderRadius: radius.control, height: 46, width: 46 },
  skeletonName: { height: 18, width: "72%" },
  skeletonPhone: { height: 13, width: "45%" },
  skeletonBadge: { height: 28, width: 76 },
  skeletonGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  skeletonMeta: { flex: 1, height: 38 },
  skeletonFooter: { height: 30, marginTop: spacing.xl, width: "80%" },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.section,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 60,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 60,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold },
  emptyDescription: { color: colors.textMuted, fontSize: typography.size.bodySmall, marginTop: spacing.sm, textAlign: "center" },
  emptyButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  emptyButtonText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
});
