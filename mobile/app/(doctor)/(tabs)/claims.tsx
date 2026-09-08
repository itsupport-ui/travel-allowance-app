import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
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
  DoctorChoiceChips,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorLoadingState,
  DoctorPressableCard,
  DoctorSearchBar,
  DoctorScreenHeader,
  DoctorStatusBadge,
} from "../../../src/components/doctor/DoctorWorkflowUi";
import { MyClaimsReportActions } from "../../../src/components/reports/MyClaimsReportActions";
import { queryKeys } from "../../../src/query/queryKeys";
import {
  getDoctorClaimReadiness,
  getMyDoctorClaims,
  getTodayDoctorExpenses,
  submitDoctorClaim,
} from "../../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import { isOfflineMutationQueuedError } from "../../../src/services/offlineMutationQueue";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorLabel,
} from "../../../src/utils/doctorWorkflow";

type ClaimsTab = "history" | "today";

const tabs: readonly { label: string; value: ClaimsTab }[] = [
  { label: "Today", value: "today" },
  { label: "Claim history", value: "history" },
];

export default function DoctorClaimsScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ClaimsTab>("today");
  const [search, setSearch] = useState("");
  const expensesQuery = useQuery({
    queryFn: getTodayDoctorExpenses,
    queryKey: queryKeys.doctor.expenses.today,
  });
  const claimsQuery = useQuery({
    queryFn: getMyDoctorClaims,
    queryKey: queryKeys.doctor.claims.mine,
  });
  const readinessQuery = useQuery({
    queryFn: getDoctorClaimReadiness,
    queryKey: queryKeys.doctor.claims.readiness,
  });
  const todayExpenses = useMemo(
    () => expensesQuery.data ?? [],
    [expensesQuery.data]
  );
  const claims = useMemo(
    () => claimsQuery.data ?? [],
    [claimsQuery.data]
  );
  const visibleTodayExpenses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return todayExpenses;
    return todayExpenses.filter((expense) =>
      [
        expense.from_location,
        expense.to_location,
        expense.transport_mode,
        expense.remarks ?? "",
        `expense ${expense.id}`,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    );
  }, [search, todayExpenses]);
  const visibleClaims = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return claims;
    return claims.filter((claim) =>
      [
        `claim ${claim.id}`,
        claim.claim_date,
        claim.status,
        String(claim.total_amount),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    );
  }, [claims, search]);
  const readiness = readinessQuery.data;
  const todayClaim = readiness?.existing_claim_id
    ? claims.find((claim) => claim.id === readiness.existing_claim_id)
    : undefined;
  const canSubmit = Boolean(readiness?.can_submit);
  const submitMutation = useMutation({
    mutationFn: submitDoctorClaim,
    onError: (error) => {
      Alert.alert(
        isOfflineMutationQueuedError(error)
          ? "Saved for Sync"
          : "Unable to Submit Claim",
        getApiErrorMessage(error, "Unable to submit today’s claim.")
      );
    },
    onSuccess: async (claim) => {
      queryClient.setQueryData(
        queryKeys.doctor.claims.detail(claim.id),
        claim
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.claims.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.claims.readiness,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.expenses.all,
        }),
      ]);
      setActiveTab("history");
      Alert.alert(
        "Claim Submitted",
        "The claim is awaiting admin review."
      );
    },
  });
  const refresh = async () => {
    await Promise.all([
      expensesQuery.refetch(),
      claimsQuery.refetch(),
      readinessQuery.refetch(),
    ]);
  };
  const confirmSubmit = () => {
    Alert.alert(
      readiness?.submission_mode === "resubmit"
        ? "Resubmit Claim"
        : "Submit Claim",
      `${readiness?.submission_mode === "resubmit" ? "Resubmit" : "Submit"} ${readiness?.eligible_record_count ?? 0} expense${
        (readiness?.eligible_record_count ?? 0) === 1 ? "" : "s"
      } totalling ${formatDoctorCurrency(readiness?.total_amount ?? 0)} for approval?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => submitMutation.mutate(),
          text:
            readiness?.submission_mode === "resubmit" ? "Resubmit" : "Submit",
        },
      ]
    );
  };

  if (
    (expensesQuery.isPending && !expensesQuery.data) ||
    (claimsQuery.isPending && !claimsQuery.data) ||
    (readinessQuery.isPending && !readinessQuery.data)
  ) {
    return <DoctorLoadingState label="Loading claims..." />;
  }

  if (
    (expensesQuery.error && !expensesQuery.data) ||
    (claimsQuery.error && !claimsQuery.data) ||
    (readinessQuery.error && !readinessQuery.data)
  ) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          expensesQuery.error ?? claimsQuery.error ?? readinessQuery.error,
          "Unable to load doctor claims."
        )}
        onRetry={() => void refresh()}
        title="Claims unavailable"
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={
            expensesQuery.isRefetching ||
            claimsQuery.isRefetching ||
            readinessQuery.isRefetching
          }
          tintColor={colors.primary}
          onRefresh={() => void refresh()}
        />
      }
      style={styles.container}
    >
      <DoctorScreenHeader
        subtitle="Submit today’s draft expenses and track approval."
        title="Claims"
      />

      <MyClaimsReportActions />

      <TouchableOpacity
        accessibilityHint="Opens the travel expense report for a month or custom date range"
        accessibilityLabel="Open travel expense report"
        accessibilityRole="button"
        activeOpacity={0.82}
        onPress={() => router.push("/(doctor)/(tabs)/travel-expense-report")}
        style={styles.travelReportButton}
      >
        <View style={styles.travelReportIcon}>
          <Ionicons color={colors.primary} name="car-outline" size={20} />
        </View>
        <View style={styles.travelReportText}>
          <Text style={styles.travelReportTitle}>Travel Expense Report</Text>
          <Text style={styles.travelReportSubtitle}>
            Preview and export your travel expenses by month or range
          </Text>
        </View>
        <Ionicons color={colors.textSubtle} name="chevron-forward" size={20} />
      </TouchableOpacity>

      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={styles.previewTitleBlock}>
            <Text style={styles.previewTitle}>Today&apos;s claim preview</Text>
            <Text style={styles.previewCaption}>
              Business date {readiness?.business_date}. Eligibility and totals are server-calculated.
            </Text>
          </View>
          {readiness ? <DoctorStatusBadge status={readiness.state} /> : null}
        </View>
        {readiness?.rejection_reason && readiness.submission_mode === "resubmit" ? (
          <View accessibilityRole="alert" style={styles.warningCardNested}>
            <Text style={styles.warningTitle}>Changes requested</Text>
            <Text style={styles.warningText}>{readiness.rejection_reason}</Text>
          </View>
        ) : null}
        {readiness?.blocking_reasons.map((blocker) => (
          <View accessibilityRole="alert" key={blocker.code} style={styles.warningCardNested}>
            <Text style={styles.warningTitle}>
              {blocker.affected_count > 0
                ? `${blocker.affected_count} affected item${blocker.affected_count === 1 ? "" : "s"}`
                : "Claim not ready"}
            </Text>
            <Text style={styles.warningText}>{blocker.message}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Eligible expenses</Text>
          <Text style={styles.summaryValue}>
            {readiness?.eligible_record_count ?? 0}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Eligible total</Text>
          <Text style={styles.summaryAmount}>
            {formatDoctorCurrency(readiness?.total_amount ?? 0)}
          </Text>
        </View>
      </View>

      {todayClaim && todayClaim.status !== "rejected" ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Today&apos;s claim is already{" "}
            <Text style={styles.bold}>
              {formatDoctorLabel(todayClaim.status)}
            </Text>
            .
          </Text>
        </View>
      ) : null}

      {todayClaim?.status === "rejected" &&
      (readiness?.eligible_record_count ?? 0) > 0 ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            Today&apos;s rejected claim can be resubmitted with the
            current draft expenses.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{
          disabled: !canSubmit || submitMutation.isPending,
        }}
        disabled={!canSubmit || submitMutation.isPending}
        style={[
          styles.submitButton,
          (!canSubmit || submitMutation.isPending) &&
            styles.disabledButton,
        ]}
        onPress={confirmSubmit}
      >
        {submitMutation.isPending ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Ionicons
            color={colors.surface}
            name="paper-plane-outline"
            size={19}
          />
        )}
        <Text style={styles.submitText}>
          {submitMutation.isPending
            ? "Submitting..."
            : readiness?.submission_mode === "resubmit"
              ? "Resubmit Claim"
              : "Submit Today’s Claim"}
        </Text>
      </TouchableOpacity>

      <View style={styles.tabs}>
        <DoctorSearchBar
          accessibilityLabel="Search claims or eligible expenses"
          placeholder={
            activeTab === "today"
              ? "Search today’s expenses"
              : "Search claim number, date, or status"
          }
          value={search}
          onChangeText={setSearch}
        />
        <DoctorChoiceChips
          onChange={setActiveTab}
          options={tabs}
          value={activeTab}
        />
      </View>

      {activeTab === "today" ? (
        visibleTodayExpenses.length === 0 ? (
          <DoctorEmptyState
            description={
              todayExpenses.length === 0
                ? "Add today’s expenses before submitting a claim."
                : "No expenses match your search."
            }
            icon="wallet-outline"
            title="No expenses today"
          />
        ) : (
          visibleTodayExpenses.map((expense) => (
            <DoctorPressableCard
              accessibilityLabel={`Open expense ${expense.id} details`}
              key={expense.id}
              style={styles.expenseCard}
              onPress={() =>
                router.push(
                  {
                    pathname: "/(doctor)/expense-details",
                    params: { id: String(expense.id) },
                  } as unknown as Href
                )
              }
            >
              <View style={styles.expenseRoute}>
                <View style={styles.routeText}>
                  <Text style={styles.expenseFrom}>
                    {expense.from_location}
                  </Text>
                  <Text style={styles.expenseTo}>
                    to {expense.to_location}
                  </Text>
                </View>
                <Text style={styles.expenseFare}>
                  {formatDoctorCurrency(expense.approved_amount ?? expense.fare)}
                </Text>
              </View>
              <View style={styles.expenseFooter}>
                <Text style={styles.expenseMeta}>
                  {formatDoctorLabel(expense.transport_mode)} · {formatDoctorLabel(expense.expense_category)}
                </Text>
                <DoctorStatusBadge
                  status={
                    expense.visit_id === null && expense.manual_review_status
                      ? expense.manual_review_status
                      : expense.status
                  }
                />
              </View>
            </DoctorPressableCard>
          ))
        )
      ) : visibleClaims.length === 0 ? (
        <DoctorEmptyState
          description={
            claims.length === 0
              ? "Submitted claims will appear here."
              : "No claims match your search."
          }
          icon="receipt-outline"
          title="No claim history"
        />
      ) : (
        visibleClaims.map((claim) => (
          <DoctorPressableCard
            accessibilityLabel={`Open claim ${claim.id} details`}
            key={claim.id}
            style={styles.claimCard}
            onPress={() =>
              router.push({
                pathname: "/(doctor)/claim-details",
                params: { id: String(claim.id) },
              })
            }
          >
            <View style={styles.claimIcon}>
              <Ionicons
                color={colors.primary}
                name="receipt-outline"
                size={22}
              />
            </View>
            <View style={styles.claimContent}>
              <View style={styles.claimTitleRow}>
                <Text style={styles.claimTitle}>Claim #{claim.id}</Text>
                <DoctorStatusBadge status={claim.status} />
              </View>
              <Text style={styles.claimMeta}>
                {formatDoctorDate(claim.claim_date)} ·{" "}
                {claim.expense_count} expense
                {claim.expense_count === 1 ? "" : "s"}
              </Text>
              <Text style={styles.claimAmount}>
                {formatDoctorCurrency(claim.total_amount)}
              </Text>
            </View>
            <Ionicons
              color={colors.textSubtle}
              name="chevron-forward"
              size={19}
            />
          </DoctorPressableCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  travelReportButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.lg,
    minHeight: 64,
    padding: spacing.lg,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  travelReportIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  travelReportText: {
    flex: 1,
    marginHorizontal: spacing.lg,
  },
  travelReportTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  travelReportSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  previewCard: {
    backgroundColor: colors.blueSurface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  previewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  previewTitleBlock: {
    flex: 1,
  },
  previewTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  previewCaption: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  warningCardNested: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xs,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    marginBottom: spacing.lg,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
    width: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  summaryAmount: {
    color: colors.primary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  infoCard: {
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  infoText: {
    color: colors.blueDark,
    fontSize: typography.size.bodySmall,
  },
  bold: {
    fontWeight: typography.weight.extrabold,
  },
  warningCard: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  warningText: {
    color: colors.warningDark,
    fontSize: typography.size.bodySmall,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 52,
  },
  disabledButton: {
    opacity: 0.42,
  },
  submitText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  tabs: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
    marginTop: spacing.xxxl,
  },
  expenseCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.panel,
    borderWidth: 1,
    marginBottom: spacing.lg,
    overflow: "hidden",
    padding: spacing.xl,
  },
  expenseRoute: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  routeText: {
    flex: 1,
  },
  expenseFrom: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  expenseTo: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.xs,
  },
  expenseFare: {
    color: colors.primary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  expenseFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  expenseMeta: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  claimCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.panel,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  claimIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  claimContent: {
    flex: 1,
  },
  claimTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  claimTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  claimMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  claimAmount: {
    color: colors.primary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
  },
});
