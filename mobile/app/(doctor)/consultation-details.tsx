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
  TouchableOpacity,
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
import {
  getDoctorConsultation,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  formatDoctorCurrency,
  formatDoctorDate,
  formatDoctorDateTime,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

export default function DoctorConsultationDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const consultationId = useMemo(
    () => parsePositiveId(params.id),
    [params.id]
  );
  const consultationQuery = useQuery({
    enabled: consultationId !== null,
    queryFn: () => {
      if (consultationId === null) {
        throw new Error("A valid consultation ID is required.");
      }
      return getDoctorConsultation(consultationId);
    },
    queryKey:
      consultationId === null
        ? ["doctor", "consultations", "detail", "invalid"]
        : queryKeys.doctor.consultations.detail(consultationId),
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/consultations");
    }
  };

  if (consultationQuery.isPending && !consultationQuery.data) {
    return <DoctorLoadingState label="Loading consultation..." />;
  }

  const consultation = consultationQuery.data;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Consultation Details" />

      {consultationId === null ? (
        <DoctorErrorState
          message="A valid consultation ID is required."
          onRetry={goBack}
          title="Invalid consultation"
        />
      ) : consultationQuery.error && !consultation ? (
        <DoctorErrorState
          message={getApiErrorMessage(
            consultationQuery.error,
            "Unable to load consultation details."
          )}
          onRetry={() => void consultationQuery.refetch()}
          title="Consultation unavailable"
        />
      ) : consultation ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              refreshing={consultationQuery.isRefetching}
              tintColor={colors.primary}
              onRefresh={() => void consultationQuery.refetch()}
            />
          }
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.patientIcon}>
                <Ionicons
                  color={colors.primary}
                  name="person-outline"
                  size={24}
                />
              </View>
              <View style={styles.patientText}>
                <Text style={styles.patientName}>
                  {consultation.patient_name}
                </Text>
                <Text style={styles.patientPhone}>
                  {consultation.patient_phone}
                </Text>
              </View>
              <DoctorStatusBadge status={consultation.status} />
            </View>
            <Text style={styles.decisionLabel}>Patient decision</Text>
            <DoctorStatusBadge status={consultation.patient_decision} />
          </View>

          <View style={styles.detailsCard}>
            <DoctorDetailRow
              label="Address"
              value={consultation.patient_address || "Not available"}
            />
            <DoctorDetailRow
              label="Scheduled"
              value={`${formatDoctorDate(
                consultation.scheduled_date
              )} at ${consultation.scheduled_time.slice(0, 5)}`}
            />
            <DoctorDetailRow
              label="Completed"
              value={formatDoctorDateTime(consultation.completed_at)}
            />
            <DoctorDetailRow
              label="Purpose"
              value={consultation.purpose}
            />
            <DoctorDetailRow
              label="Notes"
              value={consultation.notes || "Not available"}
            />
            <DoctorDetailRow
              label="Call outcome"
              value={consultation.call_outcome || "Not available"}
            />
            <DoctorDetailRow
              label="Preliminary diagnosis"
              value={
                consultation.preliminary_diagnosis || "Not available"
              }
            />
            <DoctorDetailRow
              label="Proposed treatment"
              value={consultation.proposed_treatment || "Not available"}
            />
            <DoctorDetailRow
              label="Estimated amount"
              value={
                consultation.estimated_amount === null
                  ? "Not available"
                  : formatDoctorCurrency(consultation.estimated_amount)
              }
            />
          </View>

          {consultation.status === "scheduled" ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.completeButton}
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
                size={20}
              />
              <Text style={styles.completeButtonText}>
                Complete Consultation
              </Text>
            </TouchableOpacity>
          ) : null}
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
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
  },
  patientIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  patientText: {
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
  decisionLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
    textTransform: "uppercase",
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    paddingHorizontal: spacing.xl,
  },
  completeButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 52,
  },
  completeButtonText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
});
