import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { memo } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from "react-native";

import { ClaimStatusBadge } from "../../src/components/ClaimStatusBadge";
import { ClaimsSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../../src/query/queryKeys";
import { getMyClaims } from "../../src/services/claimService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { ClaimResponse } from "../../src/types/claim";

const PRIMARY = colors.primary;

interface ClaimSummary {
  approved: number;
  pending: number;
  rejected: number;
}

const formatDate = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Date not available";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatAmount = (value: number | null | undefined): string =>
  `INR ${(value ?? 0).toFixed(2)}`;

const formatDistance = (value: number): string =>
  `${value.toFixed(value % 1 === 0 ? 0 : 1)} KM`;

const calculateSummary = (
  claims: ClaimResponse[]
): ClaimSummary =>
  claims.reduce<ClaimSummary>(
    (summary, claim) => {
      const status =
        typeof claim.status === "string"
          ? claim.status.trim().toLowerCase()
          : "";

      if (status === "approved") {
        summary.approved += 1;
      } else if (status === "rejected") {
        summary.rejected += 1;
      } else if (status === "pending") {
        summary.pending += 1;
      }

      return summary;
    },
    { approved: 0, pending: 0, rejected: 0 }
  );

function SummaryCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "approved" | "pending" | "rejected";
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          tone === "approved"
            ? styles.approvedValue
            : tone === "rejected"
              ? styles.rejectedValue
              : styles.pendingValue,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Metric({
  label,
  value,
  emphasize = false,
}: {
  emphasize?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.metricValue,
          emphasize && styles.emphasizedMetric,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const ClaimCard = memo(function ClaimCard({
  claim,
}: {
  claim: ClaimResponse;
}) {
  return (
    <TouchableOpacity
      accessibilityHint="Opens claim details"
      accessibilityRole="button"
      activeOpacity={0.82}
      style={styles.claimCard}
      onPress={() =>
        router.push({
          pathname: "/claim-details",
          params: { id: String(claim.id) },
        })
      }
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.eyebrow}>Claim Date</Text>
          <Text style={styles.claimDate}>
            {formatDate(claim.claim_date)}
          </Text>
        </View>
        <ClaimStatusBadge status={claim.status} />
      </View>

      <View style={styles.metricGrid}>
        <Metric
          label="Distance"
          value={formatDistance(claim.total_km)}
        />
        <Metric
          label="Per KM Rate"
          value={formatAmount(claim.per_km_rate)}
        />
        <Metric
          label="Travel Fare"
          value={formatAmount(claim.travel_total)}
        />
        <Metric
          label="Daily Allowance"
          value={formatAmount(claim.daily_allowance)}
        />
        <Metric
          label="Patients"
          value={String(claim.patient_count ?? 0)}
        />
        <Metric
          emphasize
          label="Grand Total"
          value={formatAmount(claim.grand_total)}
        />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.detailsText}>View Details</Text>
        <Ionicons
          color={colors.textSubtle}
          name="chevron-forward"
          size={18}
        />
      </View>
    </TouchableOpacity>
  );
});

const keyExtractor = (item: ClaimResponse): string =>
  String(item.id);

const renderClaim: ListRenderItem<ClaimResponse> = ({ item }) => (
  <ClaimCard claim={item} />
);

export default function ClaimsScreen() {
  const claimsQuery = useQuery({
    queryKey: queryKeys.claims.mine,
    queryFn: getMyClaims,
  });

  if (claimsQuery.isPending && !claimsQuery.data) {
    return <ClaimsSkeleton />;
  }

  const claims = claimsQuery.data ?? [];
  const summary = calculateSummary(claims);

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={
          claims.length === 0
            ? styles.emptyContent
            : styles.content
        }
        data={claims}
        initialNumToRender={6}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          !claimsQuery.error ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  color={PRIMARY}
                  name="receipt-outline"
                  size={27}
                />
              </View>
              <Text style={styles.stateTitle}>No claims submitted</Text>
              <Text style={styles.stateText}>
                Complete treatments and submit today&apos;s claim from
                the Travel tab.
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>My Claims</Text>

            <View style={styles.summaryGrid}>
              <SummaryCard
                label="Pending"
                tone="pending"
                value={summary.pending}
              />
              <SummaryCard
                label="Approved"
                tone="approved"
                value={summary.approved}
              />
              <SummaryCard
                label="Rejected"
                tone="rejected"
                value={summary.rejected}
              />
            </View>

            {claimsQuery.error ? (
              <View style={styles.errorCard}>
                <Ionicons
                  color={colors.danger}
                  name="alert-circle-outline"
                  size={21}
                />
                <View style={styles.errorContent}>
                  <Text style={styles.stateTitle}>
                    Claims unavailable
                  </Text>
                  <Text style={styles.errorText}>
                    {getApiErrorMessage(
                      claimsQuery.error,
                      "Unable to load your claims."
                    )}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.retryButton}
                    onPress={() => void claimsQuery.refetch()}
                  >
                    <Text style={styles.retryText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Claim History</Text>
          </View>
        }
        maxToRenderPerBatch={6}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            refreshing={
              claimsQuery.isRefetching && !claimsQuery.isPending
            }
            tintColor={PRIMARY}
            onRefresh={() => void claimsQuery.refetch()}
          />
        }
        removeClippedSubviews
        renderItem={renderClaim}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  emptyContent: {
    flexGrow: 1,
    padding: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flex: 1,
    minHeight: 96,
    padding: spacing.lg,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  summaryValue: {
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  pendingValue: {
    color: colors.warning,
  },
  approvedValue: {
    color: colors.primaryDark,
  },
  rejectedValue: {
    color: colors.danger,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  claimCard: {
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
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  claimDate: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  metricGrid: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: spacing.md,
  },
  metric: {
    flexBasis: "50%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.xs,
  },
  metricValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  emphasizedMetric: {
    color: PRIMARY,
    fontSize: typography.size.body,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.lg,
  },
  detailsText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    padding: spacing.section,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 54,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    textAlign: "center",
  },
  errorCard: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorContent: {
    flex: 1,
  },
  errorText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
  },
  retryButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
  },
  retryText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
