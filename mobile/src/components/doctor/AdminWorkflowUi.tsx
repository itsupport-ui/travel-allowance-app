import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export const WorkflowSearchBar = memo(function WorkflowSearchBar({
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
}: {
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.searchBar}>
      <Ionicons color={colors.textMuted} name="search-outline" size={20} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
      />
      {value ? (
        <TouchableOpacity
          accessibilityLabel={`Clear ${accessibilityLabel.toLowerCase()}`}
          accessibilityRole="button"
          style={styles.clearButton}
          onPress={() => onChangeText("")}
        >
          <Ionicons color={colors.textMuted} name="close-circle" size={19} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export function WorkflowSkeletonCard({ variant = "standard" }: { variant?: "standard" | "claim" }) {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeleton, styles.skeletonIcon]} />
        <View style={styles.skeletonCopy}>
          <View style={[styles.skeleton, styles.skeletonTitle]} />
          <View style={[styles.skeleton, styles.skeletonSubtitle]} />
        </View>
        <View style={[styles.skeleton, styles.skeletonBadge]} />
      </View>
      <View style={styles.skeletonGrid}>
        <View style={[styles.skeleton, styles.skeletonMeta]} />
        <View style={[styles.skeleton, styles.skeletonMeta]} />
        <View style={[styles.skeleton, styles.skeletonMeta, variant === "claim" && styles.skeletonWide]} />
      </View>
      <View style={[styles.skeleton, styles.skeletonFooter]} />
    </View>
  );
}

export function WorkflowEmptyState({
  description,
  icon,
  onCreate,
  title,
}: {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onCreate?: () => void;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons color={colors.primary} name={icon} size={30} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {onCreate ? (
        <TouchableOpacity accessibilityRole="button" style={styles.emptyButton} onPress={onCreate}>
          <Ionicons color={colors.surface} name="add" size={18} />
          <Text style={styles.emptyButtonText}>Create</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const boundedProgress = Math.max(0, Math.min(1, progress));
  return (
    <View accessibilityLabel={`${Math.round(boundedProgress * 100)} percent complete`} accessibilityRole="progressbar" style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${boundedProgress * 100}%` }]} />
    </View>
  );
}

export function WorkflowSectionHeader({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons color={colors.primary} name={icon} size={19} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.inputBorder, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg },
  searchInput: { color: colors.textPrimary, flex: 1, fontSize: typography.size.bodySmall, minHeight: 48 },
  clearButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  skeletonCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, elevation: shadows.elevation.card, marginBottom: spacing.lgPlus, padding: spacing.xl, shadowColor: shadows.color, shadowOffset: shadows.offset.y2, shadowOpacity: shadows.opacity.card, shadowRadius: shadows.radius.card },
  skeletonHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeleton: { backgroundColor: colors.neutral150, borderRadius: radius.sm },
  skeletonIcon: { borderRadius: radius.control, height: 46, width: 46 },
  skeletonTitle: { height: 18, width: "70%" },
  skeletonSubtitle: { height: 13, width: "45%" },
  skeletonBadge: { height: 28, width: 76 },
  skeletonGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  skeletonMeta: { flex: 1, height: 38 },
  skeletonWide: { flex: 1.35 },
  skeletonFooter: { height: 30, marginTop: spacing.xl, width: "80%" },
  emptyState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, marginTop: spacing.sm, padding: spacing.section },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 60, justifyContent: "center", marginBottom: spacing.lg, width: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold },
  emptyDescription: { color: colors.textMuted, fontSize: typography.size.bodySmall, marginTop: spacing.sm, textAlign: "center" },
  emptyButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, minHeight: 48, paddingHorizontal: spacing.xl },
  emptyButtonText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  progressTrack: { backgroundColor: colors.neutral150, borderRadius: radius.pill, height: 8, overflow: "hidden", width: "100%" },
  progressFill: { backgroundColor: colors.primary, borderRadius: radius.pill, height: "100%" },
  sectionHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.lg },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 36, justifyContent: "center", width: 36 },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.size.body, fontWeight: typography.weight.extrabold },
});
