import { colors, radius, spacing, typography } from "@/src/theme";
import { StyleSheet, Text, View } from "react-native";

interface ClaimStatusBadgeProps {
  status: string | null | undefined;
}

const normalizeStatus = (
  status: string | null | undefined
): string => (typeof status === "string" ? status.trim() : "");

const formatStatus = (
  status: string | null | undefined
): string => {
  const normalizedStatus = normalizeStatus(status);

  if (!normalizedStatus) {
    return "Unknown";
  }

  return normalizedStatus
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const normalizedStatus = normalizeStatus(status).toLowerCase();

  const badgeStyle =
    normalizedStatus === "approved"
      ? styles.approvedBadge
      : normalizedStatus === "rejected"
        ? styles.rejectedBadge
        : normalizedStatus === "under_review"
          ? styles.reviewBadge
        : normalizedStatus === "pending"
          ? styles.pendingBadge
          : styles.neutralBadge;

  const textStyle =
    normalizedStatus === "approved"
      ? styles.approvedText
      : normalizedStatus === "rejected"
        ? styles.rejectedText
        : normalizedStatus === "under_review"
          ? styles.reviewText
        : normalizedStatus === "pending"
          ? styles.pendingText
          : styles.neutralText;

  return (
    <View
      accessibilityLabel={`Claim status: ${formatStatus(status)}`}
      accessible
      style={[styles.badge, badgeStyle]}
    >
      <Text style={[styles.text, textStyle]}>{formatStatus(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  text: {
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  pendingBadge: {
    backgroundColor: colors.warningSurface,
  },
  pendingText: {
    color: colors.warning,
  },
  approvedBadge: {
    backgroundColor: colors.greenSurface,
  },
  approvedText: {
    color: colors.primaryDark,
  },
  rejectedBadge: {
    backgroundColor: colors.dangerSurfaceStrong,
  },
  rejectedText: {
    color: colors.danger,
  },
  reviewBadge: {
    backgroundColor: colors.blueSurface,
  },
  reviewText: {
    color: colors.blueDark,
  },
  neutralBadge: {
    backgroundColor: colors.border,
  },
  neutralText: {
    color: colors.textMutedDark,
  },
});
