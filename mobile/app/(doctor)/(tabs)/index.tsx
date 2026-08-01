import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
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

import {
  DoctorErrorState,
  DoctorLoadingState,
  DoctorScreenHeader,
} from "../../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../../src/query/queryKeys";
import { getDoctorDashboardSummary } from "../../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import { reverseGeocode } from "../../../src/services/mapsService";
import {
  endDoctorWorkday,
  getTodayDoctorWorkday,
  startDoctorWorkday,
} from "../../../src/services/workdayService";
import type { DoctorDashboardSummary } from "../../../src/types/doctorWorkflow";
import {
  getCurrentLocation,
  requestLocationPermission,
} from "../../../src/utils/location";
import { clearAuthSession } from "../../../src/utils/storage";

const dashboardCards: {
  icon: keyof typeof Ionicons.glyphMap;
  key: keyof DoctorDashboardSummary;
  label: string;
  tone: "danger" | "primary" | "success" | "warning";
}[] = [
  {
    icon: "call-outline",
    key: "today_consultations",
    label: "Today's Consultations",
    tone: "primary",
  },
  {
    icon: "calendar-outline",
    key: "today_visits",
    label: "Today's Visits",
    tone: "success",
  },
  {
    icon: "document-text-outline",
    key: "pending_treatment_plans",
    label: "Pending Treatment Plans",
    tone: "warning",
  },
  {
    icon: "wallet-outline",
    key: "today_expenses",
    label: "Today's Expenses",
    tone: "primary",
  },
  {
    icon: "receipt-outline",
    key: "pending_claims",
    label: "Pending Claims",
    tone: "danger",
  },
];

const emptySummary: DoctorDashboardSummary = {
  pending_claims: 0,
  pending_treatment_plans: 0,
  today_consultations: 0,
  today_expenses: 0,
  today_visits: 0,
};

const getToneStyle = (
  tone: (typeof dashboardCards)[number]["tone"]
) => {
  switch (tone) {
    case "danger":
      return styles.dangerIcon;
    case "success":
      return styles.successIcon;
    case "warning":
      return styles.warningIcon;
    default:
      return styles.primaryIcon;
  }
};

