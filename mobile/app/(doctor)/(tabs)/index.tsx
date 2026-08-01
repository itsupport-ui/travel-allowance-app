import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  DoctorPressableCard,
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
import type { AuthUser } from "../../../src/types/auth";
import {
  getCurrentLocation,
  requestLocationPermission,
} from "../../../src/utils/location";
import { clearAuthSession, getStoredUser } from "../../../src/utils/storage";

const dashboardCards: {
  icon: keyof typeof Ionicons.glyphMap;
  key: keyof DoctorDashboardSummary;
  label: string;
  description: string;
  route: Href;
  tone: "blue" | "green" | "orange" | "purple" | "teal";
}[] = [
  {
    icon: "call-outline",
    key: "today_consultations",
    label: "Consultations",
    description: "Review patient calls and record clinical outcomes",
    route: "/(doctor)/(tabs)/consultations",
    tone: "blue",
  },
  {
    icon: "calendar-outline",
    key: "today_visits",
    label: "Visits",
    description: "Manage scheduled visits and treatment sessions",
    route: "/(doctor)/(tabs)/visits",
    tone: "green",
  },
  {
    icon: "document-text-outline",
    key: "pending_treatment_plans",
    label: "Treatment Plans",
    description: "Create plans and follow approval progress",
    route: "/(doctor)/(tabs)/treatment-plans",
    tone: "purple",
  },
  {
    icon: "wallet-outline",
    key: "today_expenses",
    label: "Expenses",
    description: "Record and review patient travel expenses",
    route: "/(doctor)/(tabs)/expenses",
    tone: "orange",
  },
  {
    icon: "receipt-outline",
    key: "pending_claims",
    label: "Claims",
    description: "Submit expenses and track reimbursements",
    route: "/(doctor)/(tabs)/claims",
    tone: "teal",
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
    case "blue":
      return styles.blueIcon;
    case "green":
      return styles.greenIcon;
    case "orange":
      return styles.orangeIcon;
    case "purple":
      return styles.purpleIcon;
    default:
      return styles.tealIcon;
  }
};

const getToneColor = (
  tone: (typeof dashboardCards)[number]["tone"]
) => {
  switch (tone) {
    case "blue":
      return colors.blue;
    case "green":
      return colors.greenDark;
    case "orange":
      return colors.warningBright;
    case "purple":
      return colors.purple;
    default:
      return colors.teal;
  }
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export default function DoctorHomeScreen() {
  const queryClient = useQueryClient();
  const [doctor, setDoctor] = useState<AuthUser | null>(
    () => queryClient.getQueryData<AuthUser>(queryKeys.auth.user) ?? null
  );
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
  const currentDate = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "long",
        weekday: "long",
      }).format(new Date()),
    []
  );
  const doctorName = doctor?.username?.trim() || "Doctor";
  const doctorInitial = doctorName.charAt(0).toUpperCase() || "D";
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
    let active = true;
    void getStoredUser().then((user) => {
      if (active && user?.role === "doctor") setDoctor(user);
    });
    return () => {
      active = false;
    };
  }, []);

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
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text numberOfLines={1} style={styles.doctorName}>
            Dr. {doctorName}
          </Text>
          <Text style={styles.doctorRole}>Hospital care team</Text>
          <View style={styles.dateRow}>
            <Ionicons
              color={colors.textMuted}
              name="calendar-clear-outline"
              size={15}
            />
            <Text style={styles.currentDate}>{currentDate}</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityLabel="Open doctor profile"
          accessibilityRole="button"
          style={styles.avatar}
          onPress={() => router.push("/(doctor)/(tabs)/profile")}
        >
          <Text style={styles.avatarText}>{doctorInitial}</Text>
          <View style={styles.onlineDot} />
        </TouchableOpacity>
      </View>

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

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>CLINICAL WORKSPACE</Text>
          <Text style={styles.sectionTitle}>Your modules</Text>
        </View>
        <Text style={styles.sectionHint}>Tap to open</Text>
      </View>

      <View style={styles.grid}>
        {dashboardCards.map((card) => (
          <DoctorPressableCard
            accessibilityLabel={`Open ${card.label}. ${summary[card.key]} items.`}
            key={card.key}
            style={styles.card}
            onPress={() => router.push(card.route)}
          >
            <View style={styles.moduleRow}>
              <View style={[styles.icon, getToneStyle(card.tone)]}>
                <Ionicons
                  color={getToneColor(card.tone)}
                  name={card.icon}
                  size={24}
                />
              </View>
              <View style={styles.moduleCopy}>
                <View style={styles.moduleTitleRow}>
                  <Text style={styles.cardLabel}>{card.label}</Text>
                  <View style={[styles.countBadge, getToneStyle(card.tone)]}>
                    <Text style={[styles.cardValue, { color: getToneColor(card.tone) }]}>
                      {summary[card.key]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDescription}>{card.description}</Text>
              </View>
              <View style={styles.arrowButton}>
                <Ionicons
                  color={colors.textMuted}
                  name="chevron-forward"
                  size={20}
                />
              </View>
            </View>
          </DoctorPressableCard>
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
  hero: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  heroCopy: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  greeting: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
  },
  doctorName: {
    color: colors.textPrimary,
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  doctorRole: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.mdPlus,
  },
  currentDate: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 3,
    height: 58,
    justifyContent: "center",
    width: 58,
    elevation: shadows.elevation.raised,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.medium,
    shadowRadius: shadows.radius.card,
  },
  avatarText: {
    color: colors.surface,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
  },
  onlineDot: {
    backgroundColor: colors.greenBright,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: 0,
    height: 14,
    position: "absolute",
    right: 0,
    width: 14,
  },
  grid: {
    gap: spacing.lg,
  },
  sectionHeadingRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    letterSpacing: 0.7,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: typography.size.small,
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
    borderColor: colors.borderMuted,
    borderRadius: radius.panel,
    borderWidth: 1,
    minHeight: 104,
    overflow: "hidden",
    padding: spacing.lgPlus,
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
    width: 46,
  },
  blueIcon: {
    backgroundColor: colors.blueSurface,
  },
  greenIcon: {
    backgroundColor: colors.greenSurface,
  },
  orangeIcon: {
    backgroundColor: colors.warningSurface,
  },
  purpleIcon: {
    backgroundColor: colors.purpleSurface,
  },
  tealIcon: {
    backgroundColor: colors.tealSurface,
  },
  moduleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
  },
  moduleCopy: {
    flex: 1,
  },
  moduleTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  countBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 24,
    minWidth: 28,
    paddingHorizontal: spacing.md,
  },
  cardLabel: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  cardValue: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.sm,
  },
  arrowButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});
