import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { FormScrollView } from "../../../src/components/layout/FormScrollView";
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
  getMyDoctorVisits,
  getMyTreatmentPlans,
} from "../../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import { formatDoctorDate } from "../../../src/utils/doctorWorkflow";

type PlanFilter =
  | "all"
  | "approved"
  | "pending"
  | "rejected"
  | "submitted";

const filters: readonly { label: string; value: PlanFilter }[] = [
  { label: "All", value: "all" },
  { label: "Submitted", value: "submitted" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Pending", value: "pending" },
];

export default function DoctorTreatmentPlansScreen() {
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [search, setSearch] = useState("");
  const plansQuery = useQuery({
    queryFn: getMyTreatmentPlans,
    queryKey: queryKeys.doctor.treatmentPlans.all,
  });
  const visitsQuery = useQuery({
    queryFn: getMyDoctorVisits,
    queryKey: queryKeys.doctor.treatmentPlans.visits,
  });
  const plans = useMemo(
    () => plansQuery.data ?? [],
    [plansQuery.data]
  );
  const eligibleVisits = useMemo(() => {
    const plannedVisitIds = new Set(
      plans.map((plan) => plan.doctor_visit_id)
    );
    return (visitsQuery.data ?? []).filter(
      (visit) =>
        visit.status === "visited" && !plannedVisitIds.has(visit.id)
    );
  }, [plans, visitsQuery.data]);
  const visiblePlans = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...plans]
      .filter((plan) => {
        const matchesFilter =
          filter === "all" || plan.status === filter;
        const matchesSearch =
          !normalizedSearch ||
          plan.patient_name.toLowerCase().includes(normalizedSearch) ||
          (plan.treatment_plan ?? "").toLowerCase().includes(normalizedSearch) ||
          (plan.diagnosis ?? "").toLowerCase().includes(normalizedSearch) ||
          (plan.doctor_name ?? "").toLowerCase().includes(normalizedSearch);
        return matchesFilter && matchesSearch;
      })
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime()
      );
  }, [filter, plans, search]);

  const refresh = async () => {
    await Promise.all([plansQuery.refetch(), visitsQuery.refetch()]);
  };

  if (plansQuery.isPending && !plansQuery.data) {
    return <DoctorLoadingState label="Loading treatment plans..." />;
  }

  if (plansQuery.error && !plansQuery.data) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          plansQuery.error,
          "Unable to load treatment plans."
        )}
        onRetry={() => void refresh()}
        title="Treatment plans unavailable"
      />
    );
  }

  return (
    <FormScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={plansQuery.isRefetching || visitsQuery.isRefetching}
          tintColor={colors.primary}
          onRefresh={() => void refresh()}
        />
      }
      style={styles.container}
    >
      <DoctorScreenHeader
        action={
          <TouchableOpacity
            accessibilityLabel="Create treatment plan"
            accessibilityRole="button"
            accessibilityState={{
              disabled: visitsQuery.isPending || eligibleVisits.length === 0,
            }}
            disabled={visitsQuery.isPending || eligibleVisits.length === 0}
            style={[
              styles.addButton,
              (visitsQuery.isPending || eligibleVisits.length === 0) &&
                styles.disabledButton,
            ]}
            onPress={() =>
              router.push("/(doctor)/treatment-plan-create")
            }
          >
            <Ionicons
              color={colors.surface}
              name="add"
              size={22}
            />
          </TouchableOpacity>
        }
        subtitle="Create plans for visited patients and monitor approvals."
        title="Treatment Plans"
      />

      {visitsQuery.error ? (
        <View style={styles.warningCard}>
          <Ionicons
            color={colors.warning}
            name="alert-circle-outline"
            size={20}
          />
          <Text style={styles.warningText}>
            Eligible visits could not be loaded. Pull to retry.
          </Text>
        </View>
      ) : eligibleVisits.length === 0 ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            No completed visits are waiting for a treatment plan.
          </Text>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            {eligibleVisits.length} visited patient
            {eligibleVisits.length === 1 ? "" : "s"} eligible for a new
            plan.
          </Text>
        </View>
      )}

      <View style={styles.filters}>
        <DoctorSearchBar
          accessibilityLabel="Search treatment plans by patient, treatment, diagnosis, or doctor"
          placeholder="Search patient, treatment, or doctor"
          value={search}
          onChangeText={setSearch}
        />
        <DoctorChoiceChips
          onChange={setFilter}
          options={filters}
          value={filter}
        />
      </View>

      {visiblePlans.length === 0 ? (
        <DoctorEmptyState
          description={
            plans.length === 0
              ? "Plans you submit will appear here."
              : "No plans match the selected filters."
          }
          icon="medkit-outline"
          title="No treatment plans"
        />
      ) : (
        visiblePlans.map((plan) => (
          <DoctorPressableCard
            accessibilityLabel={`Open treatment plan for ${plan.patient_name}`}
            key={plan.id}
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(doctor)/treatment-plan-details",
                params: { id: String(plan.id) },
              })
            }
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.patientName}>{plan.patient_name}</Text>
                <Text style={styles.visitId}>
                  Visit #{plan.doctor_visit_id}
                </Text>
              </View>
              <DoctorStatusBadge status={plan.status} />
            </View>
            <Text style={styles.label}>Treatment</Text>
            <Text numberOfLines={2} style={styles.diagnosis}>
              {plan.treatment_plan || plan.diagnosis || "Treatment not recorded"}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>
                {plan.doctor_name ?? `Doctor #${plan.doctor_id}`}
              </Text>
              <Text style={styles.footerText}>
                {plan.sessions_required
                  ? `${plan.schedule_count ?? 0}/${plan.sessions_required} sessions`
                  : formatDoctorDate(plan.created_at)}
              </Text>
              <Ionicons
                color={colors.textSubtle}
                name="chevron-forward"
                size={18}
              />
            </View>
          </DoctorPressableCard>
        ))
      )}
    </FormScrollView>
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
  disabledButton: {
    opacity: 0.4,
  },
  warningCard: {
    alignItems: "center",
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  warningText: {
    color: colors.warningDark,
    flex: 1,
    fontSize: typography.size.bodySmall,
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
    fontWeight: typography.weight.semibold,
  },
  filters: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  searchBox: {
    alignItems: "center",
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    paddingVertical: spacing.md,
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
  cardTitleBlock: {
    flex: 1,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  visitId: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
    textTransform: "uppercase",
  },
  diagnosis: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  cardFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  footerText: {
    color: colors.textMutedDark,
    flex: 1,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
});
