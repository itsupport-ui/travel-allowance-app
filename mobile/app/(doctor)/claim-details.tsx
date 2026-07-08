import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
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

import {
  DoctorBackHeader,
  DoctorDetailRow,
  DoctorErrorState,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  downloadDoctorClaimProof,
  getDoctorClaim,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { DoctorExpense } from "../../src/types/doctorWorkflow";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorDateTime,
  formatDoctorLabel,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

const getProofMimeType = (proofName: string): string => {
  const normalized = proofName.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  return "image/jpeg";
};

export default function DoctorClaimDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const claimId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const claimQuery = useQuery({
    enabled: claimId !== null,
    queryFn: () => {
      if (claimId === null) {
        throw new Error("A valid claim ID is required.");
      }
      return getDoctorClaim(claimId);
    },
    queryKey:
      claimId === null
        ? ["doctor", "claims", "detail", "invalid"]
        : queryKeys.doctor.claims.detail(claimId),
  });
  const proofMutation = useMutation({
    mutationFn: async (expense: DoctorExpense) => {
      if (claimId === null || !expense.proof_file) {
        throw new Error("This expense does not have a receipt.");
      }

      const file = await downloadDoctorClaimProof(
        claimId,
        expense.id,
        expense.proof_file
      );
      if (!(await Sharing.isAvailableAsync())) {
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
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/claims");
    }
  };

  if (claimQuery.isPending && !claimQuery.data) {
    return <DoctorLoadingState label="Loading claim..." />;
  }

  const claim = claimQuery.data;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Claim Details" />

      {claimId === null ? (
        <DoctorErrorState
          message="A valid claim ID is required."
          onRetry={goBack}
          title="Invalid claim"
        />
      ) : claimQuery.error && !claim ? (
        <DoctorErrorState
          message={getApiErrorMessage(
            claimQuery.error,
            "Unable to load claim details."
          )}
          onRetry={() => void claimQuery.refetch()}
          title="Claim unavailable"
        />
      ) : claim ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              refreshing={claimQuery.isRefetching}
              tintColor={colors.primary}
              onRefresh={() => void claimQuery.refetch()}
            />
          }
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View>
                <Text style={styles.eyebrow}>Claim #{claim.id}</Text>
                <Text style={styles.claimDate}>
                  {formatDoctorDate(claim.claim_date)}
                </Text>
              </View>
              <DoctorStatusBadge status={claim.status} />
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total amount</Text>
              <Text style={styles.totalValue}>
                {formatDoctorCurrency(claim.total_amount)}
              </Text>
            </View>
            <DoctorDetailRow
              label="Expenses"
              value={claim.expense_count}
            />
            <DoctorDetailRow
              label="Submitted"
              value={formatDoctorDateTime(claim.submitted_at)}
            />
            {claim.status === "approved" ? (
              <DoctorDetailRow
                label="Approved"
                value={formatDoctorDateTime(claim.approved_at)}
              />
            ) : null}
          </View>

          <View
            style={[
              styles.statusCard,
              claim.status === "approved" && styles.approvedCard,
              claim.status === "rejected" && styles.rejectedCard,
            ]}
          >
            <Ionicons
              color={
                claim.status === "approved"
                  ? colors.greenDeep
                  : claim.status === "rejected"
                    ? colors.danger
                    : colors.blueDark
              }
              name={
                claim.status === "approved"
                  ? "checkmark-circle-outline"
                  : claim.status === "rejected"
                    ? "close-circle-outline"
                    : "time-outline"
              }
              size={23}
            />
            <View style={styles.statusContent}>
              <Text style={styles.statusTitle}>
                {claim.status === "approved"
                  ? "Claim approved"
                  : claim.status === "rejected"
                    ? "Claim rejected"
                    : "Awaiting admin review"}
              </Text>
              <Text style={styles.statusText}>
                {claim.status === "rejected"
                  ? claim.rejection_reason ||
                    "No rejection reason was provided."
                  : claim.status === "approved"
                    ? "This claim has completed the approval workflow."
                    : `Current status: ${formatDoctorLabel(claim.status)}.`}
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Included expenses</Text>
            <Text style={styles.count}>{claim.expenses.length}</Text>
          </View>

          {claim.expenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Text style={styles.emptyText}>
                No expense details are available for this claim.
              </Text>
            </View>
          ) : (
            claim.expenses.map((expense) => {
              const opening =
                proofMutation.isPending &&
                proofMutation.variables?.id === expense.id;

              return (
                <View key={expense.id} style={styles.expenseCard}>
                  <View style={styles.expenseHeader}>
                    <View style={styles.expenseRoute}>
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
                  <Text style={styles.expenseMeta}>
                    {formatDoctorLabel(expense.transport_mode)} ·{" "}
                    {formatDoctorDate(expense.expense_date)}
                  </Text>
                  {expense.remarks ? (
                    <Text style={styles.expenseRemarks}>
                      {expense.remarks}
                    </Text>
                  ) : null}
                  {expense.proof_file ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={proofMutation.isPending}
                      style={styles.proofButton}
                      onPress={() => proofMutation.mutate(expense)}
                    >
                      {opening ? (
                        <ActivityIndicator
                          color={colors.primary}
                          size="small"
                        />
                      ) : (
                        <Ionicons
                          color={colors.primary}
                          name="document-attach-outline"
                          size={18}
                        />
                      )}
                      <Text style={styles.proofText}>
                        {opening ? "Opening..." : "View / share receipt"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.noProof}>No receipt attached</Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  claimDate: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  totalRow: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  totalLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
  },
  totalValue: {
    color: colors.primary,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
  },
  statusCard: {
    alignItems: "flex-start",
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    marginVertical: spacing.lgPlus,
    padding: spacing.xl,
  },
  approvedCard: {
    backgroundColor: colors.greenSurfaceLight,
  },
  rejectedCard: {
    backgroundColor: colors.dangerSurface,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  statusText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  count: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.pill,
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  expenseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  expenseHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
  },
  expenseRoute: {
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
  expenseMeta: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.lg,
  },
  expenseRemarks: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.md,
  },
  proofButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  proofText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  noProof: {
    color: colors.textSubtle,
    fontSize: typography.size.small,
    marginTop: spacing.lg,
  },
  emptyExpenses: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: spacing.section,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    textAlign: "center",
  },
});
