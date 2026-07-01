import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { memo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from "react-native";

import { TravelSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../../src/query/queryKeys";
import {
  getMyClaims,
  submitTodayClaim,
} from "../../src/services/claimService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { getTodayTravels } from "../../src/services/travelService";
import type { TravelResponse } from "../../src/types/travel";

const PRIMARY = colors.primary;

interface TravelSummary {
  distance: number;
  fare: number;
  trips: number;
}

const getLocalDateKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatAmount = (value: number): string =>
  `INR ${value.toFixed(2)}`;

const formatDistance = (value: number): string =>
  `${value.toFixed(value % 1 === 0 ? 0 : 1)} KM`;

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

const calculateSummary = (
  travels: TravelResponse[]
): TravelSummary =>
  travels.reduce<TravelSummary>(
    (summary, travel) => ({
      distance: summary.distance + travel.total_km,
      fare: summary.fare + travel.travel_fare,
      trips: summary.trips + 1,
    }),
    { distance: 0, fare: 0, trips: 0 }
  );

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Ionicons color={PRIMARY} name={icon} size={19} />
      <Text numberOfLines={1} style={styles.summaryValue}>
        {value}
      </Text>
      <Text numberOfLines={2} style={styles.summaryLabel}>
        {label}
      </Text>
    </View>
  );
}

const TravelCard = memo(function TravelCard({
  travel,
}: {
  travel: TravelResponse;
}) {
  return (
    <TouchableOpacity
      accessibilityHint="Opens travel details"
      accessibilityRole="button"
      activeOpacity={0.82}
      style={styles.travelCard}
      onPress={() =>
        router.push({
          pathname: "/travel-details",
          params: { id: String(travel.id) },
        })
      }
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.eyebrow}>Patient</Text>
          <Text numberOfLines={1} style={styles.patientName}>
            {travel.patient_name ?? "Patient not recorded"}
          </Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
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
          <Text numberOfLines={2} style={styles.routeText}>
            {travel.from_address}
          </Text>
          <Text style={styles.routeLabel}>To</Text>
          <Text numberOfLines={2} style={styles.routeText}>
            {travel.to_address}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.footerMetric}>
          {formatDistance(travel.total_km)}
        </Text>
        <Text style={styles.footerMetric}>
          {formatAmount(travel.travel_fare)}
        </Text>
        <Ionicons
          color={colors.textSubtle}
          name="chevron-forward"
          size={18}
        />
      </View>
    </TouchableOpacity>
  );
});

const keyExtractor = (item: TravelResponse): string =>
  String(item.id);

const renderTravel: ListRenderItem<TravelResponse> = ({ item }) => (
  <TravelCard travel={item} />
);

