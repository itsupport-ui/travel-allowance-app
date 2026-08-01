import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  RefreshControl,
  StyleSheet,
  Text,
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
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import { getMyDoctorConsultations } from "../../../src/services/doctorWorkflowService";
import {
  formatDoctorDate,
} from "../../../src/utils/doctorWorkflow";

type ConsultationFilter =
  | "all"
  | "cancelled"
  | "completed"
  | "scheduled";

const filters: readonly {
  label: string;
  value: ConsultationFilter;
}[] = [
  { label: "All", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export default function DoctorConsultationsScreen() {
  const [filter, setFilter] = useState<ConsultationFilter>("all");
  const [search, setSearch] = useState("");
  const consultationsQuery = useQuery({
    queryFn: getMyDoctorConsultations,
    queryKey: queryKeys.doctor.consultations.all,
  });
  const consultations = useMemo(
    () => consultationsQuery.data ?? [],
    [consultationsQuery.data]
  );
  const visibleConsultations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return consultations.filter((consultation) => {
      const matchesFilter =
        filter === "all" || consultation.status === filter;
      const matchesSearch =
        !normalizedSearch ||
        consultation.patient_name
          .toLowerCase()
          .includes(normalizedSearch) ||
        consultation.patient_phone.toLowerCase().includes(normalizedSearch) ||
        consultation.purpose.toLowerCase().includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [consultations, filter, search]);

  if (consultationsQuery.isPending && !consultationsQuery.data) {
    return <DoctorLoadingState label="Loading consultations..." />;
  }

  if (consultationsQuery.error && !consultationsQuery.data) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          consultationsQuery.error,
          "Unable to load your consultations."
        )}
        onRetry={() => void consultationsQuery.refetch()}
        title="Consultations unavailable"
      />
    );
  }

  return (
    <FormScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={consultationsQuery.isRefetching}
          tintColor={colors.primary}
          onRefresh={() => void consultationsQuery.refetch()}
        />
      }
      style={styles.container}
    >
      <DoctorScreenHeader
        subtitle="Review assigned patient calls and record outcomes."
        title="Consultations"
      />

      <View style={styles.filters}>
        <DoctorSearchBar
          accessibilityLabel="Search consultations by patient, phone, or purpose"
          placeholder="Search patient, phone, or purpose"
          value={search}
          onChangeText={setSearch}
        />
        <DoctorChoiceChips
          onChange={setFilter}
          options={filters}
          value={filter}
        />
      </View>

      {visibleConsultations.length === 0 ? (
        <DoctorEmptyState
          description={
            consultations.length === 0
              ? "No consultations are currently assigned to you."
              : "No consultations match the selected filters."
          }
          icon="call-outline"
          title="No consultations"
        />
      ) : (
        visibleConsultations.map((consultation) => (
          <DoctorPressableCard
            accessibilityLabel={`Open consultation for ${consultation.patient_name}`}
            key={consultation.id}
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(doctor)/consultation-details",
                params: { id: String(consultation.id) },
              })
            }
          >
            <View style={styles.cardHeader}>
              <View style={styles.patient}>
                <Text style={styles.patientName}>
                  {consultation.patient_name}
                </Text>
                <Text style={styles.cardCaption}>Patient consultation</Text>
              </View>
              <DoctorStatusBadge status={consultation.status} />
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Scheduled date</Text>
                <Text style={styles.metaValue}>
                  {formatDoctorDate(consultation.scheduled_date)}
                </Text>
              </View>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Scheduled time</Text>
                <Text style={styles.metaValue}>
                  {consultation.scheduled_time.slice(0, 5)}
                </Text>
              </View>
              <View style={styles.chevron}>
                <Ionicons
                  color={colors.textMuted}
                  name="chevron-forward"
                  size={20}
                />
              </View>
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
  patient: {
    flex: 1,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  patientPhone: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  cardCaption: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  metaRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xl,
    marginVertical: spacing.lg,
    paddingVertical: spacing.lg,
  },
  metaBlock: {
    flex: 1,
  },
  chevron: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
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
  metaSubvalue: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  decision: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  purposeLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  purpose: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 44,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
