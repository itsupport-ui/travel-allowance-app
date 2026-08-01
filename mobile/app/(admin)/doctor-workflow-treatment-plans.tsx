import { colors, radius, spacing, typography } from "@/src/theme";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminTreatmentPlanCard } from "../../src/components/doctor/AdminTreatmentPlanUi";
import { WorkflowEmptyState, WorkflowSearchBar, WorkflowSkeletonCard } from "../../src/components/doctor/AdminWorkflowUi";
import { DoctorBackHeader, DoctorChoiceChips, DoctorErrorState } from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import { getApprovedTreatmentPlans, getPendingTreatmentPlans } from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { TreatmentPlan } from "../../src/types/doctorWorkflow";

type PlanTab = "approved" | "pending";

const tabOptions = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
] as const;

const EMPTY_PLANS: TreatmentPlan[] = [];

const normalize = (value: string | null | undefined): string => value?.trim().toLowerCase() ?? "";

export default function AdminTreatmentPlansWorkflowScreen() {
  const [activeTab, setActiveTab] = useState<PlanTab>("pending");
  const [search, setSearch] = useState("");
  const pendingQuery = useQuery({ queryFn: getPendingTreatmentPlans, queryKey: [...queryKeys.adminDoctorWorkflow.treatmentPlans, "pending"] });
  const approvedQuery = useQuery({ queryFn: getApprovedTreatmentPlans, queryKey: [...queryKeys.adminDoctorWorkflow.treatmentPlans, "approved"] });
  const pendingPlans = pendingQuery.data ?? EMPTY_PLANS;
  const approvedPlans = approvedQuery.data ?? EMPTY_PLANS;
  const plans = activeTab === "pending" ? pendingPlans : approvedPlans;
  const searchTerm = normalize(search);
  const visiblePlans = useMemo(() => {
    if (!searchTerm) return plans;
    return plans.filter((plan) => [plan.patient_name, plan.doctor_name, plan.diagnosis, plan.treatment_plan, plan.medicines].some((value) => normalize(value).includes(searchTerm)));
  }, [plans, searchTerm]);

  const openDetails = useCallback((plan: TreatmentPlan) => {
    router.push(`./doctor-workflow-treatment-plan-details?id=${plan.id}`);
  }, []);

  const renderItem = useCallback(({ item }: { item: TreatmentPlan }) => (
    <AdminTreatmentPlanCard generated={Boolean(item.has_schedule || item.schedule_count)} plan={item} onPress={openDetails} />
  ), [openDetails]);

  if ((pendingQuery.isPending && !pendingQuery.data) || (approvedQuery.isPending && !approvedQuery.data)) {
    return <TreatmentPlanLoadingState />;
  }

  if ((pendingQuery.error && !pendingQuery.data) || (approvedQuery.error && !approvedQuery.data)) {
    const error = pendingQuery.error ?? approvedQuery.error;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={() => router.replace("/(admin)/doctor-workflow")} title="Treatment Plans" />
        <DoctorErrorState message={getApiErrorMessage(error, "Unable to load treatment plans.")} onRetry={() => void Promise.all([pendingQuery.refetch(), approvedQuery.refetch()])} title="Unable to load treatment plans" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={() => router.replace("/(admin)/doctor-workflow")} title="Treatment Plans" />
      <FlatList
        contentContainerStyle={styles.content}
        data={visiblePlans}
        initialNumToRender={8}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<WorkflowEmptyState description={searchTerm ? "Try changing your search." : `No ${activeTab} treatment plans found.`} icon="medkit-outline" title="No treatment plans" />}
        ListFooterComponent={<View style={styles.footerSpace} />}
        ListHeaderComponent={
          <View>
            <View style={styles.pageHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Doctor Workflow</Text>
                <Text style={styles.title}>Treatment Plans</Text>
                <Text style={styles.subtitle}>{visiblePlans.length} of {plans.length} plans</Text>
              </View>
              <View style={styles.countCard}><Text style={styles.countValue}>{pendingPlans.length + approvedPlans.length}</Text><Text style={styles.countLabel}>Total</Text></View>
            </View>
            <WorkflowSearchBar accessibilityLabel="Search treatment plans" placeholder="Search patient, doctor, diagnosis, or treatment" value={search} onChangeText={setSearch} />
            <View style={styles.tabCard}>
              <DoctorChoiceChips onChange={setActiveTab} options={tabOptions} value={activeTab} />
              <View style={styles.tabCounts}><CountPill label="Pending" value={pendingPlans.length} /><CountPill label="Approved" value={approvedPlans.length} /></View>
            </View>
            <Text style={styles.sectionTitle}>{activeTab === "pending" ? "Awaiting approval" : "Approved plans"}</Text>
          </View>
        }
        refreshControl={<RefreshControl colors={[colors.primary]} refreshing={pendingQuery.isRefetching || approvedQuery.isRefetching} tintColor={colors.primary} onRefresh={() => void Promise.all([pendingQuery.refetch(), approvedQuery.refetch()])} />}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function TreatmentPlanLoadingState() {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={() => router.replace("/(admin)/doctor-workflow")} title="Treatment Plans" />
      <ScrollView contentContainerStyle={styles.loadingContent}>{Array.from({ length: 6 }, (_, index) => <WorkflowSkeletonCard key={index} />)}</ScrollView>
    </SafeAreaView>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return <View style={styles.countPill}><Text style={styles.pillValue}>{value}</Text><Text style={styles.pillLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  footerSpace: { height: spacing.sectionLg },
  loadingContent: { padding: spacing.xl },
  pageHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.lg },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  title: { color: colors.textPrimary, fontSize: typography.size.size27, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  subtitle: { color: colors.textMuted, fontSize: typography.size.bodySmall, marginTop: spacing.xs },
  countCard: { alignItems: "center", backgroundColor: colors.primarySurface, borderRadius: radius.control, minWidth: 72, padding: spacing.md },
  countValue: { color: colors.primary, fontSize: typography.size.titleLarge, fontWeight: typography.weight.extrabold },
  countLabel: { color: colors.primaryDark, fontSize: typography.size.captionLarge, fontWeight: typography.weight.bold, marginTop: spacing.xs, textTransform: "uppercase" },
  tabCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, gap: spacing.lg, marginBottom: spacing.xl, marginTop: spacing.lg, padding: spacing.lg },
  tabCounts: { flexDirection: "row", gap: spacing.md },
  countPill: { backgroundColor: colors.neutral100, borderRadius: radius.control, flex: 1, padding: spacing.md },
  pillValue: { color: colors.textPrimary, fontSize: typography.size.titleLarge, fontWeight: typography.weight.extrabold },
  pillLabel: { color: colors.textMuted, fontSize: typography.size.small, fontWeight: typography.weight.bold, marginTop: spacing.xs },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold, marginBottom: spacing.md },
});