export default function TravelScreen() {
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const travelQuery = useQuery({
    queryKey: queryKeys.travel.today,
    queryFn: getTodayTravels,
  });
  const claimsQuery = useQuery({
    queryKey: queryKeys.claims.mine,
    queryFn: getMyClaims,
  });
  const submitMutation = useMutation({
    mutationFn: submitTodayClaim,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.claims.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard.summary,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.travel.today,
        }),
      ]);
      Alert.alert(
        "Claim Submitted",
        "Today's travel claim was submitted successfully."
      );
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Submit Claim",
        getApiErrorMessage(
          error,
          "Unable to submit today's claim."
        )
      );
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  if (travelQuery.isPending && !travelQuery.data) {
    return <TravelSkeleton />;
  }

  const travels = travelQuery.data ?? [];
  const summary = calculateSummary(travels);
  const today = getLocalDateKey(new Date());
  const hasClaimToday = (claimsQuery.data ?? []).some(
    (claim) => claim.claim_date.slice(0, 10) === today
  );
  const claimStateUnavailable =
    claimsQuery.isPending || Boolean(claimsQuery.error);
  const submitDisabled =
    travels.length === 0 ||
    hasClaimToday ||
    claimStateUnavailable ||
    submitMutation.isPending;

  const submitClaim = () => {
    if (submittingRef.current || submitDisabled) {
      return;
    }

    Alert.alert(
      "Submit Today's Claim",
      "You are about to submit today's travel claim.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: () => {
            if (submittingRef.current) {
              return;
            }

            submittingRef.current = true;
            submitMutation.mutate();
          },
        },
      ]
    );
  };

  const refresh = async () => {
    await Promise.all([
      travelQuery.refetch(),
      claimsQuery.refetch(),
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={
          travels.length === 0
            ? styles.emptyContent
            : styles.content
        }
        data={travels}
        initialNumToRender={6}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          !travelQuery.error ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  color={PRIMARY}
                  name="navigate-outline"
                  size={27}
                />
              </View>
              <Text style={styles.stateTitle}>No travel recorded today</Text>
              <Text style={styles.stateText}>
                Travel entries appear automatically after treatments are
                completed.
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Today&apos;s Travel</Text>

            <View style={styles.summaryCard}>
              <SummaryItem
                icon="navigate-outline"
                label="Trips"
                value={String(summary.trips)}
              />
              <View style={styles.summaryDivider} />
              <SummaryItem
                icon="speedometer-outline"
                label="Distance"
                value={formatDistance(summary.distance)}
              />
              <View style={styles.summaryDivider} />
              <SummaryItem
                icon="wallet-outline"
                label="Travel Fare"
                value={formatAmount(summary.fare)}
              />
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: submitDisabled }}
              activeOpacity={0.85}
              disabled={submitDisabled}
              style={[
                styles.submitButton,
                submitDisabled && styles.disabledButton,
                hasClaimToday && styles.submittedButton,
              ]}
              onPress={submitClaim}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator
                  color={colors.surface}
                  size="small"
                />
              ) : (
                <Ionicons
                  color={colors.surface}
                  name={
                    hasClaimToday
                      ? "checkmark-circle"
                      : "send-outline"
                  }
                  size={20}
                />
              )}
              <Text style={styles.submitText}>
                {submitMutation.isPending
                  ? "Submitting..."
                  : hasClaimToday
                    ? "Today's Claim Submitted"
                    : travels.length === 0
                      ? "Complete a Treatment First"
                      : "Submit Today's Claim"}
              </Text>
            </TouchableOpacity>

            {claimsQuery.error ? (
              <Text style={styles.claimWarning}>
                Claim status is unavailable. Pull to refresh before
                submitting.
              </Text>
            ) : null}

            {travelQuery.error ? (
              <View style={styles.errorCard}>
                <Ionicons
                  color={colors.danger}
                  name="alert-circle-outline"
                  size={21}
                />
                <View style={styles.errorContent}>
                  <Text style={styles.stateTitle}>
                    Unable to load today&apos;s travel
                  </Text>
                  <Text style={styles.errorText}>
                    {getApiErrorMessage(
                      travelQuery.error,
                      "Unable to load today's travel."
                    )}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.retryButton}
                    onPress={() => void refresh()}
                  >
                    <Text style={styles.retryText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Travel Entries</Text>
          </View>
        }
        maxToRenderPerBatch={6}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            refreshing={
              (travelQuery.isRefetching ||
                claimsQuery.isRefetching) &&
              !travelQuery.isPending
            }
            tintColor={PRIMARY}
            onRefresh={() => void refresh()}
          />
        }
        removeClippedSubviews
        renderItem={renderTravel}
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
  summaryCard: {
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    marginBottom: spacing.xl,
    minHeight: 126,
    padding: spacing.lg,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  summaryValue: {
    color: PRIMARY,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  summaryDivider: {
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    width: StyleSheet.hairlineWidth,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  disabledButton: {
    opacity: 0.58,
  },
  submittedButton: {
    backgroundColor: colors.greenDeep,
  },
  submitText: {
    color: colors.surface,
    flexShrink: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  claimWarning: {
    color: colors.warningDark,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.s19,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.xxl,
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
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  statusBadge: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  statusText: {
    color: PRIMARY,
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
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  footerMetric: {
    color: PRIMARY,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.section,
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
    marginTop: spacing.xl,
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
