import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdminDashboardSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import {
  AdminDashboardServiceError,
  getAdminDashboardSummary,
} from "../../src/services/adminDashboardService";
import type { AdminDashboardSummary } from "../../src/types/adminDashboard";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

interface MetricDefinition {
  key: keyof Pick<
    AdminDashboardSummary,
    | "total_therapists"
    | "todays_schedules"
    | "pending_claims"
    | "approved_claims"
    | "rejected_claims"
    | "completed_treatments"
  >;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
}

const metrics: MetricDefinition[] = [
  {
    key: "total_therapists",
    label: "Total Therapists",
    icon: "people-outline",
    color: colors.blueDark,
    backgroundColor: colors.blueSurface,
  },
  {
    key: "todays_schedules",
    label: "Today's Schedules",
    icon: "calendar-outline",
    color: PRIMARY,
    backgroundColor: colors.primarySurface,
  },
  {
    key: "pending_claims",
    label: "Pending Claims",
    icon: "time-outline",
    color: colors.warning,
    backgroundColor: colors.warningSurface,
  },
  {
    key: "approved_claims",
    label: "Approved Claims",
    icon: "checkmark-circle-outline",
    color: colors.greenDark,
    backgroundColor: colors.greenSurface,
  },
  {
    key: "rejected_claims",
    label: "Rejected Claims",
    icon: "close-circle-outline",
    color: colors.danger,
    backgroundColor: colors.dangerSurfaceStrong,
  },
  {
    key: "completed_treatments",
    label: "Completed Treatments",
    icon: "medkit-outline",
    color: colors.teal,
    backgroundColor: colors.tealSurface,
  },
];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load the admin dashboard.";
};

export default function AdminDashboardScreen() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await getAdminDashboardSummary();
        setSummary(data);
      } catch (loadError) {
        if (
          loadError instanceof AdminDashboardServiceError &&
          loadError.status === 401
        ) {
          await clearAuthSession();
          router.replace("/(auth)/login");
          return;
        }
        setError(getErrorMessage(loadError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
    }, [loadSummary])
  );

  const handleRefresh = useCallback(() => {
    void loadSummary(true);
  }, [loadSummary]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerContent}>
            <Text style={styles.eyebrow}>Administration</Text>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>
              Clinical operations and claims overview
            </Text>
          </View>
          <TouchableOpacity
            accessibilityHint="Opens rate settings and account controls"
            accessibilityLabel="Open admin settings"
            accessibilityRole="button"
            activeOpacity={0.8}
            hitSlop={8}
            onPress={() => router.push("/(admin)/settings")}
            style={styles.settingsButton}
          >
            <Ionicons
              color={PRIMARY}
              name="settings-outline"
              size={22}
            />
          </TouchableOpacity>
        </View>

        {loading ? (
          <AdminDashboardSkeleton />
        ) : error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={25}
              />
            </View>
            <Text style={styles.errorTitle}>Dashboard unavailable</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => void loadSummary()}
              style={styles.retryButton}
            >
              <Ionicons color={colors.surface} name="refresh" size={18} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : summary ? (
          <>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.metricsGrid}>
              {metrics.map((metric) => (
                <View key={metric.key} style={styles.metricCard}>
                  <View
                    style={[
                      styles.metricIcon,
                      { backgroundColor: metric.backgroundColor },
                    ]}
                  >
                    <Ionicons
                      color={metric.color}
                      name={metric.icon}
                      size={22}
                    />
                  </View>
                  <Text style={styles.metricValue}>
                    {summary[metric.key]}
                  </Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.stateContainer}>
            <Ionicons
              color={colors.textSubtle}
              name="analytics-outline"
              size={34}
            />
            <Text style={styles.stateText}>
              Dashboard data is not available.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  headerContent: {
    flex: 1,
  },
  settingsButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    marginLeft: spacing.lg,
    marginTop: spacing.xlPlus,
    width: 44,
    elevation: shadows.elevation.low,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y1,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.xs,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xlPlus,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s5,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.lg,
    marginTop: spacing.s26,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 154,
    padding: spacing.s15,
    width: "48%",
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  metricIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  metricLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
    lineHeight: typography.lineHeight.body,
    marginTop: spacing.s5,
  },
  stateContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 360,
    paddingHorizontal: spacing.xxxl,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.s13,
    textAlign: "center",
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.section,
    padding: spacing.xxxl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xlPlus,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
