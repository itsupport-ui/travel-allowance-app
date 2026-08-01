import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState, useCallback } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminDoctorClaimCard } from "../../src/components/doctor/AdminDoctorClaimUi";
import { WorkflowEmptyState, WorkflowSearchBar, WorkflowSkeletonCard } from "../../src/components/doctor/AdminWorkflowUi";
import { DoctorBackHeader, DoctorChoiceChips, DoctorErrorState } from "../../src/components/doctor/DoctorWorkflowUi";
import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import { queryKeys } from "../../src/query/queryKeys";
import { getAdminDoctorClaimHistory, getPendingDoctorClaims } from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { AdminDoctorClaim, DoctorClaimFilters } from "../../src/types/doctorWorkflow";

const emptyFilters: DoctorClaimFilters = { doctor_id: "", from_date: "", status: "", to_date: "" };
const statusFilters = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Submitted", value: "submitted" },
] as const;
const EMPTY_CLAIMS: AdminDoctorClaim[] = [];
const normalize = (value: string | null | undefined): string => value?.trim().toLowerCase() ?? "";

export default function AdminDoctorClaimsWorkflowScreen() {
  const [filters, setFilters] = useState<DoctorClaimFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<DoctorClaimFilters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const claimsQuery = useQuery({ queryFn: () => getAdminDoctorClaimHistory(appliedFilters), queryKey: [...queryKeys.adminDoctorWorkflow.claims, appliedFilters] });
  const pendingQuery = useQuery({ queryFn: getPendingDoctorClaims, queryKey: queryKeys.adminDoctorWorkflow.pendingClaims });
  const claims = claimsQuery.data ?? EMPTY_CLAIMS;
  const doctors = useMemo(() => [...new Map(claims.map((claim) => [claim.doctor_id, claim.doctor_name])).entries()].map(([id, name]) => ({ id, name })), [claims]);
  const counts = useMemo(() => ({ approved: claims.filter((claim) => claim.status === "approved").length, rejected: claims.filter((claim) => claim.status === "rejected").length, pending: pendingQuery.data?.length ?? claims.filter((claim) => claim.status === "pending").length }), [claims, pendingQuery.data]);
  const searchTerm = normalize(search);
  const visibleClaims = useMemo(() => {
    if (!searchTerm) return claims;
    return claims.filter((claim) => [String(claim.id), claim.doctor_name, claim.claim_date, claim.status, String(claim.total_amount)].some((value) => normalize(value).includes(searchTerm)));
  }, [claims, searchTerm]);
  const openDetails = useCallback((claim: AdminDoctorClaim) => { router.push(`./doctor-workflow-claim-details?id=${claim.id}&doctor_name=${encodeURIComponent(claim.doctor_name)}`); }, []);
  const renderItem = useCallback(({ item }: { item: AdminDoctorClaim }) => <AdminDoctorClaimCard claim={item} onPress={openDetails} />, [openDetails]);

  if (claimsQuery.isPending && !claimsQuery.data) return <ClaimsLoadingState />;
  if (claimsQuery.error && !claimsQuery.data) {
    return <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}><DoctorBackHeader onBack={() => router.replace("/(admin)/doctor-workflow")} title="Doctor Claims" /><DoctorErrorState message={getApiErrorMessage(claimsQuery.error, "Unable to load doctor claims.")} onRetry={() => void claimsQuery.refetch()} title="Unable to load doctor claims" /></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={() => router.replace("/(admin)/doctor-workflow")} title="Doctor Claims" />
      <FlatList
        contentContainerStyle={styles.content}
        data={visibleClaims}
        initialNumToRender={8}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<WorkflowEmptyState description={searchTerm || filterCount(appliedFilters) > 0 ? "Try changing your search or filters." : "No doctor claims are available."} icon="receipt-outline" title="No doctor claims available" />}
        ListFooterComponent={<View style={styles.footerSpace} />}
        ListHeaderComponent={<View><View style={styles.pageHeader}><View style={styles.headerCopy}><Text style={styles.eyebrow}>Doctor Workflow</Text><Text style={styles.title}>Doctor Claims</Text><Text style={styles.subtitle}>{visibleClaims.length} of {claims.length} claims</Text></View><TouchableOpacity accessibilityLabel={showFilters ? "Hide claim filters" : "Show claim filters"} accessibilityRole="button" style={[styles.filterButton, showFilters && styles.filterButtonActive]} onPress={() => setShowFilters((current) => !current)}><Ionicons color={showFilters ? colors.surface : colors.primary} name="options-outline" size={19} /><Text style={[styles.filterButtonText, showFilters && styles.filterButtonTextActive]}>Filters</Text></TouchableOpacity></View><WorkflowSearchBar accessibilityLabel="Search doctor claims" placeholder="Search claim number, doctor, date, or status" value={search} onChangeText={setSearch} /><View style={styles.summaryGrid}><SummaryCard color={colors.warning} icon="time-outline" label="Pending" value={counts.pending} /><SummaryCard color={colors.green} icon="checkmark-circle-outline" label="Approved" value={counts.approved} /><SummaryCard color={colors.danger} icon="close-circle-outline" label="Rejected" value={counts.rejected} /></View>{showFilters ? <FilterCard doctors={doctors} filters={filters} onApply={() => { setAppliedFilters(filters); setShowFilters(false); }} onChange={setFilters} onClear={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); }} /> : null}<Text style={styles.sectionTitle}>All claims</Text></View>}
        refreshControl={<RefreshControl colors={[colors.primary]} refreshing={claimsQuery.isRefetching || pendingQuery.isRefetching} tintColor={colors.primary} onRefresh={() => void Promise.all([claimsQuery.refetch(), pendingQuery.refetch()])} />}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function filterCount(filters: DoctorClaimFilters): number { return Object.values(filters).filter((value) => Boolean(value?.trim())).length; }

