import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorDetailRow,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  approveDoctorClaim,
  downloadDoctorClaimProof,
  getAdminDoctorClaimHistory,
  getDoctorClaim,
  getPendingDoctorClaims,
  rejectDoctorClaim,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type {
  AdminDoctorClaim,
  DoctorClaimDetails,
  DoctorClaimFilters,
  DoctorExpense,
} from "../../src/types/doctorWorkflow";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorDateTime,
  formatDoctorLabel,
} from "../../src/utils/doctorWorkflow";

const emptyFilters = {
  doctor_id: "",
  from_date: "",
  status: "",
  to_date: "",
};

const statusFilters = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Submitted", value: "submitted" },
] as const;

const EMPTY_CLAIMS: AdminDoctorClaim[] = [];
const DOCTOR_WORKFLOW_ROUTE = "/(admin)/doctor-workflow" as const;

const goToDoctorWorkflow = () => {
  router.replace(DOCTOR_WORKFLOW_ROUTE);
};

const getProofMimeType = (proofName: string): string => {
  const normalized = proofName.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  return "image/jpeg";
};

export default function AdminDoctorClaimsWorkflowScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] =
    useState<DoctorClaimFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<DoctorClaimFilters>(emptyFilters);
  const [selectedClaim, setSelectedClaim] =
    useState<AdminDoctorClaim | null>(null);
  const [rejectingClaim, setRejectingClaim] =
    useState<AdminDoctorClaim | DoctorClaimDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const claimsQuery = useQuery({
    queryFn: () => getAdminDoctorClaimHistory(appliedFilters),
    queryKey: [...queryKeys.adminDoctorWorkflow.claims, appliedFilters],
  });
  const pendingQuery = useQuery({
    queryFn: getPendingDoctorClaims,
    queryKey: queryKeys.adminDoctorWorkflow.pendingClaims,
  });
  const detailQuery = useQuery({
    enabled: selectedClaim !== null,
    queryFn: () => getDoctorClaim(selectedClaim?.id ?? 0),
    queryKey: selectedClaim
      ? queryKeys.adminDoctorWorkflow.claimDetail(selectedClaim.id)
      : ["admin", "doctor-workflow", "claims", "detail", "none"],
  });
  const claims = claimsQuery.data ?? EMPTY_CLAIMS;
  const doctors = useMemo(() => {
    const doctorMap = new Map<number, string>();
    claims.forEach((claim) => {
      doctorMap.set(claim.doctor_id, claim.doctor_name);
    });
    return [...doctorMap.entries()].map(([id, name]) => ({ id, name }));
  }, [claims]);
  const counts = useMemo(
    () => ({
      approved: claims.filter((claim) => claim.status === "approved").length,
      pending: claims.filter((claim) => claim.status === "pending").length,
      rejected: claims.filter((claim) => claim.status === "rejected").length,
    }),
    [claims]
  );

  const invalidateClaims = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.adminDoctorWorkflow.claims,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.adminDoctorWorkflow.pendingClaims,
      }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: approveDoctorClaim,
    onError: (error) => {
      Alert.alert(
        "Unable to Approve Claim",
        getApiErrorMessage(error, "Unable to approve this doctor claim.")
      );
    },
    onSuccess: async () => {
      await invalidateClaims();
      setSelectedClaim(null);
      Alert.alert("Doctor Claim Approved", "The claim was approved.");
    },
  });
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectingClaim) {
        throw new Error("Select a claim first.");
      }
      return rejectDoctorClaim(rejectingClaim.id, rejectionReason.trim());
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Reject Claim",
        getApiErrorMessage(error, "Unable to reject this doctor claim.")
      );
    },
    onSuccess: async () => {
      await invalidateClaims();
      setSelectedClaim(null);
      setRejectingClaim(null);
      setRejectionReason("");
      Alert.alert("Doctor Claim Rejected", "The claim was rejected.");
    },
  });
  const proofMutation = useMutation({
    mutationFn: async (expense: DoctorExpense) => {
      const claimId = detailQuery.data?.id ?? selectedClaim?.id;
      if (!claimId || !expense.proof_file) {
        throw new Error("This expense does not have a proof file.");
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
        dialogTitle: `Expense ${expense.id} proof`,
        mimeType: getProofMimeType(expense.proof_file),
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Open Proof",
        error instanceof Error
          ? error.message
          : getApiErrorMessage(error, "Unable to open this proof file.")
      );
    },
  });

  const confirmApprove = (claim: AdminDoctorClaim | DoctorClaimDetails) => {
    Alert.alert(
      "Approve Doctor Claim?",
      `Approve claim #${claim.id} for ${formatDoctorCurrency(
        claim.total_amount
      )}?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => approveMutation.mutate(claim.id),
          text: "Approve",
        },
      ]
    );
  };
  const openReject = (claim: AdminDoctorClaim | DoctorClaimDetails) => {
    setFormError(null);
    setRejectingClaim(claim);
    setRejectionReason("");
  };
  const submitReject = () => {
    if (!rejectionReason.trim()) {
      setFormError("Rejection reason is required.");
      return;
    }
    setFormError(null);
    rejectMutation.mutate();
  };

  if (claimsQuery.isPending && !claimsQuery.data) {
    return <DoctorLoadingState label="Loading doctor claims..." />;
  }

  if (claimsQuery.error && !claimsQuery.data) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader
          onBack={goToDoctorWorkflow}
          title="Doctor Claims"
        />
        <DoctorErrorState
          message={getApiErrorMessage(
            claimsQuery.error,
            "Unable to load doctor claims."
          )}
          onRetry={() => void claimsQuery.refetch()}
          title="Doctor claims unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        onBack={goToDoctorWorkflow}
        title="Doctor Claims"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              refreshing={
                claimsQuery.isRefetching || pendingQuery.isRefetching
              }
              tintColor={colors.primary}
              onRefresh={() =>
                void Promise.all([
                  claimsQuery.refetch(),
                  pendingQuery.refetch(),
                ])
              }
            />
          }
        >
          <Text style={styles.eyebrow}>Doctor Workflow</Text>
          <Text style={styles.title}>Doctor Claims</Text>
          <Text style={styles.subtitle}>
            Review pending, approved, and rejected doctor expense claims.
          </Text>

          <View style={styles.summaryGrid}>
            <SummaryCard
              color={colors.warning}
              icon="time-outline"
              label="Pending"
              value={pendingQuery.data?.length ?? counts.pending}
            />
            <SummaryCard
              color={colors.green}
              icon="checkmark-circle-outline"
              label="Approved"
              value={counts.approved}
            />
            <SummaryCard
              color={colors.danger}
              icon="close-circle-outline"
              label="Rejected"
              value={counts.rejected}
            />
          </View>

          <FilterCard
            doctors={doctors}
            filters={filters}
            onApply={() => setAppliedFilters(filters)}
            onChange={setFilters}
            onClear={() => {
              setFilters(emptyFilters);
              setAppliedFilters(emptyFilters);
            }}
          />

          {rejectingClaim ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Reject doctor claim</Text>
              <Text style={styles.panelSubtitle}>
                Claim #{rejectingClaim.id}
              </Text>
              <DoctorField
                label="Rejection reason"
                multiline
                required
                value={rejectionReason}
                onChangeText={setRejectionReason}
              />
              {formError ? (
                <Text style={styles.formError}>{formError}</Text>
              ) : null}
              <View style={styles.panelActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={rejectMutation.isPending}
                  style={styles.secondaryButton}
                  onPress={goToDoctorWorkflow}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={rejectMutation.isPending}
                  style={[
                    styles.submitButton,
                    styles.destructiveButton,
                    rejectMutation.isPending && styles.disabledButton,
                  ]}
                  onPress={submitReject}
                >
                  {rejectMutation.isPending ? (
                    <ActivityIndicator color={colors.surface} size="small" />
                  ) : null}
                  <Text style={styles.submitButtonText}>
                    {rejectMutation.isPending ? "Rejecting..." : "Reject"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {selectedClaim ? (
            <ClaimDetailPanel
              approving={approveMutation.isPending}
              claim={detailQuery.data ?? null}
              claimSummary={selectedClaim}
              loading={detailQuery.isPending}
              openingExpenseId={proofMutation.variables?.id ?? null}
              openingProof={proofMutation.isPending}
              onApprove={confirmApprove}
              onClose={() => setSelectedClaim(null)}
              onOpenProof={(expense) => proofMutation.mutate(expense)}
              onReject={openReject}
              onRetry={() => void detailQuery.refetch()}
              error={
                detailQuery.error
                  ? getApiErrorMessage(
                      detailQuery.error,
                      "Unable to load claim details."
                    )
                  : null
              }
            />
          ) : null}

          {claims.length === 0 ? (
            <DoctorEmptyState
              description="No doctor claims match the selected filters."
              icon="receipt-outline"
              title="No doctor claims"
            />
          ) : (
            claims.map((claim) => (
              <ClaimCard
                busy={
                  approveMutation.isPending ||
                  rejectMutation.isPending ||
                  detailQuery.isFetching
                }
                claim={claim}
                key={claim.id}
                onApprove={confirmApprove}
                onReject={openReject}
                onView={setSelectedClaim}
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryCard({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons color={color} name={icon} size={22} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FilterCard({
  doctors,
  filters,
  onApply,
  onChange,
  onClear,
}: {
  doctors: { id: number; name: string }[];
  filters: DoctorClaimFilters;
  onApply: () => void;
  onChange: (filters: DoctorClaimFilters) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.filterCard}>
      <Text style={styles.filterLabel}>Status</Text>
      <DoctorChoiceChips
        onChange={(value) => onChange({ ...filters, status: value })}
        options={statusFilters}
        value={(filters.status ?? "") as (typeof statusFilters)[number]["value"]}
      />
      <Text style={styles.filterLabel}>Doctor</Text>
      <View style={styles.chipList}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.chip,
            !filters.doctor_id && styles.selectedChip,
          ]}
          onPress={() => onChange({ ...filters, doctor_id: "" })}
        >
          <Text
            style={[
              styles.chipText,
              !filters.doctor_id && styles.selectedChipText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {doctors.map((doctor) => {
          const selected = filters.doctor_id === String(doctor.id);
          return (
            <TouchableOpacity
              accessibilityRole="button"
              key={doctor.id}
              style={[styles.chip, selected && styles.selectedChip]}
              onPress={() =>
                onChange({ ...filters, doctor_id: String(doctor.id) })
              }
            >
              <Text
                style={[
                  styles.chipText,
                  selected && styles.selectedChipText,
                ]}
              >
                {doctor.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <AppDatePickerField
        allowClear
        label="From date"
        value={filters.from_date ?? ""}
        onChange={(value) => onChange({ ...filters, from_date: value })}
      />
      <AppDatePickerField
        allowClear
        label="To date"
        value={filters.to_date ?? ""}
        onChange={(value) => onChange({ ...filters, to_date: value })}
      />
      <View style={styles.filterActions}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={onClear}
        >
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.darkButton}
          onPress={onApply}
        >
          <Text style={styles.darkButtonText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ClaimDetailPanel({
  approving,
  claim,
  claimSummary,
  error,
  loading,
  onApprove,
  onClose,
  onOpenProof,
  onReject,
  onRetry,
  openingExpenseId,
  openingProof,
}: {
  approving: boolean;
  claim: DoctorClaimDetails | null;
  claimSummary: AdminDoctorClaim;
  error: string | null;
  loading: boolean;
  onApprove: (claim: DoctorClaimDetails) => void;
  onClose: () => void;
  onOpenProof: (expense: DoctorExpense) => void;
  onReject: (claim: DoctorClaimDetails) => void;
  onRetry: () => void;
  openingExpenseId: number | null;
  openingProof: boolean;
}) {
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <View>
          <Text style={styles.panelTitle}>Claim #{claimSummary.id}</Text>
          <Text style={styles.panelSubtitle}>
            {claimSummary.doctor_name} · {formatDoctorDate(claimSummary.claim_date)}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.closeButton}
          onPress={onClose}
        >
          <Ionicons color={colors.textMuted} name="close" size={21} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.inlineState}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.inlineStateText}>Loading details...</Text>
        </View>
      ) : error ? (
        <View style={styles.inlineState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.inlineRetry}
            onPress={onRetry}
          >
            <Text style={styles.inlineRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : claim ? (
        <>
          <View style={styles.detailRows}>
            <DoctorDetailRow label="Status" value={<DoctorStatusBadge status={claim.status} />} />
            <DoctorDetailRow
              label="Total"
              value={formatDoctorCurrency(claim.total_amount)}
            />
            <DoctorDetailRow
              label="Expenses"
              value={String(claim.expense_count)}
            />
            <DoctorDetailRow
              label="Submitted"
              value={formatDoctorDateTime(claim.submitted_at)}
            />
            {claim.status === "rejected" ? (
              <DoctorDetailRow
                label="Rejection reason"
                value={claim.rejection_reason || "Not available"}
              />
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Included expenses</Text>
          {claim.expenses.length === 0 ? (
            <Text style={styles.emptyText}>No expense records found.</Text>
          ) : (
            claim.expenses.map((expense) => {
              const opening =
                openingProof && openingExpenseId === expense.id;
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
                  {expense.proof_file ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={openingProof}
                      style={styles.proofButton}
                      onPress={() => onOpenProof(expense)}
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
                        {opening ? "Opening..." : "View / share proof"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.noProof}>No proof attached</Text>
                  )}
                </View>
              );
            })
          )}

          {claim.status === "pending" ? (
            <View style={styles.cardActions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.smallButton, styles.rejectButton]}
                onPress={() => onReject(claim)}
              >
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={approving}
                style={[
                  styles.smallButton,
                  styles.approveButton,
                  approving && styles.disabledButton,
                ]}
                onPress={() => onApprove(claim)}
              >
                {approving ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : null}
                <Text style={styles.approveButtonText}>Approve</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ClaimCard({
  busy,
  claim,
  onApprove,
  onReject,
  onView,
}: {
  busy: boolean;
  claim: AdminDoctorClaim;
  onApprove: (claim: AdminDoctorClaim) => void;
  onReject: (claim: AdminDoctorClaim) => void;
  onView: (claim: AdminDoctorClaim) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.doctorName}>{claim.doctor_name}</Text>
          <Text style={styles.mutedText}>Claim #{claim.id}</Text>
        </View>
        <DoctorStatusBadge status={claim.status} />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>
            {formatDoctorDate(claim.claim_date)}
          </Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Expenses</Text>
          <Text style={styles.metaValue}>{claim.expense_count}</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Total</Text>
          <Text style={styles.metaValue}>
            {formatDoctorCurrency(claim.total_amount)}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={[styles.smallButton, styles.viewButton]}
          onPress={() => onView(claim)}
        >
          <Text style={styles.viewButtonText}>View</Text>
        </TouchableOpacity>
        {claim.status === "pending" ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              style={[styles.smallButton, styles.rejectButton]}
              onPress={() => onReject(claim)}
            >
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              style={[styles.smallButton, styles.approveButton]}
              onPress={() => onApprove(claim)}
            >
              <Text style={styles.approveButtonText}>Approve</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
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
    marginBottom: spacing.xl,
    marginTop: spacing.s5,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexBasis: "30%",
    flexGrow: 1,
    minHeight: 106,
    padding: spacing.lg,
    elevation: shadows.elevation.low,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y1,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.xs,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.md,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  filterCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  filterLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  chipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lgPlus,
    paddingVertical: spacing.md,
  },
  selectedChip: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  selectedChipText: {
    color: colors.primary,
  },
  filterActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xs,
  },
  panelSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginBottom: spacing.lg,
  },
  panelActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryButtonText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  darkButton: {
    alignItems: "center",
    backgroundColor: colors.textPrimary,
    borderRadius: radius.control,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  darkButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
  },
  destructiveButton: {
    backgroundColor: colors.danger,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.55,
  },
  formError: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    marginBottom: spacing.md,
  },
  detailPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  detailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  closeButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  inlineState: {
    alignItems: "center",
    padding: spacing.xl,
  },
  inlineStateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.bodySmall,
    textAlign: "center",
  },
  inlineRetry: {
    marginTop: spacing.md,
    minHeight: 36,
    justifyContent: "center",
  },
  inlineRetryText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  detailRows: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  card: {
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
  },
  cardTitleBlock: {
    flex: 1,
  },
  doctorName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
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
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  metaValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  smallButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flexGrow: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  viewButton: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
  },
  viewButtonText: {
    color: colors.primary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  rejectButton: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorderStrong,
    borderWidth: 1,
  },
  rejectButtonText: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  expenseCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.lg,
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
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    textAlign: "center",
  },
});
