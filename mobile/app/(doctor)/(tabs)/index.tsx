import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
import type { DoctorDashboardSummary } from "../../../src/types/doctorWorkflow";

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
  const dashboardQuery = useQuery({
    queryFn: getDoctorDashboardSummary,
    queryKey: queryKeys.doctor.dashboard.summary,
  });

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