function ClaimsLoadingState() { return <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}><DoctorBackHeader onBack={() => router.replace("/(admin)/doctor-workflow")} title="Doctor Claims" /><ScrollView contentContainerStyle={styles.loadingContent}>{Array.from({ length: 6 }, (_, index) => <WorkflowSkeletonCard key={index} variant="claim" />)}</ScrollView></SafeAreaView>; }

function SummaryCard({ color, icon, label, value }: { color: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) { return <View style={styles.summaryCard}><Ionicons color={color} name={icon} size={22} /><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }

function FilterCard({ doctors, filters, onApply, onChange, onClear }: { doctors: { id: number; name: string }[]; filters: DoctorClaimFilters; onApply: () => void; onChange: (filters: DoctorClaimFilters) => void; onClear: () => void }) {
  return <View style={styles.filterCard}><Text style={styles.filterLabel}>Status</Text><DoctorChoiceChips onChange={(value) => onChange({ ...filters, status: value })} options={statusFilters} value={filters.status ?? ""} /><Text style={styles.filterLabel}>Doctor</Text><View style={styles.chipList}><TouchableOpacity accessibilityRole="button" style={[styles.chip, !filters.doctor_id && styles.selectedChip]} onPress={() => onChange({ ...filters, doctor_id: "" })}><Text style={[styles.chipText, !filters.doctor_id && styles.selectedChipText]}>All</Text></TouchableOpacity>{doctors.map((doctor) => { const selected = filters.doctor_id === String(doctor.id); return <TouchableOpacity accessibilityRole="button" key={doctor.id} style={[styles.chip, selected && styles.selectedChip]} onPress={() => onChange({ ...filters, doctor_id: String(doctor.id) })}><Text style={[styles.chipText, selected && styles.selectedChipText]}>{doctor.name}</Text></TouchableOpacity>; })}</View><View style={styles.dateRow}><View style={styles.dateItem}><AppDatePickerField allowClear label="From date" value={filters.from_date ?? ""} onChange={(value) => onChange({ ...filters, from_date: value })} /></View><View style={styles.dateItem}><AppDatePickerField allowClear label="To date" value={filters.to_date ?? ""} onChange={(value) => onChange({ ...filters, to_date: value })} /></View></View><View style={styles.filterActions}><TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={onClear}><Text style={styles.secondaryText}>Clear</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.darkButton} onPress={onApply}><Text style={styles.darkText}>Apply filters</Text></TouchableOpacity></View></View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 }, content: { padding: spacing.xl, paddingBottom: spacing.sectionLg }, footerSpace: { height: spacing.sectionLg }, loadingContent: { padding: spacing.xl }, pageHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.lg }, headerCopy: { flex: 1 }, eyebrow: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, textTransform: "uppercase" }, title: { color: colors.textPrimary, fontSize: typography.size.size27, fontWeight: typography.weight.extrabold, marginTop: spacing.xs }, subtitle: { color: colors.textMuted, fontSize: typography.size.bodySmall, marginTop: spacing.xs }, filterButton: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: spacing.xs, marginTop: spacing.md, minHeight: 42, paddingHorizontal: spacing.md }, filterButtonActive: { backgroundColor: colors.primary }, filterButtonText: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold }, filterButtonTextActive: { color: colors.surface }, summaryGrid: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg, marginTop: spacing.lg }, summaryCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.card, borderWidth: 1, flex: 1, minHeight: 102, padding: spacing.lg }, summaryValue: { color: colors.textPrimary, fontSize: typography.size.titleLarge, fontWeight: typography.weight.extrabold, marginTop: spacing.md }, summaryLabel: { color: colors.textMuted, fontSize: typography.size.small, fontWeight: typography.weight.bold, marginTop: spacing.xs }, filterCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.md, marginBottom: spacing.xl, padding: spacing.lg }, filterLabel: { color: colors.textMutedDark, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, marginTop: spacing.sm, textTransform: "uppercase" }, chipList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, chip: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, selectedChip: { backgroundColor: colors.primarySurface, borderColor: colors.primary }, chipText: { color: colors.textMutedDark, fontSize: typography.size.smallLarge, fontWeight: typography.weight.bold }, selectedChipText: { color: colors.primary }, dateRow: { flexDirection: "row", gap: spacing.md }, dateItem: { flex: 1 }, filterActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }, secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48 }, secondaryText: { color: colors.textMutedDark, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, darkButton: { alignItems: "center", backgroundColor: colors.textPrimary, borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 48 }, darkText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold }, sectionTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold, marginBottom: spacing.md },
});
