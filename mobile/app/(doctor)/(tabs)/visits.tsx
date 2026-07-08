import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
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
  getDoctorVisitDashboard,
  getMyDoctorVisits,
} from "../../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import type { DoctorVisit } from "../../../src/types/doctorWorkflow";
import {
  formatDoctorDate,
  getLocalIsoDate,
} from "../../../src/utils/doctorWorkflow";

type VisitFilter = "all" | "today" | "upcoming";

const filters: readonly { label: string; value: VisitFilter }[] = [
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "All", value: "all" },
];

const sortVisits = (visits: DoctorVisit[]): DoctorVisit[] =>
  [...visits].sort((left, right) => {
    const dateComparison = left.visit_date.localeCompare(right.visit_date);
    if (dateComparison !== 0) {
      return dateComparison;
    }
    return (left.visit_time || "").localeCompare(right.visit_time || "");
  });

export default function DoctorVisitsScreen() {
  const [filter, setFilter] = useState<VisitFilter>("today");
  const today = getLocalIsoDate();
  const visitsQuery = useQuery({
    queryFn: getMyDoctorVisits,
    queryKey: queryKeys.doctor.visits.all,
  });
  const dashboardQuery = useQuery({
    queryFn: getDoctorVisitDashboard,
    queryKey: queryKeys.doctor.visits.dashboard,
  });
  const visits = useMemo(
    () => sortVisits(visitsQuery.data ?? []),
    [visitsQuery.data]
  );
  const visibleVisits = useMemo(
    () =>
      visits.filter((visit) => {
        if (filter === "today") {
          return visit.visit_date === today;
        }
        if (filter === "upcoming") {
          return visit.visit_date > today;
        }
        return true;
      }),
    [filter, today, visits]
  );
  const doctorId = visits[0]?.doctor_id ?? null;

  if (visitsQuery.isPending && !visitsQuery.data) {
    return <DoctorLoadingState label="Loading visits..." />;
  }

  if (visitsQuery.error && !visitsQuery.data) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          visitsQuery.error,
          "Unable to load your assigned visits."
        )}
        onRetry={() => void visitsQuery.refetch()}
        title="Visits unavailable"
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
            visitsQuery.isRefetching || dashboardQuery.isRefetching
          }
          tintColor={colors.primary}
          onRefresh={() =>
            void Promise.all([
              visitsQuery.refetch(),
              dashboardQuery.refetch(),
            ])
          }
        />
      }
      style={styles.container}
    >
      <DoctorScreenHeader
        action={
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.84}
            style={styles.headerAction}
            onPress={() =>
              router.push(
                {
                  pathname: "/(doctor)/visit-create",
                  params: doctorId ? { doctorId: String(doctorId) } : {},
                } as unknown as Href
              )
            }
          >
            <Ionicons color={colors.surface} name="add" size={20} />
          </TouchableOpacity>
        }
        subtitle="Review assigned visits, create new visits when allowed, and update visit status."
        title="Doctor Visits"
      />

      <View style={styles.summaryGrid}>
        <SummaryCard
          icon="calendar-outline"
          label="Today"
          value={dashboardQuery.data?.today_visits ?? 0}
        />
        <SummaryCard
          icon="time-outline"
          label="Scheduled"
          value={dashboardQuery.data?.scheduled ?? 0}
        />
        <SummaryCard
          icon="checkmark-done-outline"
          label="Visited"
          value={dashboardQuery.data?.visited ?? 0}
        />
        <SummaryCard
          icon="document-text-outline"
          label="Plan Submitted"
          value={dashboardQuery.data?.treatment_plan_submitted ?? 0}
        />
      </View>

      <View style={styles.filters}>
        <DoctorChoiceChips
          onChange={setFilter}
          options={filters}
          value={filter}
        />
      </View>

      {visibleVisits.length === 0 ? (
        <DoctorEmptyState
          description={
            visits.length === 0
              ? "No doctor visits are currently assigned to you."
              : "No visits match the selected view."
          }
          icon="calendar-outline"
          title="No visits"
        />
      ) : (
        visibleVisits.map((visit) => (
          <View key={visit.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.patient}>
                <Text style={styles.patientName}>{visit.patient_name}</Text>
                <Text style={styles.patientPhone}>
                  {visit.patient_phone}
                </Text>
              </View>
              <DoctorStatusBadge status={visit.status} />
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Visit date</Text>
                <Text style={styles.metaValue}>
                  {formatDoctorDate(visit.visit_date)}
                </Text>
                <Text style={styles.metaSubvalue}>
                  {visit.visit_time?.slice(0, 5)}
                </Text>
              </View>
              <View style={styles.metaBlock}>
                <Text style={styles.metaLabel}>Doctor</Text>
                <Text style={styles.metaValue}>
                  {visit.doctor_name ?? `Doctor #${visit.doctor_id}`}
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Chief complaint</Text>
            <Text style={styles.bodyText}>
              {visit.chief_complaint || "Not available"}
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              style={styles.primaryButton}
              onPress={() =>
                router.push(
                  {
                    pathname: "/(doctor)/visit-details",
                    params: { id: String(visit.id) },
                  } as unknown as Href
                )
              }
            >
              <Ionicons color={colors.surface} name="eye-outline" size={18} />
              <Text style={styles.primaryButtonText}>View Details</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons color={colors.primary} name={icon} size={21} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
  headerAction: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
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
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 104,
    padding: spacing.lgPlus,
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
  filters: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.lg,
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
  label: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  bodyText: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 46,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
