import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
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

import { DashboardSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../../src/query/queryKeys";
import { getTherapistDashboardSummary } from "../../src/services/dashboardService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { reverseGeocode } from "../../src/services/mapsService";
import { getCurrentUser } from "../../src/services/userService";
import {
  getTodayWorkday,
  startWorkday,
  type TodayWorkdayResponse,
} from "../../src/services/workdayService";
import {
  getCurrentLocation,
  requestLocationPermission,
} from "../../src/utils/location";
import {
  getWorkdayState,
  removeWorkdayState,
  saveWorkdayState,
  type StoredWorkdayState,
} from "../../src/utils/storage";

const PRIMARY = colors.primary;

interface DashboardMetric {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route?: Href;
  tone: "primary" | "success" | "warning" | "danger";
  value: string;
}

const formatStartedAt = (value: string | null): string => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const toStoredWorkday = (
  workday: TodayWorkdayResponse
): StoredWorkdayState | null => {
  if (!workday.started || !workday.workday_id) {
    return null;
  }

  return {
    workdayId: workday.workday_id,
    startedAt: workday.started_at ?? new Date().toISOString(),
    workDate: workday.work_date,
  };
};

const getMetricTone = (tone: DashboardMetric["tone"]) => {
  switch (tone) {
    case "success":
      return styles.successValue;
    case "warning":
      return styles.warningValue;
    case "danger":
      return styles.dangerValue;
    default:
      return styles.primaryValue;
  }
};

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const content = (
    <>
      <View style={styles.metricHeader}>
        <View style={styles.metricIcon}>
          <Ionicons color={PRIMARY} name={metric.icon} size={18} />
        </View>
        {metric.route ? (
          <Ionicons
            color={colors.textSubtle}
            name="chevron-forward"
            size={17}
          />
        ) : null}
      </View>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      <Text style={[styles.metricValue, getMetricTone(metric.tone)]}>
        {metric.value}
      </Text>
    </>
  );

  if (!metric.route) {
    return <View style={styles.metricCard}>{content}</View>;
  }

  return (
    <TouchableOpacity
      accessibilityHint={`Opens ${metric.label}`}
      accessibilityRole="button"
      activeOpacity={0.82}
      style={styles.metricCard}
      onPress={() => router.push(metric.route as Href)}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const queryClient = useQueryClient();
  const startingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedWorkday, setCachedWorkday] =
    useState<StoredWorkdayState | null>(null);

  const userQuery = useQuery({
    queryKey: queryKeys.auth.user,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary,
    queryFn: getTherapistDashboardSummary,
  });
  const workdayQuery = useQuery({
    queryKey: queryKeys.workday.today,
    queryFn: getTodayWorkday,
  });

  useEffect(() => {
    void getWorkdayState().then(setCachedWorkday).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!workdayQuery.data) {
      return;
    }

    const stored = toStoredWorkday(workdayQuery.data);
    setCachedWorkday(stored);

    if (stored) {
      void saveWorkdayState(stored);
    } else {
      void removeWorkdayState();
    }
  }, [workdayQuery.data]);

  const startMutation = useMutation({
    mutationFn: async () => {
      await requestLocationPermission();
      const coordinates = await getCurrentLocation();
      let address = `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`;
      let addressWarning: string | null = null;

      try {
        address = await reverseGeocode(
          coordinates.latitude,
          coordinates.longitude
        );
      } catch {
        addressWarning =
          "The address could not be resolved, so the captured coordinates were used.";
      }

      const response = await startWorkday({
        start_address: address,
        start_latitude: coordinates.latitude,
        start_longitude: coordinates.longitude,
      });

      return {
        addressWarning,
        response,
      };
    },
    onSuccess: async ({ addressWarning, response }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.workday.today,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard.summary,
        }),
      ]);
      Alert.alert(
        "Workday Started",
        addressWarning
          ? `${response.message}\n\n${addressWarning}`
          : response.message
      );
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Start Workday",
        getApiErrorMessage(
          error,
          "Unable to start your workday. Please try again."
        )
      );
    },
    onSettled: () => {
      startingRef.current = false;
    },
  });

  const handleStartDay = () => {
    const workdayStarted =
      workdayQuery.data?.started ?? cachedWorkday !== null;

    if (
      startingRef.current ||
      startMutation.isPending ||
      workdayStarted
    ) {
      return;
    }

    startingRef.current = true;
    startMutation.mutate();
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        userQuery.refetch(),
        summaryQuery.refetch(),
        workdayQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (
    (userQuery.isPending && !userQuery.data) ||
    (summaryQuery.isPending && !summaryQuery.data)
  ) {
    return <DashboardSkeleton />;
  }

  const summary = summaryQuery.data;
  const workdayStarted =
    workdayQuery.data?.started ?? cachedWorkday !== null;
  const startedAt =
    workdayQuery.data?.started_at ??
    cachedWorkday?.startedAt ??
    null;
  const agendaMetrics: DashboardMetric[] = summary
    ? [
        {
          icon: "calendar-outline",
          label: "Today's Schedule",
          route: {
            pathname: "/(tabs)/schedules",
            params: { view: "today" },
          },
          tone: "primary",
          value: String(summary.today_scheduled),
        },
        {
          icon: "checkmark-circle-outline",
          label: "Completed",
          tone: "success",
          value: String(summary.completed_today),
        },
        {
          icon: "close-circle-outline",
          label: "Missed",
          tone: "danger",
          value: String(summary.missed_today),
        },
        {
          icon: "time-outline",
          label: "Upcoming",
          route: {
            pathname: "/(tabs)/schedules",
            params: { view: "upcoming" },
          },
          tone: "warning",
          value: String(summary.upcoming),
        },
      ]
    : [];
  const travelMetrics: DashboardMetric[] = summary
    ? [
        {
          icon: "navigate-outline",
          label: "Today's Trips",
          route: "/(tabs)/travel",
          tone: "primary",
          value: String(summary.today_trips),
        },
        {
          icon: "speedometer-outline",
          label: "Today's KM",
          tone: "primary",
          value: summary.today_km.toFixed(1),
        },
        {
          icon: "time-outline",
          label: "Pending Claims",
          route: "/(tabs)/claims",
          tone: "warning",
          value: String(summary.pending_claims),
        },
        {
          icon: "checkmark-done-outline",
          label: "Approved Claims",
          route: "/(tabs)/claims",
          tone: "success",
          value: String(summary.approved_claims),
        },
      ]
    : [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[PRIMARY]}
          refreshing={refreshing}
          tintColor={PRIMARY}
          onRefresh={() => void handleRefresh()}
        />
      }
      style={styles.container}
    >
      <Text style={styles.greeting}>Welcome back</Text>
      <Text style={styles.name}>
        {userQuery.data?.username ?? "Therapist"}
      </Text>

      {summaryQuery.error ? (
        <View style={styles.errorCard}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={21}
          />
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Dashboard unavailable</Text>
            <Text style={styles.errorText}>
              {getApiErrorMessage(
                summaryQuery.error,
                "Unable to load dashboard information."
              )}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.retryButton}
              onPress={() => void summaryQuery.refetch()}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Agenda</Text>
      <View style={styles.metricGrid}>
        {agendaMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Travel and Claims</Text>
      <View style={styles.metricGrid}>
        {travelMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Workday</Text>
      <View style={styles.workdayCard}>
        <View style={styles.workdayHeader}>
          <View style={styles.workdayTitleRow}>
            <View style={styles.workdayIcon}>
              <Ionicons color={PRIMARY} name="briefcase-outline" size={20} />
            </View>
            <Text style={styles.workdayTitle}>Workday Status</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              workdayStarted
                ? styles.startedBadge
                : styles.notStartedBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                workdayStarted
                  ? styles.startedText
                  : styles.notStartedText,
              ]}
            >
              {workdayStarted ? "Started" : "Not Started"}
            </Text>
          </View>
        </View>

        <View style={styles.workdayDetails}>
          <Text style={styles.detailLabel}>Started At</Text>
          <Text style={styles.detailValue}>
            {formatStartedAt(startedAt)}
          </Text>
        </View>

        {workdayQuery.error ? (
          <Text style={styles.workdayWarning}>
            Showing the last saved workday status. Pull to refresh when
            you are online.
          </Text>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{
            disabled: workdayStarted || startMutation.isPending,
          }}
          activeOpacity={0.85}
          disabled={workdayStarted || startMutation.isPending}
          style={[
            styles.startButton,
            (workdayStarted || startMutation.isPending) &&
              styles.disabledButton,
          ]}
          onPress={handleStartDay}
        >
          {startMutation.isPending ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons
              color={colors.surface}
              name={workdayStarted ? "checkmark-circle" : "play-circle"}
              size={21}
            />
          )}
          <Text style={styles.startButtonText}>
            {startMutation.isPending
              ? "Starting..."
              : workdayStarted
                ? "Workday Started"
                : "Start Day"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  greeting: {
    color: colors.textMuted,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.lg,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 128,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  metricHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  metricIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  metricValue: {
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
  },
  primaryValue: {
    color: PRIMARY,
  },
  successValue: {
    color: colors.primaryDark,
  },
  warningValue: {
    color: colors.warning,
  },
  dangerValue: {
    color: colors.danger,
  },
  errorCard: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lgPlus,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  errorText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  workdayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  workdayHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  workdayTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.md,
  },
  workdayIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  workdayTitle: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  startedBadge: {
    backgroundColor: colors.greenSurface,
  },
  notStartedBadge: {
    backgroundColor: colors.warningSurface,
  },
  statusText: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  startedText: {
    color: colors.primaryDark,
  },
  notStartedText: {
    color: colors.warningDark,
  },
  workdayDetails: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  workdayWarning: {
    color: colors.warningDark,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.s19,
    marginTop: spacing.lg,
  },
  startButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  disabledButton: {
    opacity: 0.65,
  },
  startButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
});
