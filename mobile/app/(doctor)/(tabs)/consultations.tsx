import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import { getMyDoctorConsultations } from "../../../src/services/doctorWorkflowService";
import {
  formatDoctorDate,
  formatDoctorLabel,
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
        consultation.patient_phone
          .toLowerCase()
          .includes(normalizedSearch);

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
    <ScrollView
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
        <View style={styles.searchBox}>
          <Ionicons
            color={colors.textSubtle}
            name="search-outline"
            size={19}
          />
          <TextInput
            autoCapitalize="none"
            placeholder="Search name or phone"
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>
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
          <View key={consultation.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.patient}>
                <Text style={styles.patientName}>
                  {consultation.patient_name}
                </Text>
                <Text style={styles.patientPhone}>
                  {consultation.patient_phone}
                </Text>
              </View>
              <DoctorStatusBadge status={consultation.status} />
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Scheduled</Text>
                <Text style={styles.metaValue}>
                  {formatDoctorDate(consultation.scheduled_date)}
                </Text>
                <Text style={styles.metaSubvalue}>
                  {consultation.scheduled_time.slice(0, 5)}
                </Text>
              </View>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Patient decision</Text>
                <Text style={styles.decision}>
                  {formatDoctorLabel(consultation.patient_decision)}
                </Text>
              </View>
            </View>

            <Text style={styles.purposeLabel}>Purpose</Text>
            <Text style={styles.purpose}>{consultation.purpose}</Text>

            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={() =>
                  router.push({
                    pathname: "/(doctor)/consultation-details",
                    params: { id: String(consultation.id) },
                  })
                }
              >
                <Ionicons
                  color={colors.primary}
                  name="eye-outline"
                  size={18}
                />
                <Text style={styles.secondaryButtonText}>View</Text>
              </TouchableOpacity>

              {consultation.status === "scheduled" ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.primaryButton}
                  onPress={() =>
                    router.push({
                      pathname: "/(doctor)/consultation-complete",
                      params: { id: String(consultation.id) },
                    })
                  }
                >
                  <Ionicons
                    color={colors.surface}
                    name="checkmark-circle-outline"
                    size={18}
                  />
                  <Text style={styles.primaryButtonText}>Complete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
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
  metaRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.xl,
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
