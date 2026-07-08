import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
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
  DoctorScreenHeader,
  DoctorStatusBadge,
} from "../../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../../src/query/queryKeys";
import {
  getMyDoctorClaims,
  getTodayDoctorExpenses,
  submitDoctorClaim,
} from "../../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorLabel,
  getLocalIsoDate,
} from "../../../src/utils/doctorWorkflow";

type ClaimsTab = "history" | "today";

const tabs: readonly { label: string; value: ClaimsTab }[] = [
  { label: "Today", value: "today" },
  { label: "Claim history", value: "history" },
];

export default function DoctorClaimsScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ClaimsTab>("today");
  const expensesQuery = useQuery({
    queryFn: getTodayDoctorExpenses,
    queryKey: queryKeys.doctor.expenses.today,
  });
  const claimsQuery = useQuery({
    queryFn: getMyDoctorClaims,
    queryKey: queryKeys.doctor.claims.mine,
  });
  const todayExpenses = useMemo(
    () => expensesQuery.data ?? [],
    [expensesQuery.data]
  );
  const claims = claimsQuery.data ?? [];
  const eligibleExpenses = useMemo(
    () =>
      todayExpenses.filter(
        (expense) =>
          expense.status === "draft" && expense.claim_id === null
      ),
    [todayExpenses]
  );
  const eligibleTotal = useMemo(
    () =>
      eligibleExpenses.reduce(
        (total, expense) => total + Number(expense.fare || 0),
        0
      ),
    [eligibleExpenses]
  );
  const today = getLocalIsoDate();
  const todayClaim = claims.find((claim) => claim.claim_date === today);
  const canSubmit =
    eligibleExpenses.length > 0 &&
    (!todayClaim || todayClaim.status === "rejected");
  const submitMutation = useMutation({
    mutationFn: submitDoctorClaim,
    onError: (error) => {
      Alert.alert(
        "Unable to Submit Claim",
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
    await Promise.all([expensesQuery.refetch(), claimsQuery.refetch()]);
  };
  const confirmSubmit = () => {
    Alert.alert(
      todayClaim?.status === "rejected"
        ? "Resubmit Claim"
        : "Submit Claim",
      `Submit ${eligibleExpenses.length} expense${
        eligibleExpenses.length === 1 ? "" : "s"
      } totalling ${formatDoctorCurrency(eligibleTotal)} for approval?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => submitMutation.mutate(),
          text:
            todayClaim?.status === "rejected" ? "Resubmit" : "Submit",
        },
      ]
    );
  };

  if (
    (expensesQuery.isPending && !expensesQuery.data) ||
    (claimsQuery.isPending && !claimsQuery.data)
  ) {
    return <DoctorLoadingState label="Loading claims..." />;
  }

  if (
    (expensesQuery.error && !expensesQuery.data) ||
    (claimsQuery.error && !claimsQuery.data)
  ) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          expensesQuery.error ?? claimsQuery.error,
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
            expensesQuery.isRefetching || claimsQuery.isRefetching
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

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Eligible expenses</Text>
          <Text style={styles.summaryValue}>
            {eligibleExpenses.length}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Eligible total</Text>
          <Text style={styles.summaryAmount}>
            {formatDoctorCurrency(eligibleTotal)}
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
      eligibleExpenses.length > 0 ? (
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
            : todayClaim?.status === "rejected"
              ? "Resubmit Claim"
              : "Submit Today’s Claim"}
        </Text>
      </TouchableOpacity>

      <View style={styles.tabs}>
        <DoctorChoiceChips
          onChange={setActiveTab}
          options={tabs}
          value={activeTab}
        />
      </View>

      {activeTab === "today" ? (
        todayExpenses.length === 0 ? (
          <DoctorEmptyState
            description="Add today’s expenses before submitting a claim."
            icon="wallet-outline"
            title="No expenses today"
          />
        ) : (
          todayExpenses.map((expense) => (
            <View key={expense.id} style={styles.expenseCard}>
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
                  {formatDoctorCurrency(expense.fare)}
                </Text>
              </View>
              <View style={styles.expenseFooter}>
                <Text style={styles.expenseMeta}>
                  {formatDoctorLabel(expense.transport_mode)}
                </Text>
                <DoctorStatusBadge status={expense.status} />
              </View>
            </View>
          ))
        )
      ) : claims.length === 0 ? (
        <DoctorEmptyState
          description="Submitted claims will appear here."
          icon="receipt-outline"
          title="No claim history"
        />
      ) : (
        claims.map((claim) => (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.84}
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
          </TouchableOpacity>
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
    marginBottom: spacing.xl,
    marginTop: spacing.xxxl,
  },
  expenseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
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
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.lg,
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
