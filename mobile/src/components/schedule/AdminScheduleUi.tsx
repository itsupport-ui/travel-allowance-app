import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo, useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type {
  AdminOperationalScheduleStatus,
  AdminScheduleReviewItem,
  AdminScheduleSummary,
  AdminScheduleView,
} from "../../types/adminSchedule";
import { formatDateForDisplay } from "../../utils/date";

const formatLabel = (value: string): string =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const formatScheduleTime = (value: string): string => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(
    2,
    "0"
  )} ${period}`;
};

const statusPalette: Record<
  AdminOperationalScheduleStatus,
  { background: string; foreground: string }
> = {
  cancelled: {
    background: colors.neutral100,
    foreground: colors.textMutedDark,
  },
  completed: {
    background: colors.greenSurface,
    foreground: colors.primaryDark,
  },
  in_progress: {
    background: colors.blueSurface,
    foreground: colors.blueDark,
  },
  missed: {
    background: colors.dangerSurfaceStrong,
    foreground: colors.danger,
  },
  scheduled: {
    background: colors.warningSurface,
    foreground: colors.warningDark,
  },
};

export const ScheduleStatusBadge = memo(
  function ScheduleStatusBadge({
    status,
  }: {
    status: AdminOperationalScheduleStatus;
  }) {
    const palette = statusPalette[status];
    return (
      <View
        accessible
        accessibilityLabel={`Status ${formatLabel(status)}`}
        style={[
          styles.statusBadge,
          { backgroundColor: palette.background },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            { backgroundColor: palette.foreground },
          ]}
        />
        <Text
          style={[styles.statusText, { color: palette.foreground }]}
        >
          {formatLabel(status)}
        </Text>
      </View>
    );
  }
);

export const SchedulePriorityBadge = memo(
  function SchedulePriorityBadge({
    priority,
  }: {
    priority: AdminScheduleReviewItem["priority"];
  }) {
    const high = priority === "high";
    return (
      <View
        accessible
        accessibilityLabel={`${formatLabel(priority)} priority`}
        style={[
          styles.priorityBadge,
          high ? styles.highPriorityBadge : null,
        ]}
      >
        <Ionicons
          color={high ? colors.danger : colors.textMutedDark}
          name={high ? "alert-circle" : "remove-circle-outline"}
          size={14}
        />
        <Text
          style={[
            styles.priorityText,
            high ? styles.highPriorityText : null,
          ]}
        >
          {formatLabel(priority)}
        </Text>
      </View>
    );
  }
);

interface SummaryCardDefinition {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}

export const ScheduleSummaryGrid = memo(
  function ScheduleSummaryGrid({
    cardWidth,
    summary,
  }: {
    cardWidth: number;
    summary: AdminScheduleSummary;
  }) {
    const cards = useMemo<SummaryCardDefinition[]>(
      () => [
        {
          color: colors.blue,
          icon: "calendar-outline",
          label: "Today",
          value: summary.today,
        },
        {
          color: colors.primary,
          icon: "pulse-outline",
          label: "In Progress",
          value: summary.inProgress,
        },
        {
          color: colors.warning,
          icon: "time-outline",
          label: "Upcoming",
          value: summary.upcoming,
        },
        {
          color: summary.conflicts ? colors.danger : colors.textMuted,
          icon: "warning-outline",
          label: "Conflicts",
          value: summary.conflicts,
        },
      ],
      [summary]
    );

    return (
      <View style={styles.summaryGrid}>
        {cards.map((card) => (
          <View
            accessible
            accessibilityLabel={`${card.label}: ${card.value}`}
            key={card.label}
            style={[styles.summaryCard, { width: cardWidth }]}
          >
            <View
              style={[
                styles.summaryIcon,
                { backgroundColor: `${card.color}18` },
              ]}
            >
              <Ionicons color={card.color} name={card.icon} size={20} />
            </View>
            <Text style={styles.summaryValue}>{card.value}</Text>
            <Text numberOfLines={1} style={styles.summaryLabel}>
              {card.label}
            </Text>
          </View>
        ))}
      </View>
    );
  }
);

export const ScheduleSearchBar = memo(
  function ScheduleSearchBar({
    onChangeText,
    onClear,
    value,
  }: {
    onChangeText: (value: string) => void;
    onClear: () => void;
    value: string;
  }) {
    return (
      <View style={styles.search}>
        <Ionicons color={colors.textMuted} name="search-outline" size={20} />
        <TextInput
          accessibilityLabel="Search schedules"
          autoCorrect={false}
          onChangeText={onChangeText}
          placeholder="Patient, clinician, treatment or area"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          style={styles.searchInput}
          value={value}
        />
        {value ? (
          <TouchableOpacity
            accessibilityLabel="Clear schedule search"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClear}
          >
            <Ionicons
              color={colors.textMuted}
              name="close-circle"
              size={21}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
);

const scheduleViews: {
  label: string;
  value: AdminScheduleView;
}[] = [
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const getViewCount = (
  view: AdminScheduleView,
  summary: AdminScheduleSummary
): number => {
  switch (view) {
    case "today":
      return summary.today;
    case "upcoming":
      return summary.upcoming;
    case "in_progress":
      return summary.inProgress;
    case "completed":
      return summary.completed;
    case "cancelled":
      return summary.cancelled;
  }
};

export const ScheduleViewTabs = memo(function ScheduleViewTabs({
  onChange,
  summary,
  value,
}: {
  onChange: (value: AdminScheduleView) => void;
  summary: AdminScheduleSummary;
  value: AdminScheduleView;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.tabsContent}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {scheduleViews.map((view) => {
        const selected = view.value === value;
        return (
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            activeOpacity={0.82}
            key={view.value}
            onPress={() => onChange(view.value)}
            style={[styles.tab, selected ? styles.selectedTab : null]}
          >
            <Text
              style={[
                styles.tabText,
                selected ? styles.selectedTabText : null,
              ]}
            >
              {view.label}
            </Text>
            <View
              style={[
                styles.tabCount,
                selected ? styles.selectedTabCount : null,
              ]}
            >
              <Text
                style={[
                  styles.tabCountText,
                  selected ? styles.selectedTabCountText : null,
                ]}
              >
                {getViewCount(view.value, summary)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

interface ScheduleCardProps {
  actionId: number | null;
  item: AdminScheduleReviewItem;
  onCancel: (item: AdminScheduleReviewItem) => void;
  onEdit: (item: AdminScheduleReviewItem) => void;
  onReschedule: (item: AdminScheduleReviewItem) => void;
  onView: (item: AdminScheduleReviewItem) => void;
}

const ActionButton = ({
  destructive = false,
  icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) => (
  <TouchableOpacity
    accessibilityLabel={label}
    accessibilityRole="button"
    activeOpacity={0.82}
    onPress={onPress}
    style={[
      styles.actionButton,
      destructive ? styles.destructiveAction : null,
    ]}
  >
    <Ionicons
      color={destructive ? colors.danger : colors.primary}
      name={icon}
      size={17}
    />
    <Text
      style={[
        styles.actionText,
        destructive ? styles.destructiveActionText : null,
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

export const AdminScheduleCard = memo(function AdminScheduleCard({
  actionId,
  item,
  onCancel,
  onEdit,
  onReschedule,
  onView,
}: ScheduleCardProps) {
  const canEdit = item.availableActions.includes("edit");
  const canCancel = item.availableActions.includes("cancel");
  return (
    <View
      accessible
      accessibilityLabel={`${item.patientName}, ${formatScheduleTime(
        item.startTime
      )}, therapist ${item.therapistName}, ${
        item.operationalStatus
      }`}
      style={styles.card}
    >
      {item.hasConflict ? (
        <View style={styles.conflictBanner}>
          <Ionicons
            color={colors.danger}
            name="warning"
            size={16}
          />
          <Text style={styles.conflictText}>
            Therapist time conflict requires review
          </Text>
        </View>
      ) : null}

      <View style={styles.cardHeader}>
        <View style={styles.timeBlock}>
          <Text style={styles.startTime}>
            {formatScheduleTime(item.startTime)}
          </Text>
          <Text style={styles.endTime}>
            to {formatScheduleTime(item.expectedEndTime)}
          </Text>
        </View>
        <View style={styles.cardIdentity}>
          <Text numberOfLines={1} style={styles.patientName}>
            {item.patientName}
          </Text>
          <Text numberOfLines={1} style={styles.patientMeta}>
            {item.patientReferenceId
              ? `${item.patientReferenceId} | `
              : ""}
            {item.area}
          </Text>
        </View>
        <ScheduleStatusBadge status={item.operationalStatus} />
      </View>

      <View style={styles.clinicalStrip}>
        <View style={styles.clinicalText}>
          <Text numberOfLines={1} style={styles.treatmentName}>
            {item.treatmentName}
          </Text>
          <Text style={styles.visitType}>
            {formatLabel(item.visitType)} | {item.durationMinutes} min
          </Text>
        </View>
        <SchedulePriorityBadge priority={item.priority} />
      </View>

      <View style={styles.assignmentGrid}>
        <View style={styles.assignment}>
          <Ionicons
            color={colors.primary}
            name="person-circle-outline"
            size={18}
          />
          <View style={styles.assignmentText}>
            <Text style={styles.assignmentLabel}>Therapist</Text>
            <Text numberOfLines={1} style={styles.assignmentValue}>
              {item.therapistName}
            </Text>
          </View>
        </View>
        <View style={styles.assignment}>
          <Ionicons
            color={colors.blue}
            name="medical-outline"
            size={18}
          />
          <View style={styles.assignmentText}>
            <Text style={styles.assignmentLabel}>Doctor</Text>
            <Text numberOfLines={1} style={styles.assignmentValue}>
              {item.doctorName}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.dateRow}>
        <Ionicons
          color={colors.textMuted}
          name="calendar-outline"
          size={16}
        />
        <Text style={styles.dateText}>
          {formatDateForDisplay(item.occurrenceDate) ??
            item.occurrenceDate ??
            "Date not set"}
          {item.scheduleType === "recurring" ? " | Recurring" : ""}
        </Text>
      </View>

      <View style={styles.actions}>
        <ActionButton
          icon="eye-outline"
          label="View"
          onPress={() => onView(item)}
        />
        {canEdit ? (
          <>
            <ActionButton
              icon="create-outline"
              label="Edit"
              onPress={() => onEdit(item)}
            />
            <ActionButton
              icon="calendar-number-outline"
              label="Reschedule"
              onPress={() => onReschedule(item)}
            />
          </>
        ) : null}
        {canCancel ? (
          actionId === item.id ? (
            <View style={styles.actionLoading}>
              <ActivityIndicator color={colors.danger} size="small" />
            </View>
          ) : (
            <ActionButton
              destructive
              icon="close-circle-outline"
              label="Cancel"
              onPress={() => onCancel(item)}
            />
          )
        ) : null}
      </View>
    </View>
  );
});

export const ScheduleListSkeleton = () => (
  <View accessibilityLabel="Loading schedules" style={styles.skeletonList}>
    {[0, 1, 2].map((index) => (
      <View key={index} style={styles.skeletonCard}>
        <View style={styles.skeletonHeader}>
          <View style={styles.skeletonTime} />
          <View style={styles.skeletonIdentity}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLineShort} />
          </View>
        </View>
        <View style={styles.skeletonBand} />
        <View style={styles.skeletonLineWide} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 104,
    padding: spacing.lg,
  },
  summaryIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.size.size21,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xxs,
  },
  search: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    minHeight: 46,
    paddingVertical: 0,
  },
  tabsContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  tab: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  selectedTab: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.semibold,
  },
  selectedTabText: { color: colors.surface },
  tabCount: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.pill,
    minWidth: 23,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  selectedTabCount: { backgroundColor: colors.surface },
  tabCountText: {
    color: colors.textMutedDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  selectedTabCountText: { color: colors.primaryDark },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    elevation: shadows.elevation.card,
    overflow: "hidden",
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  conflictBanner: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  conflictText: {
    color: colors.danger,
    flex: 1,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  timeBlock: {
    borderRightColor: colors.borderMuted,
    borderRightWidth: 1,
    minWidth: 74,
    paddingRight: spacing.md,
  },
  startTime: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  endTime: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    marginTop: 2,
  },
  cardIdentity: { flex: 1, minWidth: 0 },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  patientMeta: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: 3,
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusText: {
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  clinicalStrip: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderBottomColor: colors.borderMuted,
    borderTopColor: colors.borderMuted,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  clinicalText: { flex: 1, minWidth: 0 },
  treatmentName: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  visitType: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: 2,
  },
  priorityBadge: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  highPriorityBadge: { backgroundColor: colors.dangerSurfaceStrong },
  priorityText: {
    color: colors.textMutedDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  highPriorityText: { color: colors.danger },
  assignmentGrid: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  assignment: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
  },
  assignmentText: { flex: 1, minWidth: 0 },
  assignmentLabel: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
    textTransform: "uppercase",
  },
  assignmentValue: {
    color: colors.textSecondary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.semibold,
    marginTop: 2,
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dateText: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
  },
  actions: {
    borderTopColor: colors.borderMuted,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
  },
  actionButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  actionText: {
    color: colors.primary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  destructiveAction: { borderColor: colors.dangerSurfaceStrong },
  destructiveActionText: { color: colors.danger },
  actionLoading: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 44,
  },
  skeletonList: { gap: spacing.lg },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  skeletonHeader: { flexDirection: "row", gap: spacing.lg },
  skeletonTime: {
    backgroundColor: colors.neutral150,
    borderRadius: radius.control,
    height: 44,
    width: 72,
  },
  skeletonIdentity: { flex: 1, gap: spacing.sm },
  skeletonLineWide: {
    backgroundColor: colors.neutral150,
    borderRadius: radius.control,
    height: 14,
    width: "78%",
  },
  skeletonLineShort: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 11,
    width: "48%",
  },
  skeletonBand: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 42,
  },
});
