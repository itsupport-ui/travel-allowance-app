import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ClaimStatusBadge } from "../src/components/ClaimStatusBadge";
import { ClaimsSkeleton } from "../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../src/query/queryKeys";
import { getClaimDetails } from "../src/services/claimService";
import {
  ClaimPdfError,
  exportClaimPdf,
} from "../src/services/claimPdfService";
import { getApiErrorMessage } from "../src/services/errorHandler";
import type { ClaimTravelEntry } from "../src/types/claim";

const PRIMARY = colors.primary;

const parseClaimId = (
  value: string | string[] | undefined
): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue || !/^\d+$/.test(rawValue)) {
    return null;
  }

  const id = Number(rawValue);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

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
    month: "long",
    year: "numeric",
  });
};

const formatLabel = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Not available";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatAmount = (value: number | null | undefined): string =>
  `INR ${(value ?? 0).toFixed(2)}`;

const formatDistance = (value: number): string =>
  `${value.toFixed(value % 1 === 0 ? 0 : 1)} KM`;

function SummaryRow({
  emphasize = false,
  label,
  value,
}: {
  emphasize?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          emphasize && styles.grandTotal,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const TravelEntryCard = memo(function TravelEntryCard({
  travel,
}: {
  travel: ClaimTravelEntry;
}) {
  return (
    <View style={styles.travelCard}>
      <View style={styles.travelHeader}>
        <View style={styles.patientIcon}>
          <Ionicons color={PRIMARY} name="person-outline" size={20} />
        </View>
        <View style={styles.travelTitleBlock}>
          <Text style={styles.eyebrow}>Patient</Text>
          <Text numberOfLines={1} style={styles.patientName}>
            {travel.patient_name ?? "Not recorded"}
          </Text>
        </View>
        <View style={styles.travelStatusBadge}>
          <Text style={styles.travelStatusText}>
            {formatLabel(travel.status)}
          </Text>
        </View>
      </View>

      <View style={styles.route}>
        <View style={styles.routeMarker}>
          <View style={styles.routeDot} />
          <View style={styles.routeLine} />
          <Ionicons color={PRIMARY} name="location" size={16} />
        </View>
        <View style={styles.routeContent}>
          <Text style={styles.routeLabel}>From</Text>
          <Text style={styles.routeText}>{travel.from_address}</Text>
          <Text style={styles.routeLabel}>To</Text>
          <Text style={styles.routeText}>{travel.to_address}</Text>
        </View>
      </View>

      <View style={styles.travelMetrics}>
        <View style={styles.travelMetric}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>
            {formatDistance(travel.total_km)}
          </Text>
        </View>
        <View style={styles.travelMetric}>
          <Text style={styles.metricLabel}>Fare</Text>
          <Text style={styles.fareValue}>
            {formatAmount(travel.travel_fare)}
          </Text>
        </View>
      </View>

      <View style={styles.travelMeta}>
        <Text style={styles.metaText}>
          {formatLabel(travel.transport_mode)}
        </Text>
        <Text style={styles.metaText}>
          Visited: {travel.patient_visited ? "Yes" : "No"}
        </Text>
      </View>
    </View>
  );
});

export default function ClaimDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const claimId = useMemo(
    () => parseClaimId(params.id),
    [params.id]
  );
  const detailsQuery = useQuery({
    enabled: claimId !== null,
    queryKey:
      claimId === null
        ? ["claims", "detail", "invalid"]
        : queryKeys.claims.detail(claimId),
    queryFn: () => {
      if (claimId === null) {
        throw new Error("A valid claim ID is required.");
      }

      return getClaimDetails(claimId);
    },
  });
  const pdfMutation = useMutation({
    mutationFn: () => {
      if (!detailsQuery.data) {
        throw new ClaimPdfError(
          "Claim details are not available for export."
        );
      }

      return exportClaimPdf(detailsQuery.data);
    },
    onSuccess: (fileName) => {
      Alert.alert(
        "Claim PDF Ready",
        `${fileName} was generated successfully.`
      );
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Export PDF",
        error instanceof ClaimPdfError
          ? error.message
          : "The claim PDF could not be generated."
      );
    },
  });

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/claims");
    }
  };

  if (detailsQuery.isPending && !detailsQuery.data) {
    return <ClaimsSkeleton />;
  }

  const details = detailsQuery.data;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={styles.safeArea}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.headerButton}
          onPress={handleBack}
        >
          <Ionicons
            color={colors.textStrong}
            name="arrow-back"
            size={23}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Claim Details</Text>
        <TouchableOpacity
          accessibilityLabel="Export claim as PDF"
          accessibilityRole="button"
          accessibilityState={{
            disabled: !details || pdfMutation.isPending,
          }}
          disabled={!details || pdfMutation.isPending}
          style={styles.headerButton}
          onPress={() => pdfMutation.mutate()}
        >
          {pdfMutation.isPending ? (
            <ActivityIndicator color={PRIMARY} size="small" />
          ) : (
            <Ionicons
              color={PRIMARY}
              name="download-outline"
              size={23}
            />
          )}
        </TouchableOpacity>
      </View>

      {claimId === null ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Invalid claim</Text>
          <Text style={styles.stateText}>
            A valid claim ID is required.
          </Text>
        </View>
      ) : detailsQuery.error && !details ? (
        <View style={styles.centerState}>
          <View style={styles.errorIcon}>
            <Ionicons
              color={colors.danger}
              name="alert-circle-outline"
              size={28}
            />
          </View>
          <Text style={styles.stateTitle}>Unable to load claim</Text>
          <Text style={styles.stateText}>
            {getApiErrorMessage(
              detailsQuery.error,
              "Unable to load claim details."
            )}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => void detailsQuery.refetch()}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : details ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[PRIMARY]}
              refreshing={
                detailsQuery.isRefetching && !detailsQuery.isPending
              }
              tintColor={PRIMARY}
              onRefresh={() => void detailsQuery.refetch()}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.overview}>
            <View style={styles.overviewHeader}>
              <View>
                <Text style={styles.eyebrow}>Claim Date</Text>
                <Text style={styles.claimDate}>
                  {formatDate(details.claim.claim_date)}
                </Text>
              </View>
              <ClaimStatusBadge status={details.claim.status} />
            </View>

            <View style={styles.divider} />
            <SummaryRow
              label="Total Distance"
              value={formatDistance(details.claim.total_km)}
            />
            <SummaryRow
              label="Per KM Rate"
              value={formatAmount(details.claim.per_km_rate)}
            />
            <SummaryRow
              label="Travel Total"
              value={formatAmount(details.claim.travel_total)}
            />
            <SummaryRow
              label="Daily Allowance"
              value={formatAmount(details.claim.daily_allowance)}
            />
            <SummaryRow
              emphasize
              label="Grand Total"
              value={formatAmount(details.claim.grand_total)}
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Travel Entries</Text>
            <Text style={styles.entryCount}>
              {details.travels.length}
            </Text>
          </View>

          {details.travels.length > 0 ? (
            details.travels.map((travel) => (
              <TravelEntryCard key={travel.id} travel={travel} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                color={PRIMARY}
                name="car-outline"
                size={27}
              />
              <Text style={styles.stateTitle}>
                No linked travel entries
              </Text>
              <Text style={styles.stateText}>
                This claim does not contain individual travel records.
              </Text>
            </View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: spacing.xl,
  },
  headerButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  overview: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xxl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  overviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
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
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.lg,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    minHeight: 42,
  },
  summaryLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  summaryValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "right",
  },
  grandTotal: {
    color: PRIMARY,
    fontSize: typography.size.bodyLarge,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  entryCount: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.pill,
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    minWidth: 26,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textAlign: "center",
  },
  travelCard: {
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
  travelHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  patientIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  travelTitleBlock: {
    flex: 1,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  travelStatusBadge: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  travelStatusText: {
    color: colors.textMutedDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  route: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingVertical: spacing.lg,
  },
  routeMarker: {
    alignItems: "center",
    marginRight: spacing.lg,
    width: 18,
  },
  routeDot: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.sm,
    height: 8,
    width: 8,
  },
  routeLine: {
    backgroundColor: colors.inputBorder,
    flex: 1,
    marginVertical: spacing.xs,
    minHeight: 34,
    width: 1,
  },
  routeContent: {
    flex: 1,
  },
  routeLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  routeText: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginBottom: spacing.md,
  },
  travelMetrics: {
    flexDirection: "row",
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  travelMetric: {
    flex: 1,
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
  fareValue: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  travelMeta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  metaText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.md,
    padding: spacing.section,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.section,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 54,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    textAlign: "center",
  },
  retryButton: {
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 44,
  },
  retryText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
