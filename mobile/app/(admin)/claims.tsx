import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AdminClaimServiceError,
  approveAdminClaim,
  getPendingAdminClaims,
  rejectAdminClaim,
} from "../../src/services/adminClaimService";
import type { ClaimResponse } from "../../src/types/claim";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

type ClaimAction = "approve" | "reject";
type LoadMode = "initial" | "refresh" | "silent";

interface ActiveAction {
  claimId: number;
  type: ClaimAction;
}

const formatAmount = (value: number): string =>
  `INR ${value.toFixed(2)}`;

const formatDistance = (value: number): string =>
  `${value.toFixed(2)} KM`;

const formatDate = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Date not available";
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to manage the claim.";
};

interface AdminClaimCardProps {
  actionDisabled: boolean;
  approving: boolean;
  claim: ClaimResponse;
  onAction: (claim: ClaimResponse, action: ClaimAction) => void;
  rejecting: boolean;
}

const AdminClaimCard = memo(function AdminClaimCard({
  actionDisabled,
  approving,
  claim,
  onAction,
  rejecting,
}: AdminClaimCardProps) {
  return (
    <View style={styles.claimCard}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(claim.therapist_name ?? "T").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerContent}>
          <Text numberOfLines={1} style={styles.therapistName}>
            {claim.therapist_name ?? "Therapist"}
          </Text>
          <Text style={styles.claimDate}>
            {formatDate(claim.claim_date)}
          </Text>
        </View>
        <View style={styles.pendingBadge}>
          <View style={styles.pendingDot} />
          <Text style={styles.pendingText}>Pending</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.claimDetails}>
        <View style={styles.detailColumn}>
          <Text style={styles.detailLabel}>Total Distance</Text>
          <Text style={styles.detailValue}>
            {formatDistance(claim.total_km)}
          </Text>
        </View>
        <View style={styles.detailColumn}>
          <Text style={styles.detailLabel}>Travel Total</Text>
          <Text style={styles.detailValue}>
            {formatAmount(claim.travel_total)}
          </Text>
        </View>
        <View style={styles.detailColumn}>
          <Text style={styles.detailLabel}>Daily Allowance</Text>
          <Text style={styles.detailValue}>
            {formatAmount(claim.daily_allowance)}
          </Text>
        </View>
        <View style={styles.detailColumn}>
          <Text style={styles.detailLabel}>Patient Visits</Text>
          <Text style={styles.detailValue}>
            {claim.patient_count ?? 0}
          </Text>
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Grand Total</Text>
        <Text style={styles.totalValue}>
          {formatAmount(claim.grand_total)}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
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
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Ionicons
              color={colors.danger}
              name="close-circle-outline"
              size={19}
            />
          )}
          <Text style={styles.rejectButtonText}>
            {rejecting ? "Rejecting..." : "Reject"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
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
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons
              color={colors.surface}
              name="checkmark-circle-outline"
              size={19}
            />
          )}
          <Text style={styles.approveButtonText}>
            {approving ? "Approving..." : "Approve"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const keyExtractor = (item: ClaimResponse): string => String(item.id);

const ListSeparator = () => <View style={styles.separator} />;

export default function AdminClaimsScreen() {
  const [claims, setClaims] = useState<ClaimResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] =
    useState<ActiveAction | null>(null);
  const actionInFlight = useRef(false);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        requestError instanceof AdminClaimServiceError &&
        requestError.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }

      return false;
    },
    []
  );

  const loadClaims = useCallback(
    async (mode: LoadMode = "initial"): Promise<void> => {
      if (mode === "initial") {
        setLoading(true);
      } else if (mode === "refresh") {
        setRefreshing(true);
      }

      setError(null);

      try {
        const data = await getPendingAdminClaims();
        setClaims(data);
      } catch (loadError) {
        if (await handleSessionExpiry(loadError)) {
          return;
        }

        setError(getErrorMessage(loadError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleSessionExpiry]
  );

  useFocusEffect(
    useCallback(() => {
      void loadClaims();
    }, [loadClaims])
  );

  const summary = useMemo(
    () =>
      claims.reduce(
        (totals, claim) => ({
          totalKm: totals.totalKm + claim.total_km,
          totalAmount: totals.totalAmount + claim.grand_total,
        }),
        {
          totalKm: 0,
          totalAmount: 0,
        }
      ),
    [claims]
  );

  const performAction = useCallback(
    async (claim: ClaimResponse, action: ClaimAction): Promise<void> => {
      if (actionInFlight.current) {
        return;
      }

      actionInFlight.current = true;
      setActiveAction({
        claimId: claim.id,
        type: action,
      });

      try {
        if (action === "approve") {
          await approveAdminClaim(claim.id);
        } else {
          await rejectAdminClaim(claim.id);
        }

        await loadClaims("silent");

        Alert.alert(
          action === "approve" ? "Claim Approved" : "Claim Rejected",
          `The claim from ${
            claim.therapist_name ?? "the therapist"
          } has been ${action === "approve" ? "approved" : "rejected"}.`
        );
      } catch (actionError) {
        if (await handleSessionExpiry(actionError)) {
          return;
        }

        Alert.alert(
          action === "approve"
            ? "Unable to Approve Claim"
            : "Unable to Reject Claim",
          getErrorMessage(actionError)
        );
      } finally {
        actionInFlight.current = false;
        setActiveAction(null);
      }
    },
    [handleSessionExpiry, loadClaims]
  );

  const confirmAction = useCallback(
    (claim: ClaimResponse, action: ClaimAction) => {
      const therapistName =
        claim.therapist_name ?? "this therapist";
      const isApproval = action === "approve";

      Alert.alert(
        isApproval ? "Approve Claim?" : "Reject Claim?",
        `Confirm that you want to ${
          isApproval ? "approve" : "reject"
        } the claim submitted by ${therapistName}.`,
        [
          {
            style: "cancel",
            text: "Cancel",
          },
          {
            onPress: () => void performAction(claim, action),
            style: isApproval ? "default" : "destructive",
            text: isApproval ? "Approve" : "Reject",
          },
        ]
      );
    },
    [performAction]
  );

  const renderClaimItem = useCallback<ListRenderItem<ClaimResponse>>(
    ({ item }) => {
      const approving =
        activeAction?.claimId === item.id &&
        activeAction.type === "approve";
      const rejecting =
        activeAction?.claimId === item.id &&
        activeAction.type === "reject";
      const actionDisabled = activeAction !== null;

      return (
        <AdminClaimCard
          actionDisabled={actionDisabled}
          approving={approving}
          claim={item}
          onAction={confirmAction}
          rejecting={rejecting}
        />
      );
    },
    [activeAction, confirmAction]
  );

  const listHeader = (
    <>
      <Text style={styles.eyebrow}>Administration</Text>
      <Text style={styles.title}>Claims</Text>
      <Text style={styles.subtitle}>
        Review and process pending travel claims
      </Text>

      <Text style={styles.sectionTitle}>Pending Summary</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Ionicons color={colors.warning} name="time-outline" size={20} />
          <Text style={styles.summaryValue}>{claims.length}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons color={colors.blueDark} name="navigate-outline" size={20} />
          <Text style={styles.summaryValue}>
            {summary.totalKm.toFixed(1)}
          </Text>
          <Text style={styles.summaryLabel}>Total KM</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons color={PRIMARY} name="wallet-outline" size={20} />
          <Text numberOfLines={1} style={styles.summaryAmount}>
            {formatAmount(summary.totalAmount)}
          </Text>
          <Text style={styles.summaryLabel}>Claim Value</Text>
        </View>
      </View>

      <View style={styles.listTitleRow}>
        <Text style={styles.sectionTitleNoMargin}>Pending Claims</Text>
        <Text style={styles.resultCount}>{claims.length}</Text>
      </View>
    </>
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={PRIMARY} size="large" />
          <Text style={styles.loadingText}>Loading pending claims...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[
          styles.content,
          claims.length === 0 && styles.emptyContent,
        ]}
        data={error ? [] : claims}
        initialNumToRender={5}
        ItemSeparatorComponent={ListSeparator}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          error ? (
            <View style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <Ionicons
                  color={colors.danger}
                  name="alert-circle-outline"
                  size={26}
                />
              </View>
              <Text style={styles.errorTitle}>Claims unavailable</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.82}
                onPress={() => void loadClaims()}
                style={styles.retryButton}
              >
                <Ionicons color={colors.surface} name="refresh" size={18} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                color={colors.green}
                name="checkmark-done-circle-outline"
                size={42}
              />
              <Text style={styles.emptyTitle}>No pending claims</Text>
              <Text style={styles.emptyMessage}>
                New therapist claims will appear here for review.
              </Text>
            </View>
          )
        }
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={() => void loadClaims("refresh")}
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        maxToRenderPerBatch={5}
        removeClippedSubviews
        renderItem={renderClaimItem}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.s13,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xlPlus,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s5,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.s11,
    marginTop: spacing.xxxl,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s9,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 118,
    padding: spacing.lg,
    elevation: shadows.elevation.low,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y1,
    shadowOpacity: shadows.opacity.subtle,
    shadowRadius: shadows.radius.s5,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  summaryAmount: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  listTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    marginTop: spacing.s25,
  },
  sectionTitleNoMargin: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  resultCount: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    color: colors.warning,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    minWidth: 31,
    overflow: "hidden",
    paddingHorizontal: spacing.s9,
    paddingVertical: spacing.s5,
    textAlign: "center",
  },
  claimCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.s15,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  headerContent: {
    flex: 1,
    marginHorizontal: spacing.s11,
  },
  therapistName: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  claimDate: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  pendingBadge: {
    alignItems: "center",
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.s5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pendingDot: {
    backgroundColor: colors.warningBright,
    borderRadius: radius.sm,
    height: 7,
    width: 7,
  },
  pendingText: {
    color: colors.warning,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
  },
  divider: {
    backgroundColor: colors.neutral150,
    height: 1,
    marginVertical: spacing.lgPlus,
  },
  claimDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.s15,
  },
  detailColumn: {
    width: "50%",
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  totalRow: {
    alignItems: "center",
    backgroundColor: colors.greenSurfaceLight,
    borderColor: colors.successBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.s15,
    padding: spacing.lg,
  },
  totalLabel: {
    color: colors.primaryDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  totalValue: {
    color: PRIMARY,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.lgPlus,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.s7,
    justifyContent: "center",
    minHeight: 46,
  },
  rejectButton: {
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorderStrong,
    borderWidth: 1,
  },
  approveButton: {
    backgroundColor: PRIMARY,
  },
  rejectButtonText: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  approveButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.55,
  },
  separator: {
    height: 12,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.section,
    padding: spacing.xxxl,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xlPlus,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 260,
    paddingHorizontal: spacing.xxxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lgPlus,
  },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
});
