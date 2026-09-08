import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
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
import { queryKeys } from "../../../src/query/queryKeys";
import {
  deleteDoctorExpense,
  downloadDoctorExpenseProof,
  getMyDoctorExpenses,
  getTodayDoctorExpenses,
} from "../../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import type { DoctorExpense } from "../../../src/types/doctorWorkflow";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorLabel,
} from "../../../src/utils/doctorWorkflow";

type ExpenseTab = "history" | "today";

const tabs: readonly { label: string; value: ExpenseTab }[] = [
  { label: "Today", value: "today" },
  { label: "All expenses", value: "history" },
];

const getProofMimeType = (proofName: string): string => {
  const normalized = proofName.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  return "image/jpeg";
};

export default function DoctorExpensesScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ExpenseTab>("today");
  const [search, setSearch] = useState("");
  const todayQuery = useQuery({
    queryFn: getTodayDoctorExpenses,
    queryKey: queryKeys.doctor.expenses.today,
  });
  const allQuery = useQuery({
    queryFn: getMyDoctorExpenses,
    queryKey: queryKeys.doctor.expenses.mine,
  });
  const todayExpenses = useMemo(
    () => todayQuery.data ?? [],
    [todayQuery.data]
  );
  const allExpenses = useMemo(
    () => allQuery.data ?? [],
    [allQuery.data]
  );
  const visibleExpenses = useMemo(() => {
    const source = activeTab === "today" ? todayExpenses : allExpenses;
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return source;
    return source.filter((expense) =>
      [
        expense.from_location,
        expense.to_location,
        expense.transport_mode,
        expense.remarks ?? "",
        `expense ${expense.id}`,
        expense.visit_id ? `visit ${expense.visit_id}` : "",
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    );
  }, [activeTab, allExpenses, search, todayExpenses]);
  const todayTotal = useMemo(
    () =>
      todayExpenses.reduce(
        (total, expense) => total + Number(expense.fare || 0),
        0
      ),
    [todayExpenses]
  );
  const deleteMutation = useMutation({
    mutationFn: deleteDoctorExpense,
    onError: (error) => {
      Alert.alert(
        "Unable to Delete Expense",
        getApiErrorMessage(error, "Unable to delete this expense.")
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.expenses.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.claims.all,
        }),
      ]);
    },
  });
  const proofMutation = useMutation({
    mutationFn: async (expense: DoctorExpense) => {
      if (!expense.proof_file) {
        throw new Error("This expense does not have a receipt.");
      }

      const file = await downloadDoctorExpenseProof(
        expense.id,
        expense.proof_file
      );
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        throw new Error("File viewing is not available on this device.");
      }

      await Sharing.shareAsync(file.uri, {
        dialogTitle: `Expense ${expense.id} receipt`,
        mimeType: getProofMimeType(expense.proof_file),
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Open Receipt",
        error instanceof Error
          ? error.message
          : getApiErrorMessage(error, "Unable to open this receipt.")
      );
    },
  });
  const refresh = async () => {
    await Promise.all([todayQuery.refetch(), allQuery.refetch()]);
  };
  const confirmDelete = (expense: DoctorExpense) => {
    const manual = expense.visit_id === null;
    Alert.alert(
      manual ? "Cancel Manual Expense" : "Delete Expense",
      `${manual ? "Cancel" : "Delete"} the ${formatDoctorCurrency(expense.fare)} expense from ${
        expense.from_location
      } to ${expense.to_location}?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => deleteMutation.mutate(expense.id),
          style: "destructive",
          text: manual ? "Cancel Expense" : "Delete",
        },
      ]
    );
  };

  if (
    (todayQuery.isPending && !todayQuery.data) ||
    (allQuery.isPending && !allQuery.data)
  ) {
    return <DoctorLoadingState label="Loading expenses..." />;
  }

  if (
    (todayQuery.error && !todayQuery.data) ||
    (allQuery.error && !allQuery.data)
  ) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          todayQuery.error ?? allQuery.error,
          "Unable to load doctor expenses."
        )}
        onRetry={() => void refresh()}
        title="Expenses unavailable"
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={todayQuery.isRefetching || allQuery.isRefetching}
          tintColor={colors.primary}
          onRefresh={() => void refresh()}
        />
      }
      style={styles.container}
    >
      <DoctorScreenHeader
        action={
          <TouchableOpacity
            accessibilityLabel="Add expense"
            accessibilityRole="button"
            style={styles.addButton}
            onPress={() => router.push("/(doctor)/expense-form")}
          >
            <Ionicons color={colors.surface} name="add" size={22} />
          </TouchableOpacity>
        }
        subtitle="Record actual travel fares and optional receipts."
        title="Expenses"
      />

      <View style={styles.totalCard}>
        <View>
          <Text style={styles.totalLabel}>Today&apos;s total</Text>
          <Text style={styles.totalValue}>
            {formatDoctorCurrency(todayTotal)}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {todayExpenses.length} item
            {todayExpenses.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View style={styles.tabCard}>
        <DoctorSearchBar
          accessibilityLabel="Search expenses by location, mode, visit, or remarks"
          placeholder="Search expense, visit, or location"
          value={search}
          onChangeText={setSearch}
        />
        <DoctorChoiceChips
          onChange={setActiveTab}
          options={tabs}
          value={activeTab}
        />
      </View>

      {visibleExpenses.length === 0 ? (
        <DoctorEmptyState
          description={
            activeTab === "today"
              ? "Add your first travel expense for today."
              : "Your recorded expenses will appear here."
          }
          icon="wallet-outline"
          title="No expenses"
        />
      ) : (
        visibleExpenses.map((expense) => {
          const canModify =
            expense.available_actions.includes("edit") ||
            (expense.visit_id !== null &&
              expense.status === "draft" &&
              expense.claim_id === null);
          const deleting =
            deleteMutation.isPending &&
            deleteMutation.variables === expense.id;
          const openingProof =
            proofMutation.isPending &&
            proofMutation.variables?.id === expense.id;

          return (
            <DoctorPressableCard
              accessibilityLabel={`Open expense ${expense.id} details`}
              key={expense.id}
              style={styles.card}
              onPress={() =>
                router.push(
                  {
                    pathname: "/(doctor)/expense-details",
                    params: { id: String(expense.id) },
                  } as unknown as Href
                )
              }
            >
              <View style={styles.cardHeader}>
                <View style={styles.route}>
                  <Text style={styles.from}>
                    {expense.visit_id
                      ? `Visit #${expense.visit_id}`
                      : `Expense #${expense.id}`}
                  </Text>
                  <Text numberOfLines={1} style={styles.to}>
                    {expense.from_location} to {expense.to_location}
                  </Text>
                </View>
                <DoctorStatusBadge
                  status={
                    expense.visit_id === null && expense.manual_review_status
                      ? expense.manual_review_status
                      : expense.status
                  }
                />
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>Fare</Text>
                  <Text style={styles.fare}>
                    {formatDoctorCurrency(expense.fare)}
                  </Text>
                </View>
                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>Transport</Text>
                  <Text style={styles.metaValue}>
                    {formatDoctorLabel(expense.transport_mode)}
                  </Text>
                </View>
                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>Date</Text>
                  <Text style={styles.metaValue}>
                    {formatDoctorDate(expense.expense_date)}
                  </Text>
                </View>
              </View>

              {expense.remarks ? (
                <Text style={styles.remarks}>{expense.remarks}</Text>
              ) : null}
              {expense.visit_id === null ? (
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewTitle}>
                    {formatDoctorLabel(expense.expense_category)} · Revision {expense.manual_revision}
                  </Text>
                  <Text style={styles.reviewText}>{expense.manual_reason}</Text>
                  {expense.manual_review_reason ? (
                    <Text style={styles.reviewFeedback}>
                      Review: {expense.manual_review_reason}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.receiptRow}>
                <Ionicons
                  color={
                    expense.proof_file
                      ? colors.primary
                      : colors.textSubtle
                  }
                  name="document-attach-outline"
                  size={18}
                />
                <Text style={styles.receiptText}>
                  {expense.proof_file
                    ? "Receipt attached"
                    : "No receipt attached"}
                </Text>
                {expense.proof_file ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={proofMutation.isPending}
                    style={styles.receiptButton}
                    onPress={() => proofMutation.mutate(expense)}
                  >
                    {openingProof ? (
                      <ActivityIndicator
                        color={colors.primary}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.receiptButtonText}>Open</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>

              {canModify ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.editButton}
                    onPress={() =>
                      router.push({
                        pathname: "/(doctor)/expense-form",
                        params: { id: String(expense.id) },
                      })
                    }
                  >
                    <Ionicons
                      color={colors.primary}
                      name="create-outline"
                      size={18}
                    />
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={deleting}
                    style={styles.deleteButton}
                    onPress={() => confirmDelete(expense)}
                  >
                    {deleting ? (
                      <ActivityIndicator
                        color={colors.danger}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        color={colors.danger}
                        name={expense.visit_id === null ? "close-circle-outline" : "trash-outline"}
                        size={18}
                      />
                    )}
                    <Text style={styles.deleteText}>
                      {deleting
                        ? expense.visit_id === null
                          ? "Cancelling..."
                          : "Deleting..."
                        : expense.visit_id === null
                          ? "Cancel"
                          : "Delete"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.linkedText}>
                  {expense.claim_id
                    ? "Linked to claim"
                    : expense.manual_review_status === "approved"
                      ? "Approved · ready to claim"
                      : expense.manual_review_status === "pending"
                        ? "Awaiting review"
                        : expense.manual_review_status === "changes_requested"
                          ? "Changes requested"
                          : "Read-only"}
                </Text>
              )}
              <View style={styles.detailsHint}>
                <Text style={styles.detailsHintText}>View expense details</Text>
                <Ionicons
                  color={colors.textMuted}
                  name="chevron-forward"
                  size={19}
                />
              </View>
            </DoctorPressableCard>
          );
        })
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
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  totalCard: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lgPlus,
    padding: spacing.xl,
  },
  totalLabel: {
    color: colors.primarySurfaceBright,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  totalValue: {
    color: colors.surface,
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  countBadge: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  countText: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  tabCard: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.panel,
    borderWidth: 1,
    marginBottom: spacing.lgPlus,
    overflow: "hidden",
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
  },
  route: {
    flex: 1,
  },
  from: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  to: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.xs,
  },
  metaRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    marginVertical: spacing.lg,
    paddingVertical: spacing.lg,
  },
  metaBlock: {
    flex: 1,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  fare: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  metaValue: {
    color: colors.textStrong,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  remarks: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginBottom: spacing.lg,
  },
  reviewCard: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  reviewTitle: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  reviewText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  reviewFeedback: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.sm,
  },
  receiptRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  receiptText: {
    color: colors.textMutedDark,
    flex: 1,
    fontSize: typography.size.smallLarge,
  },
  receiptButton: {
    alignItems: "center",
    minHeight: 40,
    justifyContent: "center",
    minWidth: 52,
  },
  receiptButtonText: {
    color: colors.primary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  editButton: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
  },
  editText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
  },
  deleteText: {
    color: colors.danger,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  linkedText: {
    color: colors.textSubtle,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.lg,
    textAlign: "right",
  },
  detailsHint: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  detailsHintText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
});
