import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, type ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorBackHeader,
  DoctorDetailRow,
  DoctorErrorState,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  getManualDoctorExpenseReviewHistory,
  getMyDoctorExpenses,
} from "../../src/services/doctorWorkflowService";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorLabel,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

export default function DoctorExpenseDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const expenseId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const expensesQuery = useQuery({
    enabled: expenseId !== null,
    queryFn: getMyDoctorExpenses,
    queryKey: queryKeys.doctor.expenses.mine,
  });
  const expense = useMemo(
    () => expensesQuery.data?.find((item) => item.id === expenseId) ?? null,
    [expenseId, expensesQuery.data]
  );
  const historyQuery = useQuery({
    enabled: expense?.visit_id === null,
    queryFn: () => getManualDoctorExpenseReviewHistory(expenseId as number),
    queryKey: ["doctor", "expenses", expenseId, "review-history"],
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(doctor)/(tabs)/expenses");
  };

  if (expenseId === null) {
    return (
      <SafeAreaView style={styles.container}>
        <DoctorBackHeader onBack={goBack} title="Expense Details" />
        <DoctorErrorState
          message="The selected expense is invalid."
          onRetry={goBack}
          title="Invalid expense"
        />
      </SafeAreaView>
    );
  }

  if (expensesQuery.isPending && !expensesQuery.data) {
    return <DoctorLoadingState label="Loading expense details..." />;
  }

  if (expensesQuery.error || !expense) {
    return (
      <SafeAreaView style={styles.container}>
        <DoctorBackHeader onBack={goBack} title="Expense Details" />
        <DoctorErrorState
          message="This expense could not be loaded."
          onRetry={() => void expensesQuery.refetch()}
          title="Expense unavailable"
        />
      </SafeAreaView>
    );
  }

  const canEdit =
    expense.available_actions.includes("edit") ||
    (expense.visit_id !== null &&
      expense.status === "draft" &&
      expense.claim_id === null);

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <DoctorBackHeader
        action={
          canEdit ? (
            <TouchableOpacity
              accessibilityLabel="Edit expense"
              accessibilityRole="button"
              style={styles.headerAction}
              onPress={() =>
                router.push({
                  pathname: "/(doctor)/expense-form",
                  params: { id: String(expense.id) },
                })
              }
            >
              <Ionicons color={colors.primary} name="create-outline" size={21} />
            </TouchableOpacity>
          ) : null
        }
        onBack={goBack}
        title="Expense Details"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={expensesQuery.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void expensesQuery.refetch()}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.warning} name="wallet-outline" size={25} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>EXPENSE #{expense.id}</Text>
            <Text style={styles.amount}>{formatDoctorCurrency(expense.fare)}</Text>
            <Text style={styles.date}>{formatDoctorDate(expense.expense_date)}</Text>
          </View>
          <DoctorStatusBadge
            status={
              expense.visit_id === null && expense.manual_review_status
                ? expense.manual_review_status
                : expense.status
            }
          />
        </View>

        <DetailSection icon="navigate-outline" title="Travel">
          <DoctorDetailRow label="From" value={expense.from_location} />
          <DoctorDetailRow label="To" value={expense.to_location} />
          <DoctorDetailRow
            label="Travel mode"
            value={formatDoctorLabel(expense.transport_mode)}
          />
          <DoctorDetailRow
            label="Distance"
            value={
              expense.distance_km === null
                ? "Not recorded"
                : `${expense.distance_km.toFixed(2)} km`
            }
          />
        </DetailSection>

        <DetailSection icon="person-outline" title="Patient & visit">
          <DoctorDetailRow
            label="Linked visit"
            value={expense.visit_id ? `Visit #${expense.visit_id}` : "Not linked"}
          />
          <DoctorDetailRow
            label="Workday"
            value={expense.workday_id ? `Workday #${expense.workday_id}` : "Not linked"}
          />
        </DetailSection>

        <DetailSection icon="document-text-outline" title="Claim & approval">
          <DoctorDetailRow label="Amount" value={formatDoctorCurrency(expense.fare)} />
          <DoctorDetailRow
            label="Claim"
            value={expense.claim_id ? `Claim #${expense.claim_id}` : "Not submitted"}
          />
          <DoctorDetailRow
            label="Receipt"
            value={expense.proof_file ? "Attached" : "Not attached"}
          />
          <DoctorDetailRow label="Remarks" value={expense.remarks || "No remarks"} />
          <DoctorDetailRow
            label="Category"
            value={formatDoctorLabel(expense.expense_category)}
          />
          {expense.visit_id === null ? (
            <>
              <DoctorDetailRow label="Manual reason" value={expense.manual_reason || "Not recorded"} />
              <DoctorDetailRow label="Revision" value={String(expense.manual_revision)} />
              <DoctorDetailRow
                label="Review feedback"
                value={expense.manual_review_reason || "Awaiting review"}
              />
            </>
          ) : null}
        </DetailSection>

        <DetailSection icon="time-outline" title="Timeline">
          <DoctorDetailRow label="Travel date" value={formatDoctorDate(expense.expense_date)} />
          <DoctorDetailRow label="Created" value={formatDoctorDate(expense.created_at)} />
          {expense.visit_id === null ? (
            historyQuery.isPending ? (
              <Text style={styles.historyState}>Loading review history...</Text>
            ) : historyQuery.error ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => void historyQuery.refetch()}>
                <Text style={styles.historyError}>Unable to load review history. Tap to retry.</Text>
              </TouchableOpacity>
            ) : (
              (historyQuery.data ?? []).map((event) => (
                <View key={event.id} style={styles.historyEvent}>
                  <Text style={styles.historyTitle}>
                    {formatDoctorLabel(event.event_type)} · Revision {event.revision}
                  </Text>
                  <Text style={styles.historyReason}>{event.reason}</Text>
                  <Text style={styles.historyMeta}>
                    {event.actor_name ?? `User #${event.actor_id}`} · {formatDoctorDate(event.created_at)}
                  </Text>
                </View>
              ))
            )
          ) : null}
        </DetailSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons color={colors.primary} name={icon} size={19} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  headerAction: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  heroCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.panel,
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.lgPlus,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.warningSurface,
    borderRadius: radius.card,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroCopy: { flex: 1 },
  eyebrow: { color: colors.textMuted, fontSize: typography.size.caption, fontWeight: typography.weight.extrabold },
  amount: { color: colors.textPrimary, fontSize: typography.size.titleLarge, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  date: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.xs },
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.panel,
    borderWidth: 1,
    marginBottom: spacing.lgPlus,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, height: 36, justifyContent: "center", width: 36 },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.size.body, fontWeight: typography.weight.extrabold },
  historyState: { color: colors.textMuted, fontSize: typography.size.small, paddingVertical: spacing.lg },
  historyError: { color: colors.danger, fontSize: typography.size.small, paddingVertical: spacing.lg },
  historyEvent: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.lg },
  historyTitle: { color: colors.textStrong, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  historyReason: { color: colors.textMutedDark, fontSize: typography.size.small, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.xs },
  historyMeta: { color: colors.textSubtle, fontSize: typography.size.tiny, marginTop: spacing.xs },
});
