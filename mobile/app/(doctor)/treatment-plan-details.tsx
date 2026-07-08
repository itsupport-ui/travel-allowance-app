import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorBackHeader,
  DoctorDetailRow,
  DoctorErrorState,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import { getTreatmentPlan } from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  formatDoctorDate,
  formatDoctorLabel,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

const getApprovalMessage = (status: string): string => {
  if (status === "approved") {
    return "Approved by admin. Scheduling can now proceed.";
  }

  if (status === "rejected") {
    return "Rejected by admin. This submitted plan is read-only.";
  }

  if (status === "submitted" || status === "pending") {
    return "Submitted and awaiting admin review.";
  }

  return `Current approval status: ${formatDoctorLabel(status)}.`;
};

export default function DoctorTreatmentPlanDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const planId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const planQuery = useQuery({
    enabled: planId !== null,
    queryFn: () => {
      if (planId === null) {
        throw new Error("A valid treatment plan ID is required.");
      }
      return getTreatmentPlan(planId);
    },
    queryKey:
      planId === null
        ? ["doctor", "treatment-plans", "detail", "invalid"]
        : queryKeys.doctor.treatmentPlans.detail(planId),
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/treatment-plans");
    }
  };

  if (planQuery.isPending && !planQuery.data) {
    return <DoctorLoadingState label="Loading treatment plan..." />;
  }

  const plan = planQuery.data;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Treatment Plan" />

      {planId === null ? (
        <DoctorErrorState
          message="A valid treatment plan ID is required."
          onRetry={goBack}
          title="Invalid treatment plan"
        />
      ) : planQuery.error && !plan ? (
        <DoctorErrorState
          message={getApiErrorMessage(
            planQuery.error,
            "Unable to load treatment plan details."
          )}
          onRetry={() => void planQuery.refetch()}
          title="Treatment plan unavailable"
        />
      ) : plan ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              refreshing={planQuery.isRefetching}
              tintColor={colors.primary}
              onRefresh={() => void planQuery.refetch()}
            />
          }
        >
          <View style={styles.summaryCard}>
            <View style={styles.icon}>
              <Ionicons
                color={colors.primary}
                name="medkit-outline"
                size={24}
              />
            </View>
            <View style={styles.summaryText}>
              <Text style={styles.patientName}>{plan.patient_name}</Text>
              <Text style={styles.planMeta}>
                Plan #{plan.id} · Visit #{plan.doctor_visit_id}
              </Text>
            </View>
            <DoctorStatusBadge status={plan.status} />
          </View>

          <View
            style={[
              styles.approvalCard,
              plan.status === "rejected" && styles.rejectedCard,
              plan.status === "approved" && styles.approvedCard,
            ]}
          >
            <Text style={styles.approvalTitle}>Approval status</Text>
            <Text style={styles.approvalText}>
              {getApprovalMessage(plan.status)}
            </Text>
          </View>

          <View style={styles.detailsCard}>
            <DoctorDetailRow
              label="Diagnosis"
              value={plan.diagnosis || "Not available"}
            />
            <DoctorDetailRow
              label="Chief complaint"
              value={plan.chief_complaint || "Not available"}
            />
            <DoctorDetailRow
              label="Treatment plan"
              value={plan.treatment_plan || "Not available"}
            />
            <DoctorDetailRow
              label="Medicines"
              value={plan.medicines || "Not available"}
            />
            <DoctorDetailRow
              label="Sessions required"
              value={plan.sessions_required ?? "Not available"}
            />
            <DoctorDetailRow
              label="Frequency"
              value={plan.frequency || "Not available"}
            />
            <DoctorDetailRow
              label="Duration"
              value={plan.duration || "Not available"}
            />
            <DoctorDetailRow
              label="Special instructions"
              value={plan.special_instructions || "Not available"}
            />
            <DoctorDetailRow
              label="Remarks"
              value={plan.remarks || "Not available"}
            />
            <DoctorDetailRow
              label="Submitted"
              value={formatDoctorDate(plan.created_at)}
            />
            <DoctorDetailRow
              label="Last updated"
              value={formatDoctorDate(plan.updated_at)}
            />
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  summaryText: {
    flex: 1,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  planMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  approvalCard: {
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    marginVertical: spacing.lgPlus,
    padding: spacing.xl,
  },
  rejectedCard: {
    backgroundColor: colors.dangerSurface,
  },
  approvedCard: {
    backgroundColor: colors.greenSurfaceLight,
  },
  approvalTitle: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  approvalText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    paddingHorizontal: spacing.xl,
  },
});
