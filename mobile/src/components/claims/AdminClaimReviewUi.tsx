import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type DimensionValue,
} from "react-native";

import { colors, radius, shadows, spacing, typography } from "../../theme";
import type {
  AdminClaimReviewItem,
  AdminClaimReviewSummary,
  AdminClaimStatus,
} from "../../types/adminClaimReview";
import { ClaimStatusBadge } from "../ClaimStatusBadge";

type ClaimAction = "approve" | "reject";

interface ClaimSummaryCardProps {
  backgroundColor: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  width: DimensionValue;
}

interface AdminClaimCardProps {
  actionDisabled: boolean;
  approving: boolean;
  claim: AdminClaimReviewItem;
  onAction: (
    claim: AdminClaimReviewItem,
    action: ClaimAction
  ) => void;
  onViewDetails: (claim: AdminClaimReviewItem) => void;
  rejecting: boolean;
}

const formatAmount = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);

const formatDistance = (value: number): string =>
  `${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
  }).format(value)} km`;

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
};

const formatTime = (value: string | null): string => {
  if (!value) {
    return "Time not recorded";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatRole = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const ClaimSummaryCard = memo(
  ({
    backgroundColor,
    color,
    icon,
    label,
    value,
    width,
  }: ClaimSummaryCardProps) => (
    <View
      accessibilityLabel={`${label}: ${value}`}
      accessible
      style={[styles.summaryCard, { width }]}
    >
      <View style={[styles.summaryIcon, { backgroundColor }]}>
        <Ionicons color={color} name={icon} size={19} />
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>
        {value}
      </Text>
      <Text numberOfLines={2} style={styles.summaryLabel}>
        {label}
      </Text>
    </View>
  )
);

ClaimSummaryCard.displayName = "ClaimSummaryCard";

export const ClaimSummaryGrid = memo(
  ({
    cardWidth,
    summary,
  }: {
    cardWidth: DimensionValue;
    summary: AdminClaimReviewSummary;
  }) => (
    <View style={styles.summaryGrid}>
      <ClaimSummaryCard
        backgroundColor={colors.warningSurface}
        color={colors.warning}
        icon="time-outline"
        label="Pending Claims"
        value={String(summary.pendingClaims)}
        width={cardWidth}
      />
      <ClaimSummaryCard
        backgroundColor={colors.blueSurface}
        color={colors.blueDark}
        icon="calendar-outline"
        label="Today's Claims"
        value={String(summary.todaysClaims)}
        width={cardWidth}
      />
      <ClaimSummaryCard
        backgroundColor={colors.primarySurface}
        color={colors.primaryDark}
        icon="wallet-outline"
        label="Pending Amount"
        value={formatAmount(summary.pendingAmount)}
        width={cardWidth}
      />
      <ClaimSummaryCard
        backgroundColor={colors.dangerSurface}
        color={colors.danger}
        icon="alert-circle-outline"
        label="High Value Claims"
        value={String(summary.highValueClaims)}
        width={cardWidth}
      />
    </View>
  )
);

ClaimSummaryGrid.displayName = "ClaimSummaryGrid";

export const ClaimSearchBar = memo(
  ({
    onChangeText,
    value,
  }: {
    onChangeText: (value: string) => void;
    value: string;
  }) => (
    <View style={styles.searchContainer}>
      <Ionicons
        color={colors.textMuted}
        name="search-outline"
        size={20}
      />
      <TextInput
        accessibilityLabel="Search claims"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder="Search therapist, patient, or claim ID"
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
      />
      {value ? (
        <TouchableOpacity
          accessibilityLabel="Clear claim search"
          accessibilityRole="button"
          onPress={() => onChangeText("")}
          style={styles.clearSearch}
        >
          <Ionicons
            color={colors.textMuted}
            name="close-circle"
            size={19}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  )
);

ClaimSearchBar.displayName = "ClaimSearchBar";

const statusLabels: Record<AdminClaimStatus, string> = {
  all: "All",
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
};
const statusOrder: AdminClaimStatus[] = [
  "pending",
  "all",
  "approved",
  "rejected",
];

export const ClaimStatusFilters = memo(
  ({
    onChange,
    value,
  }: {
    onChange: (status: AdminClaimStatus) => void;
    value: AdminClaimStatus;
  }) => (
    <View
      accessibilityLabel="Claim status filters"
      accessibilityRole="radiogroup"
      style={styles.statusFilters}
    >
      {statusOrder.map((status) => {
          const selected = value === status;
          return (
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              activeOpacity={0.8}
              key={status}
              onPress={() => onChange(status)}
              style={[
                styles.statusChip,
                selected ? styles.selectedStatusChip : null,
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  selected ? styles.selectedStatusChipText : null,
                ]}
              >
                {statusLabels[status]}
              </Text>
            </TouchableOpacity>
          );
      })}
    </View>
  )
);

ClaimStatusFilters.displayName = "ClaimStatusFilters";

export const AdminClaimReviewCard = memo(
  ({
    actionDisabled,
    approving,
    claim,
    onAction,
    onViewDetails,
    rejecting,
  }: AdminClaimCardProps) => {
    const isPending = claim.status.toLocaleLowerCase() === "pending";
    const additionalVisits = Math.max(claim.patientCount - 1, 0);

    return (
      <View
        accessibilityLabel={`Claim ${claim.id} from ${claim.therapistName}, ${formatAmount(claim.grandTotal)}, ${claim.status}`}
        accessible
        style={styles.claimCard}
      >
        <View style={styles.claimHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {claim.therapistName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.claimIdentity}>
            <Text numberOfLines={1} style={styles.therapistName}>
              {claim.therapistName}
            </Text>
            <Text style={styles.therapistMeta}>
              {formatRole(claim.therapistRole)} · Claim #{claim.id}
            </Text>
          </View>
          <ClaimStatusBadge status={claim.status} />
        </View>

        {claim.isUrgent ? (
          <View style={styles.urgentBanner}>
            <Ionicons
              color={colors.danger}
              name="alert-circle"
              size={16}
            />
            <Text style={styles.urgentText}>
              {claim.isHighValue
                ? "High value claim requires priority review"
                : `Pending for ${claim.ageDays} days`}
            </Text>
          </View>
        ) : null}

        <View style={styles.visitRow}>
          <View style={styles.visitIcon}>
            <Ionicons
              color={colors.blueDark}
              name="person-outline"
              size={18}
            />
          </View>
          <View style={styles.visitContent}>
            <Text style={styles.visitLabel}>Patient visit</Text>
            <Text numberOfLines={1} style={styles.patientName}>
              {claim.patientName ?? "Patient not recorded"}
              {additionalVisits
                ? ` +${additionalVisits} more`
                : ""}
            </Text>
            <Text style={styles.visitDate}>
              {formatDate(claim.claimDate)} ·{" "}
              {formatTime(claim.travelDate)}
            </Text>
          </View>
          <View style={styles.visitCount}>
            <Text style={styles.visitCountValue}>{claim.visitedCount}</Text>
            <Text style={styles.visitCountLabel}>Visits</Text>
          </View>
        </View>

        <View style={styles.route}>
          <View style={styles.routeMarkers}>
            <View style={styles.routeDot} />
            <View style={styles.routeLine} />
            <Ionicons color={colors.primary} name="location" size={15} />
          </View>
          <View style={styles.routeAddresses}>
            <Text style={styles.routeLabel}>Start</Text>
            <Text numberOfLines={2} style={styles.routeText}>
              {claim.fromAddress ?? "Start location not recorded"}
            </Text>
            <Text style={styles.routeLabel}>Destination</Text>
            <Text numberOfLines={2} style={styles.routeText}>
              {claim.toAddress ?? "Destination not recorded"}
            </Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>
              {formatDistance(claim.totalKm)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Rate</Text>
            <Text style={styles.metricValue}>
              {formatAmount(claim.perKmRate)}/km
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Travel</Text>
            <Text style={styles.metricValue}>
              {formatAmount(claim.travelTotal)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Allowance</Text>
            <Text style={styles.metricValue}>
              {formatAmount(claim.dailyAllowance)}
            </Text>
          </View>
        </View>

        {claim.notes ? (
          <View style={styles.notesRow}>
            <Ionicons
              color={colors.textMuted}
              name="document-text-outline"
              size={16}
            />
            <Text numberOfLines={2} style={styles.notesText}>
              {claim.notes}
            </Text>
          </View>
        ) : null}

        <View style={styles.totalRow}>
          <View>
            <Text style={styles.totalLabel}>Total requested</Text>
            <Text style={styles.submittedText}>
              Submitted {formatDateTime(claim.submittedAt)}
            </Text>
          </View>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.totalValue}>
            {formatAmount(claim.grandTotal)}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityLabel={`View claim ${claim.id} details`}
            accessibilityRole="button"
            activeOpacity={0.82}
            onPress={() => onViewDetails(claim)}
            style={[
              styles.actionButton,
              styles.detailsButton,
              !isPending ? styles.expandedDetailsButton : null,
            ]}
          >
            <Ionicons
              color={colors.textSecondary}
              name="eye-outline"
              size={18}
            />
            <Text style={styles.detailsButtonText}>Details</Text>
          </TouchableOpacity>
          {isPending ? (
            <>
              <TouchableOpacity
                accessibilityLabel={`Reject claim ${claim.id}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: actionDisabled }}
                activeOpacity={0.82}
                disabled={actionDisabled}
                onPress={() => onAction(claim, "reject")}
                style={[
                  styles.actionButton,
                  styles.rejectButton,
                  actionDisabled ? styles.disabledButton : null,
                ]}
              >
                {rejecting ? (
                  <ActivityIndicator
                    color={colors.danger}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    color={colors.danger}
                    name="close"
                    size={18}
                  />
                )}
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={`Approve claim ${claim.id}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: actionDisabled }}
                activeOpacity={0.82}
                disabled={actionDisabled}
                onPress={() => onAction(claim, "approve")}
                style={[
                  styles.actionButton,
                  styles.approveButton,
                  actionDisabled ? styles.disabledButton : null,
                ]}
              >
                {approving ? (
                  <ActivityIndicator
                    color={colors.surface}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    color={colors.surface}
                    name="checkmark"
                    size={18}
                  />
                )}
                <Text style={styles.approveButtonText}>Approve</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    );
  }
);

AdminClaimReviewCard.displayName = "AdminClaimReviewCard";

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 118,
    padding: spacing.lg,
    elevation: shadows.elevation.low,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y1,
    shadowOpacity: shadows.opacity.subtle,
    shadowRadius: shadows.radius.s5,
  },
  summaryIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.mdPlus,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  searchContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
  },
  clearSearch: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 36,
  },
  statusFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statusChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  selectedStatusChip: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  statusChipText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  selectedStatusChipText: {
    color: colors.primaryDark,
  },
  claimCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  claimHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  avatarText: {
    color: colors.primaryDark,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  claimIdentity: {
    flex: 1,
    marginHorizontal: spacing.mdPlus,
    minWidth: 0,
  },
  therapistName: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  therapistMeta: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xs,
  },
  urgentBanner: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.mdPlus,
  },
  urgentText: {
    color: colors.dangerDark,
    flex: 1,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  visitRow: {
    alignItems: "center",
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
    flexDirection: "row",
    marginTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  visitIcon: {
    alignItems: "center",
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  visitContent: {
    flex: 1,
    marginLeft: spacing.mdPlus,
    minWidth: 0,
  },
  visitLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  patientName: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  visitDate: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xs,
  },
  visitCount: {
    alignItems: "flex-end",
    marginLeft: spacing.md,
  },
  visitCountValue: {
    color: colors.blueDark,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  visitCountLabel: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
  },
  route: {
    flexDirection: "row",
    paddingVertical: spacing.lg,
  },
  routeMarkers: {
    alignItems: "center",
    marginRight: spacing.lg,
    width: 16,
  },
  routeDot: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.sm,
    height: 7,
    width: 7,
  },
  routeLine: {
    backgroundColor: colors.inputBorder,
    flex: 1,
    marginVertical: spacing.xs,
    minHeight: 28,
    width: 1,
  },
  routeAddresses: {
    flex: 1,
  },
  routeLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  routeText: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginBottom: spacing.md,
    marginTop: spacing.xxs,
  },
  metricGrid: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.control,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: spacing.mdPlus,
    rowGap: spacing.lg,
  },
  metric: {
    width: "50%",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.semibold,
  },
  metricValue: {
    color: colors.textStrong,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  notesRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  notesText: {
    color: colors.textMutedDark,
    flex: 1,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
  },
  totalRow: {
    alignItems: "center",
    borderTopColor: colors.borderMuted,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  submittedText: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
    marginTop: spacing.xs,
  },
  totalValue: {
    color: colors.primaryDark,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
    marginLeft: spacing.md,
    maxWidth: "48%",
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  detailsButton: {
    backgroundColor: colors.neutral100,
    borderColor: colors.border,
    borderWidth: 1,
  },
  expandedDetailsButton: {
    flex: 1,
  },
  detailsButtonText: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  rejectButton: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
  },
  rejectButtonText: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    color: colors.surface,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
