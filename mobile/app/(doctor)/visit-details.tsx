import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  DoctorField,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  getDoctorVisit,
  updateDoctorVisitStatus,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { DoctorVisit } from "../../src/types/doctorWorkflow";
import {
  formatDoctorDate,
  formatDoctorDateTime,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

type VisitAction = "cancelled" | "visited";

export default function DoctorVisitDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const visitId = useMemo(() => parsePositiveId(id), [id]);
  const queryClient = useQueryClient();
  const actionRef = useRef<VisitAction | null>(null);
  const [remarks, setRemarks] = useState("");
  const visitQuery = useQuery({
    enabled: visitId !== null,
    queryFn: () => getDoctorVisit(visitId ?? 0),
    queryKey:
      visitId === null
        ? ["doctor", "visits", "detail", "invalid"]
        : queryKeys.doctor.visits.detail(visitId),
  });
  const visit = visitQuery.data;
  const mutation = useMutation({
    mutationFn: async (status: VisitAction) => {
      if (!visit) {
        throw new Error("Visit is not loaded.");
      }
      actionRef.current = status;
      return updateDoctorVisitStatus(visit.id, {
        remarks: remarks.trim() || null,
        status,
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Update Visit",
        getApiErrorMessage(error, "Unable to update this doctor visit.")
      );
    },
    onSuccess: async (updatedVisit: DoctorVisit) => {
      queryClient.setQueryData(
        queryKeys.doctor.visits.detail(updatedVisit.id),
        updatedVisit
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.visits.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.visits.dashboard,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.treatmentPlans.visits,
        }),
      ]);
      Alert.alert("Visit Updated", "The visit status has been updated.");
    },
    onSettled: () => {
      actionRef.current = null;
    },
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/visits" as Href);
    }
  };
  const confirmStatus = (status: VisitAction) => {
    if (!visit || mutation.isPending) {
      return;
    }

    const isVisited = status === "visited";
    Alert.alert(
      isVisited ? "Mark Visit as Visited?" : "Cancel Visit?",
      isVisited
        ? `Confirm that the visit for ${visit.patient_name} is complete.`
        : `Cancel the scheduled visit for ${visit.patient_name}?`,
      [
        { style: "cancel", text: "Back" },
        {
          onPress: () => mutation.mutate(status),
          style: isVisited ? "default" : "destructive",
          text: isVisited ? "Mark Visited" : "Cancel Visit",
        },
      ]
    );
  };

  if (visitId === null) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Visit Details" />
        <DoctorErrorState
          message="This visit link is invalid."
          onRetry={goBack}
          title="Invalid visit"
        />
      </SafeAreaView>
    );
  }

  if (visitQuery.isPending && !visitQuery.data) {
    return <DoctorLoadingState label="Loading visit details..." />;
  }

  if (visitQuery.error && !visitQuery.data) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Visit Details" />
        <DoctorErrorState
          message={getApiErrorMessage(
            visitQuery.error,
            "Unable to load this doctor visit."
          )}
          onRetry={() => void visitQuery.refetch()}
          title="Visit unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Visit Details" />
      <ScrollView contentContainerStyle={styles.content}>
        {visit ? (
          <>
            <View style={styles.headerCard}>
              <View style={styles.avatar}>
                <Ionicons
                  color={colors.primary}
                  name="calendar-outline"
                  size={24}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.patientName}>{visit.patient_name}</Text>
                <Text style={styles.patientPhone}>
                  {visit.patient_phone}
                </Text>
              </View>
              <DoctorStatusBadge status={visit.status} />
            </View>

            <View style={styles.detailCard}>
              <DoctorDetailRow label="Address" value={visit.patient_address} />
              <DoctorDetailRow
                label="Visit date"
                value={formatDoctorDate(visit.visit_date)}
              />
              <DoctorDetailRow
                label="Visit time"
                value={visit.visit_time?.slice(0, 5)}
              />
              <DoctorDetailRow
                label="Chief complaint"
                value={visit.chief_complaint || "Not available"}
              />
              <DoctorDetailRow
                label="Remarks"
                value={visit.remarks || "Not available"}
              />
              <DoctorDetailRow
                label="Completed"
                value={formatDoctorDateTime(visit.completed_at)}
              />
            </View>

            {visit.status === "scheduled" ? (
              <View style={styles.actionCard}>
                <DoctorField
                  label="Remarks"
                  multiline
                  placeholder="Add optional visit notes"
                  value={remarks}
                  onChangeText={setRemarks}
                />
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={mutation.isPending}
                    style={[
                      styles.actionButton,
                      styles.cancelButton,
                      mutation.isPending && styles.disabledButton,
                    ]}
                    onPress={() => confirmStatus("cancelled")}
                  >
                    {mutation.isPending &&
                    actionRef.current === "cancelled" ? (
                      <ActivityIndicator
                        color={colors.danger}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        color={colors.danger}
                        name="close-circle-outline"
                        size={18}
                      />
                    )}
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={mutation.isPending}
                    style={[
                      styles.actionButton,
                      styles.visitedButton,
                      mutation.isPending && styles.disabledButton,
                    ]}
                    onPress={() => confirmStatus("visited")}
                  >
                    {mutation.isPending &&
                    actionRef.current === "visited" ? (
                      <ActivityIndicator
                        color={colors.surface}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        color={colors.surface}
                        name="checkmark-circle-outline"
                        size={18}
                      />
                    )}
                    <Text style={styles.visitedText}>Mark Visited</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
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
  headerCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  headerText: {
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
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginTop: spacing.lgPlus,
    paddingHorizontal: spacing.xl,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginTop: spacing.lgPlus,
    padding: spacing.xl,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorderStrong,
    borderWidth: 1,
  },
  visitedButton: {
    backgroundColor: colors.primary,
  },
  cancelText: {
    color: colors.danger,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  visitedText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
