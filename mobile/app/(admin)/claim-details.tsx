import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useEffect, useMemo } from "react";
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ClaimStatusBadge } from "../../src/components/ClaimStatusBadge";
import { ClaimsSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../../src/query/queryKeys";
import {
  AdminClaimServiceError,
  approveAdminClaim,
  rejectAdminClaim,
} from "../../src/services/adminClaimService";
import {
  ClaimServiceError,
  getClaimDetails,
} from "../../src/services/claimService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { ClaimTravelEntry } from "../../src/types/claim";
import { clearAuthSession } from "../../src/utils/storage";

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

const formatAmount = (value: number | null | undefined): string =>
  new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value ?? 0);

const formatDistance = (value: number): string =>
  `${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
  }).format(value)} km`;

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const formatLabel = (value: string): string =>
  value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const DetailRow = ({
  emphasize = false,
  label,
  value,
}: {
  emphasize?: boolean;
  label: string;
  value: string;
}) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text
      style={[
        styles.detailValue,
        emphasize ? styles.emphasizedValue : null,
      ]}
    >
      {value}
    </Text>
  </View>
);

const TravelReviewCard = memo(
  ({ travel }: { travel: ClaimTravelEntry }) => (
    <View style={styles.travelCard}>
      <View style={styles.travelHeader}>
        <View style={styles.patientIcon}>
          <Ionicons
            color={colors.blueDark}
            name="person-outline"
            size={19}
          />
        </View>
        <View style={styles.travelHeading}>
          <Text style={styles.travelEyebrow}>Patient</Text>
          <Text numberOfLines={1} style={styles.patientName}>
            {travel.patient_name ?? "Patient not recorded"}
          </Text>
        </View>
        <Text style={styles.travelDate}>
          {formatDateTime(
            travel.travel_timestamp ?? travel.travel_date
          )}
        </Text>
      </View>

      <View style={styles.route}>
        <View style={styles.routeMarkers}>
          <View style={styles.routeDot} />
          <View style={styles.routeLine} />
          <Ionicons color={PRIMARY} name="location" size={16} />
        </View>
        <View style={styles.routeContent}>
          <Text style={styles.routeLabel}>Start address</Text>
          <Text style={styles.routeText}>{travel.from_address}</Text>
          <Text style={styles.routeLabel}>Destination</Text>
          <Text style={styles.routeText}>{travel.to_address}</Text>
        </View>
      </View>

      <View style={styles.travelMetrics}>
        <DetailRow
          label="Distance"
          value={formatDistance(travel.total_km)}
        />
        <DetailRow
          label="Rate"
          value={`${formatAmount(travel.per_km_rate)}/km`}
        />
        <DetailRow
          label="Travel Amount"
          value={formatAmount(travel.travel_fare)}
        />
        <DetailRow
          label="Transport"
          value={formatLabel(travel.transport_mode)}
        />
      </View>

      <View style={styles.travelFooter}>
        <View style={styles.visitState}>
          <Ionicons
            color={
              travel.patient_visited
                ? colors.greenDark
                : colors.textMuted
            }
            name={
              travel.patient_visited
                ? "checkmark-circle"
                : "close-circle-outline"
            }
            size={17}
          />
          <Text style={styles.visitStateText}>
            Patient visited: {travel.patient_visited ? "Yes" : "No"}
          </Text>
        </View>
        {travel.invoice_file ? (
          <View
            accessibilityLabel="Supporting invoice attached"
            style={styles.invoiceBadge}
          >
            <Ionicons
              color={colors.purple}
              name="document-attach-outline"
              size={16}
            />
            <Text style={styles.invoiceText}>Invoice attached</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
);

TravelReviewCard.displayName = "TravelReviewCard";

export default function AdminClaimDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const claimId = useMemo(() => parseClaimId(params.id), [params.id]);
  const queryClient = useQueryClient();
  const detailsQuery = useQuery({
    enabled: claimId !== null,
    queryKey:
      claimId === null
        ? ["admin", "claims", "detail", "invalid"]
        : queryKeys.adminClaims.detail(claimId),
    queryFn: () => {
      if (claimId === null) {
        throw new Error("A valid claim ID is required.");
      }
      return getClaimDetails(claimId);
    },
  });
  const actionMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      if (claimId === null) {
        throw new Error("A valid claim ID is required.");
      }
      return action === "approve"
        ? approveAdminClaim(claimId)
        : rejectAdminClaim(claimId);
    },
    onSuccess: async (_, action) => {
      await Promise.all([
        detailsQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.adminClaims.all,
        }),
      ]);
      Alert.alert(
        action === "approve" ? "Claim Approved" : "Claim Rejected",
        `Claim #${claimId} was ${
          action === "approve" ? "approved" : "rejected"
        }.`
      );
    },
    onError: (error) => {
      if (
        error instanceof AdminClaimServiceError &&
        error.status === 401
      ) {
        void clearAuthSession().then(() =>
          router.replace("/(auth)/login")
        );
        return;
      }
      Alert.alert(
        "Unable to Process Claim",
        error instanceof AdminClaimServiceError
          ? error.message
          : "The claim could not be updated."
      );
    },
  });

  useEffect(() => {
    if (
      detailsQuery.error instanceof ClaimServiceError &&
      detailsQuery.error.status === 401
    ) {
      void clearAuthSession().then(() =>
        router.replace("/(auth)/login")
      );
    }
  }, [detailsQuery.error]);

  const confirmAction = (action: "approve" | "reject") => {
    const approving = action === "approve";
    Alert.alert(
      approving ? "Approve Claim?" : "Reject Claim?",
      `${approving ? "Approve" : "Reject"} claim #${claimId}?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => actionMutation.mutate(action),
          style: approving ? "default" : "destructive",
          text: approving ? "Approve" : "Reject",
        },
      ]
    );
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(admin)/claims");
    }
  };

  if (detailsQuery.isPending && !detailsQuery.data) {
    return <ClaimsSkeleton />;
  }

  const details = detailsQuery.data;
  const isPending =
    details?.claim.status.toLocaleLowerCase() === "pending";
  const actionBarHeight =
    isPending ? 64 + Math.max(insets.bottom, spacing.lg) : 0;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.headerButton}
        >
          <Ionicons
            color={colors.textStrong}
            name="arrow-back"
            size={23}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Claim Review</Text>
        <View style={styles.headerButton} />
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
            accessibilityLabel="Retry loading claim details"
            accessibilityRole="button"
            onPress={() => void detailsQuery.refetch()}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : details ? (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: spacing.sectionLg + actionBarHeight },
            ]}
            refreshControl={
              <RefreshControl
                colors={[PRIMARY]}
                onRefresh={() => void detailsQuery.refetch()}
                refreshing={detailsQuery.isRefetching}
                tintColor={PRIMARY}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.identityPanel}>
              <View style={styles.identityHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(details.claim.therapist_name ?? "T")
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.identityText}>
                  <Text style={styles.identityLabel}>Therapist</Text>
                  <Text style={styles.therapistName}>
                    {details.claim.therapist_name ?? "Therapist"}
                  </Text>
                  <Text style={styles.roleText}>
                    {formatLabel(
                      details.claim.therapist_role ?? "therapist"
                    )}
                  </Text>
                </View>
                <ClaimStatusBadge status={details.claim.status} />
              </View>
              <View style={styles.identityDivider} />
              <View style={styles.claimMetaRow}>
                <View>
                  <Text style={styles.identityLabel}>Claim ID</Text>
                  <Text style={styles.metaValue}>
                    #{details.claim.id}
                  </Text>
                </View>
                <View style={styles.metaRight}>
                  <Text style={styles.identityLabel}>Claim Date</Text>
                  <Text style={styles.metaValue}>
                    {formatDate(details.claim.claim_date)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Claim breakdown</Text>
            <View style={styles.breakdownPanel}>
              <DetailRow
                label="Total Distance"
                value={formatDistance(details.claim.total_km)}
              />
              <DetailRow
                label="Per KM Rate"
                value={`${formatAmount(
                  details.claim.per_km_rate
                )}/km`}
              />
              <DetailRow
                label="Travel Amount"
                value={formatAmount(details.claim.travel_total)}
              />
              <DetailRow
                label="Daily Allowance"
                value={formatAmount(details.claim.daily_allowance)}
              />
              <View style={styles.totalDivider} />
              <DetailRow
                emphasize
                label="Total Claim"
                value={formatAmount(details.claim.grand_total)}
              />
            </View>

            {details.claim.notes ? (
              <>
                <Text style={styles.sectionTitle}>Claim notes</Text>
                <View style={styles.notesPanel}>
                  <Ionicons
                    color={colors.textMuted}
                    name="document-text-outline"
                    size={20}
                  />
                  <Text style={styles.notesText}>
                    {details.claim.notes}
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitleNoMargin}>
                Patient visits and travel
              </Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {details.travels.length}
                </Text>
              </View>
            </View>
            {details.travels.length ? (
              details.travels.map((travel) => (
                <TravelReviewCard key={travel.id} travel={travel} />
              ))
            ) : (
              <View style={styles.emptyTravel}>
                <Ionicons
                  color={colors.textSubtle}
                  name="navigate-outline"
                  size={28}
                />
                <Text style={styles.stateTitle}>
                  No linked travel entries
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Approval history</Text>
            <View style={styles.historyPanel}>
              <View style={styles.timelineMarker}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineLine} />
                <View style={styles.timelineDotCurrent} />
              </View>
              <View style={styles.timelineContent}>
                <View style={styles.timelineEntry}>
                  <Text style={styles.timelineTitle}>
                    Claim submitted
                  </Text>
                  <Text style={styles.timelineMeta}>
                    {formatDateTime(details.claim.submitted_at)}
                  </Text>
                </View>
                <View style={styles.timelineEntry}>
                  <Text style={styles.timelineTitle}>
                    Current status:{" "}
                    {formatLabel(details.claim.status)}
                  </Text>
                  <Text style={styles.timelineMeta}>
                    Detailed approver audit records will appear here
                    when audit logging is enabled.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {isPending ? (
            <View
              style={[
                styles.actionBar,
                { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              ]}
            >
              <TouchableOpacity
                accessibilityLabel={`Reject claim ${claimId}`}
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    actionMutation.isPending &&
                    actionMutation.variables === "reject",
                  disabled: actionMutation.isPending,
                }}
                disabled={actionMutation.isPending}
                onPress={() => confirmAction("reject")}
                style={styles.rejectButton}
              >
                {actionMutation.isPending &&
                actionMutation.variables === "reject" ? (
                  <ActivityIndicator
                    color={colors.danger}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    color={colors.danger}
                    name="close-circle-outline"
                    size={20}
                  />
                )}
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={`Approve claim ${claimId}`}
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    actionMutation.isPending &&
                    actionMutation.variables === "approve",
                  disabled: actionMutation.isPending,
                }}
                disabled={actionMutation.isPending}
                onPress={() => confirmAction("approve")}
                style={styles.approveButton}
              >
                {actionMutation.isPending &&
                actionMutation.variables === "approve" ? (
                  <ActivityIndicator
                    color={colors.surface}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    color={colors.surface}
                    name="checkmark-circle-outline"
                    size={20}
                  />
                )}
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
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
  },
  identityPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  identityHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  identityText: {
    flex: 1,
    marginHorizontal: spacing.lg,
  },
  identityLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  therapistName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  roleText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  identityDivider: {
    backgroundColor: colors.borderMuted,
    height: 1,
    marginVertical: spacing.lg,
  },
  claimMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaRight: {
    alignItems: "flex-end",
  },
  metaValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.section,
  },
  sectionTitleNoMargin: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  breakdownPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xl,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
  },
  detailLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginLeft: spacing.md,
    textAlign: "right",
  },
  emphasizedValue: {
    color: colors.primaryDark,
    fontSize: typography.size.titleSmall,
  },
  totalDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.md,
  },
  notesPanel: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  notesText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    marginTop: spacing.section,
  },
  countBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    minWidth: 26,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  countText: {
    color: PRIMARY,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
  },
  travelCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  travelHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  patientIcon: {
    alignItems: "center",
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  travelHeading: {
    flex: 1,
    marginHorizontal: spacing.mdPlus,
    minWidth: 0,
  },
  travelEyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  patientName: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  travelDate: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    maxWidth: 84,
    textAlign: "right",
  },
  route: {
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
    borderTopColor: colors.borderMuted,
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: spacing.lg,
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
  routeContent: {
    flex: 1,
  },
  routeLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  routeText: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  travelMetrics: {
    paddingTop: spacing.md,
  },
  travelFooter: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  visitState: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  visitStateText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  invoiceBadge: {
    alignItems: "center",
    backgroundColor: colors.purpleSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  invoiceText: {
    color: colors.purple,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
  },
  emptyTravel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.md,
    padding: spacing.section,
  },
  historyPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    padding: spacing.xl,
  },
  timelineMarker: {
    alignItems: "center",
    marginRight: spacing.lg,
    width: 14,
  },
  timelineDot: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.sm,
    height: 8,
    width: 8,
  },
  timelineLine: {
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: spacing.xs,
    minHeight: 44,
    width: 1,
  },
  timelineDotCurrent: {
    backgroundColor: PRIMARY,
    borderRadius: radius.sm,
    height: 9,
    width: 9,
  },
  timelineContent: {
    flex: 1,
    gap: spacing.xl,
  },
  timelineEntry: {
    minHeight: 42,
  },
  timelineTitle: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  timelineMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.lg,
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    position: "absolute",
    right: 0,
  },
  rejectButton: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 50,
  },
  rejectText: {
    color: colors.danger,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  approveButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flex: 1.3,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 50,
  },
  approveText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
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
    marginTop: spacing.md,
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