export default function DoctorHomeScreen() {
  const queryClient = useQueryClient();
  const endingRef = useRef(false);
  const promptShownRef = useRef(false);
  const dashboardQuery = useQuery({
    queryFn: getDoctorDashboardSummary,
    queryKey: queryKeys.doctor.dashboard.summary,
  });
  const workdayQuery = useQuery({
    queryFn: getTodayDoctorWorkday,
    queryKey: queryKeys.doctor.workday.today,
  });
  const startMutation = useMutation({
    mutationFn: async () => {
      await requestLocationPermission();
      const coordinates = await getCurrentLocation();
      let address = `${coordinates.latitude}, ${coordinates.longitude}`;
      try {
        address = await reverseGeocode(
          coordinates.latitude,
          coordinates.longitude
        );
      } catch {
        // Coordinates remain the authoritative attendance location.
      }
      return startDoctorWorkday({
        start_address: address,
        start_latitude: coordinates.latitude,
        start_longitude: coordinates.longitude,
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Start Workday",
        getApiErrorMessage(error, "Unable to start your workday.")
      );
    },
    onSuccess: async () => {
      await workdayQuery.refetch();
      Alert.alert("Workday Started", "Attendance is now active.");
    },
  });
  const endMutation = useMutation({
    mutationFn: async () => {
      await requestLocationPermission();
      const coordinates = await getCurrentLocation();
      let address: string | undefined;
      try {
        address = await reverseGeocode(
          coordinates.latitude,
          coordinates.longitude
        );
      } catch {
        address = undefined;
      }
      return endDoctorWorkday({
        device_timestamp: new Date().toISOString(),
        end_address: address,
        end_latitude: coordinates.latitude,
        end_longitude: coordinates.longitude,
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to End Workday",
        getApiErrorMessage(error, "Unable to end your workday.")
      );
    },
    onSuccess: async (response) => {
      await clearAuthSession();
      queryClient.clear();
      Alert.alert(
        "Workday Ended",
        [
          `Completed visits: ${response.completed_visits_count}`,
          `Pending visits: ${response.pending_visits_count}`,
          `Distance: ${response.total_distance_km.toFixed(2)} km`,
        ].join("\n"),
        [
          {
            onPress: () => router.replace("/(auth)/login"),
            text: "OK",
          },
        ]
      );
    },
    onSettled: () => {
      endingRef.current = false;
    },
  });
  const endPending = endMutation.isPending;
  const mutateEnd = endMutation.mutate;
  const executeEnd = useCallback(() => {
    if (
      endingRef.current ||
      endPending ||
      !workdayQuery.data?.can_end_workday
    ) {
      return;
    }
    endingRef.current = true;
    mutateEnd();
  }, [
    endPending,
    mutateEnd,
    workdayQuery.data?.can_end_workday,
  ]);
  const confirmEnd = useCallback(() => {
    Alert.alert(
      "End Workday",
      "Attendance will close and you will be logged out.",
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: executeEnd,
          style: "destructive",
          text: "End Workday",
        },
      ]
    );
  }, [executeEnd]);

  useEffect(() => {
    const workday = workdayQuery.data;
    if (
      !workday?.is_active ||
      !workday.should_prompt_end ||
      promptShownRef.current
    ) {
      return;
    }
    promptShownRef.current = true;
    Alert.alert(
      "Your workday has ended",
      "Please end your workday.",
      [
        { style: "cancel", text: "Cancel" },
        { onPress: executeEnd, text: "End Workday" },
      ]
    );
  }, [executeEnd, workdayQuery.data]);

  useEffect(() => {
    const workday = workdayQuery.data;
    if (
      !workday?.is_active ||
      !workday.auto_logout_enabled ||
      !workday.should_prompt_end
    ) {
      return;
    }
    const timeout = setTimeout(
      executeEnd,
      workday.auto_logout_grace_minutes * 60_000
    );
    return () => clearTimeout(timeout);
  }, [executeEnd, workdayQuery.data]);

  if (dashboardQuery.isPending && !dashboardQuery.data) {
    return <DoctorLoadingState label="Loading doctor dashboard..." />;
  }

  if (dashboardQuery.error && !dashboardQuery.data) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          dashboardQuery.error,
          "Unable to load doctor dashboard."
        )}
        onRetry={() => void dashboardQuery.refetch()}
        title="Dashboard unavailable"
      />
    );
  }

  const summary = {
    ...emptySummary,
    ...dashboardQuery.data,
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={dashboardQuery.isRefetching}
          tintColor={colors.primary}
          onRefresh={() => void dashboardQuery.refetch()}
        />
      }
      style={styles.container}
    >
      <DoctorScreenHeader
        subtitle="Your consultations, visits, treatment plans, expenses, and claims."
        title="Doctor Dashboard"
      />

      <View style={styles.attendanceCard}>
        <View style={styles.attendanceText}>
          <Text style={styles.attendanceTitle}>Attendance</Text>
          <Text style={styles.attendanceStatus}>
            {workdayQuery.data?.is_active
              ? `Active since ${new Date(
                  workdayQuery.data.started_at ?? ""
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : workdayQuery.data?.started
                ? "Workday completed"
                : "Workday not started"}
          </Text>
          {workdayQuery.data?.is_active &&
          !workdayQuery.data.can_end_workday ? (
            <Text style={styles.attendanceHint}>
              End available at {workdayQuery.data.workday_end_time}
            </Text>
          ) : null}
        </View>
        {!workdayQuery.data?.started ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={startMutation.isPending}
            style={styles.startButton}
            onPress={() => startMutation.mutate()}
          >
            {startMutation.isPending ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Ionicons
                color={colors.surface}
                name="play-outline"
                size={18}
              />
            )}
            <Text style={styles.attendanceButtonText}>Start Day</Text>
          </TouchableOpacity>
        ) : workdayQuery.data?.is_active &&
          workdayQuery.data.can_end_workday ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={endPending}
            style={styles.endButton}
            onPress={confirmEnd}
          >
            {endPending ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Ionicons
                color={colors.surface}
                name="stop-circle-outline"
                size={18}
              />
            )}
            <Text style={styles.attendanceButtonText}>End Day</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.grid}>
        {dashboardCards.map((card) => (
          <View key={card.key} style={styles.card}>
            <View style={[styles.icon, getToneStyle(card.tone)]}>
              <Ionicons
                color={colors.primary}
                name={card.icon}
                size={23}
              />
            </View>
            <Text style={styles.cardLabel}>{card.label}</Text>
            <Text style={styles.cardValue}>{summary[card.key]}</Text>
          </View>
        ))}
      </View>
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lgPlus,
  },
  attendanceCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  attendanceText: {
    flex: 1,
  },
  attendanceTitle: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  attendanceStatus: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  attendanceHint: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  startButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  endButton: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  attendanceButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 142,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 42,
  },
  primaryIcon: {
    backgroundColor: colors.primarySurface,
  },
  successIcon: {
    backgroundColor: colors.greenSurface,
  },
  warningIcon: {
    backgroundColor: colors.warningSurface,
  },
  dangerIcon: {
    backgroundColor: colors.dangerSurface,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    lineHeight: typography.lineHeight.smallRelaxed,
  },
  cardValue: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.md,
  },
});
