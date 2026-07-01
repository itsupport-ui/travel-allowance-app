import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from "react-native";

import { ScheduleListSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import { queryKeys, type TherapistScheduleView } from "../../src/query/queryKeys";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  getCompletedSchedules,
  getMissedSchedules,
  getTodaySchedules,
  getUpcomingSchedules,
} from "../../src/services/scheduleService";
import type { Schedule } from "../../src/types/schedule";

const PRIMARY = colors.primary;

const scheduleViews: {
  label: string;
  value: TherapistScheduleView;
}[] = [
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Completed", value: "completed" },
  { label: "Missed", value: "missed" },
];

const scheduleLoaders: Record<
  TherapistScheduleView,
  () => Promise<Schedule[]>
> = {
  completed: getCompletedSchedules,
  missed: getMissedSchedules,
  today: getTodaySchedules,
  upcoming: getUpcomingSchedules,
};

const isScheduleView = (
  value: string | string[] | undefined
): value is TherapistScheduleView =>
  typeof value === "string" &&
  scheduleViews.some((view) => view.value === value);

const formatTime = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Time not available";
  }

  const [hourValue, minuteValue] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`;
};

const formatDate = (schedule: Schedule): string => {
  const value =
    schedule.treatment_date ??
    schedule.start_date ??
    schedule.end_date;

  if (!value) {
    return "Date not available";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatLabel = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Not available";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getStatusStyle = (
  status: string | null | undefined
) => {
  switch (status?.toLowerCase()) {
    case "completed":
      return styles.completedBadge;
    case "missed":
      return styles.missedBadge;
    default:
      return styles.scheduledBadge;
  }
};

interface ScheduleCardProps {
  schedule: Schedule;
}

const ScheduleCard = memo(function ScheduleCard({
  schedule,
}: ScheduleCardProps) {
  return (
    <TouchableOpacity
      accessibilityHint="Opens schedule details"
      accessibilityRole="button"
      activeOpacity={0.82}
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: "/schedule-details",
          params: { id: String(schedule.id) },
        })
      }
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.eyebrow}>Patient</Text>
          <Text numberOfLines={1} style={styles.patientName}>
            {schedule.patient_name}
          </Text>
        </View>
        <View style={[styles.badge, getStatusStyle(schedule.status)]}>
          <Text style={styles.badgeText}>
            {formatLabel(schedule.status)}
          </Text>
        </View>
      </View>

      <Text style={styles.treatmentName}>
        {schedule.treatment_name}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons
          color={colors.textMuted}
          name="medical-outline"
          size={16}
        />
        <Text numberOfLines={1} style={styles.metaText}>
          {schedule.doctor_name ?? "Doctor not assigned"}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons
          color={colors.textMuted}
          name="calendar-outline"
          size={16}
        />
        <Text style={styles.metaText}>{formatDate(schedule)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons
          color={colors.textMuted}
          name="time-outline"
          size={16}
        />
        <Text style={styles.metaText}>
          {formatTime(schedule.in_time)} - {formatTime(schedule.out_time)}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <View
          style={[
            styles.priorityBadge,
            schedule.priority === "high"
              ? styles.highPriority
              : styles.normalPriority,
          ]}
        >
          <Text style={styles.priorityText}>
            {formatLabel(schedule.priority)} Priority
          </Text>
        </View>
        <Ionicons
          color={colors.textSubtle}
          name="chevron-forward"
          size={18}
        />
      </View>
    </TouchableOpacity>
  );
});

const keyExtractor = (item: Schedule): string => String(item.id);

const renderSchedule: ListRenderItem<Schedule> = ({ item }) => (
  <ScheduleCard schedule={item} />
);

export default function SchedulesScreen() {
  const params = useLocalSearchParams<{
    view?: string | string[];
  }>();
  const [view, setView] = useState<TherapistScheduleView>(
    isScheduleView(params.view) ? params.view : "today"
  );

  useEffect(() => {
    if (isScheduleView(params.view)) {
      setView(params.view);
    }
  }, [params.view]);

  const schedulesQuery = useQuery({
    queryKey: queryKeys.schedules.list(view),
    queryFn: scheduleLoaders[view],
  });

  const selectView = useCallback(
    (nextView: TherapistScheduleView) => {
      setView(nextView);
      router.setParams({ view: nextView });
    },
    []
  );

  if (schedulesQuery.isPending && !schedulesQuery.data) {
    return <ScheduleListSkeleton />;
  }

  const schedules = schedulesQuery.data ?? [];
  const selectedLabel =
    scheduleViews.find((item) => item.value === view)?.label ?? "Schedules";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Schedules</Text>

      <View
        accessibilityRole="tablist"
        style={styles.segmentedControl}
      >
        {scheduleViews.map((item) => {
          const selected = item.value === view;

          return (
            <TouchableOpacity
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              activeOpacity={0.8}
              style={[
                styles.segment,
                selected && styles.selectedSegment,
              ]}
              onPress={() => selectView(item.value)}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.segmentText,
                  selected && styles.selectedSegmentText,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {schedulesQuery.error ? (
        <View style={styles.errorCard}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={21}
          />
          <View style={styles.errorContent}>
            <Text style={styles.stateTitle}>
              Unable to load {selectedLabel.toLowerCase()} schedules
            </Text>
            <Text style={styles.stateText}>
              {getApiErrorMessage(
                schedulesQuery.error,
                "Unable to load schedules."
              )}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.retryButton}
              onPress={() => void schedulesQuery.refetch()}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={
          schedules.length === 0
            ? styles.emptyContent
            : styles.listContent
        }
        data={schedules}
        initialNumToRender={6}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          !schedulesQuery.error ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  color={PRIMARY}
                  name="calendar-clear-outline"
                  size={27}
                />
              </View>
              <Text style={styles.stateTitle}>
                No {selectedLabel.toLowerCase()} schedules
              </Text>
              <Text style={styles.stateText}>
                Assigned treatments will appear here automatically.
              </Text>
            </View>
          ) : null
        }
        maxToRenderPerBatch={6}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            refreshing={
              schedulesQuery.isRefetching &&
              !schedulesQuery.isPending
            }
            tintColor={PRIMARY}
            onRefresh={() => void schedulesQuery.refetch()}
          />
        }
        removeClippedSubviews
        renderItem={renderSchedule}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  segmentedControl: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    flexDirection: "row",
    marginBottom: spacing.xl,
    padding: spacing.xs,
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.lg,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  selectedSegment: {
    backgroundColor: colors.surface,
    elevation: 1,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  selectedSegmentText: {
    color: PRIMARY,
  },
  listContent: {
    paddingBottom: spacing.sectionLg,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: spacing.sectionLg,
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
    marginBottom: spacing.lg,
  },
  cardTitleBlock: {
    flex: 1,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.size19,
    fontWeight: typography.weight.extrabold,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  scheduledBadge: {
    backgroundColor: colors.primary,
  },
  completedBadge: {
    backgroundColor: colors.greenDeep,
  },
  missedBadge: {
    backgroundColor: colors.danger,
  },
  badgeText: {
    color: colors.surface,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  treatmentName: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    color: colors.textStrong,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metaText: {
    color: colors.textMutedDark,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  cardFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
  },
  priorityBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  normalPriority: {
    backgroundColor: colors.primarySurface,
  },
  highPriority: {
    backgroundColor: colors.dangerSurface,
  },
  priorityText: {
    color: colors.textStrong,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  errorCard: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  errorContent: {
    flex: 1,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    textAlign: "center",
  },
  retryButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
  },
  retryText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    padding: spacing.section,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 54,
  },
});
