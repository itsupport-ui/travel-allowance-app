import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormScrollView } from "../../src/components/layout/FormScrollView";
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
  getDoctorVisitSession,
  punchInDoctorVisit,
  punchOutDoctorVisit,
  updateDoctorVisitStatus,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { isOfflineMutationQueuedError } from "../../src/services/offlineMutationQueue";
import { createLocationException } from "../../src/services/locationExceptionService";
import type { DoctorVisit } from "../../src/types/doctorWorkflow";
import {
  formatDoctorDate,
  formatDoctorDateTime,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";
import {
  getCurrentLocation,
  requestLocationPermission,
} from "../../src/utils/location";

type VisitAction = "cancelled";

const formatSessionTime = (value: string | null | undefined): string =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not recorded";

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
};

export default function DoctorVisitDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const visitId = useMemo(() => parsePositiveId(id), [id]);
  const queryClient = useQueryClient();
  const actionRef = useRef<VisitAction | null>(null);
  const [remarks, setRemarks] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    deviceTimestamp: string;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);
  const visitQuery = useQuery({
    enabled: visitId !== null,
    queryFn: () => getDoctorVisit(visitId ?? 0),
    queryKey:
      visitId === null
        ? ["doctor", "visits", "detail", "invalid"]
        : queryKeys.doctor.visits.detail(visitId),
  });
  const visit = visitQuery.data;
  const sessionQuery = useQuery({
    enabled:
      visitId !== null &&
      visit?.status === "scheduled" &&
      (coordinates !== null || visit.session_status === "IN_PROGRESS"),
    queryFn: () =>
      getDoctorVisitSession(
        visitId ?? 0,
        coordinates?.latitude,
        coordinates?.longitude,
        Math.max(coordinates?.accuracy ?? 1, 1),
        coordinates?.deviceTimestamp
      ),
    queryKey:
      visitId === null
        ? ["doctor", "visits", "session", "invalid"]
        : queryKeys.doctor.visits.session(
            visitId,
            coordinates?.latitude,
            coordinates?.longitude
          ),
  });

  useEffect(() => {
    if (
      !visit ||
      visit.status !== "scheduled" ||
      visit.session_status === "COMPLETED"
    ) {
      return;
    }
    let active = true;
    const capture = async () => {
      try {
        await requestLocationPermission();
        const current = await getCurrentLocation();
        if (active) {
          setCoordinates({
            ...current,
            deviceTimestamp: new Date().toISOString(),
          });
          setLocationError(null);
        }
      } catch (error) {
        if (active) {
          setLocationError(
            getApiErrorMessage(
              error,
              "Unable to capture current location."
            )
          );
        }
      }
    };
    void capture();
    return () => {
      active = false;
    };
  }, [visit]);

  useEffect(() => {
    if (sessionQuery.data?.session_status !== "IN_PROGRESS") {
      return;
    }
    const timer = setInterval(
      () => setElapsedTick((value) => value + 1),
      1000
    );
    return () => clearInterval(timer);
  }, [sessionQuery.data?.session_status]);

  const invalidateVisitData = async () => {
    if (visitId !== null) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.doctor.visits.detail(visitId),
      });
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.doctor.visits.all,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.doctor.visits.dashboard,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.doctor.visits.completedToday,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.doctor.workday.route,
      }),
    ]);
  };
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!visit) {
        throw new Error("Visit is not loaded.");
      }
      actionRef.current = "cancelled";
      return updateDoctorVisitStatus(visit.id, {
        remarks: remarks.trim() || null,
        status: "cancelled",
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
      await invalidateVisitData();
      Alert.alert("Visit Cancelled", "The visit has been cancelled.");
    },
    onSettled: () => {
      actionRef.current = null;
    },
  });
  const punchInMutation = useMutation({
    mutationFn: async () => {
      if (visitId === null) {
        throw new Error("A valid visit ID is required.");
      }
      await requestLocationPermission();
      const current = await getCurrentLocation();
      return punchInDoctorVisit(
        visitId,
        current.latitude,
        current.longitude,
        Math.max(current.accuracy ?? 1, 1),
        sessionQuery.data?.location_exception_id
      );
    },
    onError: (error) => {
      Alert.alert(
        isOfflineMutationQueuedError(error)
          ? "Saved for Sync"
          : "Unable to Punch In",
        getApiErrorMessage(error, "Unable to start this visit.")
      );
    },
    onSuccess: async (session) => {
      queryClient.setQueryData(
        queryKeys.doctor.visits.session(
          session.visit_id,
          coordinates?.latitude,
          coordinates?.longitude
        ),
        session
      );
      await invalidateVisitData();
      Alert.alert("Treatment Started", "Punch In was recorded.");
    },
  });
  const punchOutMutation = useMutation({
    mutationFn: async () => {
      if (visitId === null) {
        throw new Error("A valid visit ID is required.");
      }
      await requestLocationPermission();
      const current = await getCurrentLocation();
      return punchOutDoctorVisit(visitId, {
        latitude: current.latitude,
        longitude: current.longitude,
        gps_accuracy_m: Math.max(current.accuracy ?? 1, 1),
        location_exception_id:
          sessionQuery.data?.location_exception_id,
        remarks: remarks.trim() || null,
      });
    },
    onError: (error) => {
      Alert.alert(
        isOfflineMutationQueuedError(error)
          ? "Saved for Sync"
          : "Unable to Punch Out",
        getApiErrorMessage(error, "Unable to complete this visit.")
      );
    },
    onSuccess: async () => {
      await invalidateVisitData();
      Alert.alert("Visit Completed", "Punch Out was recorded.");
    },
  });
  const exceptionMutation = useMutation({
    mutationFn: async () => {
      if (visitId === null || exceptionReason.trim().length < 10) {
        throw new Error("Enter at least 10 characters explaining the GPS issue.");
      }
      await requestLocationPermission();
      const current = await getCurrentLocation();
      setCoordinates({
        ...current,
        deviceTimestamp: new Date().toISOString(),
      });
      return createLocationException({
        action:
          sessionQuery.data?.session_status === "IN_PROGRESS"
            ? "punch_out"
            : "punch_in",
        device_timestamp: new Date().toISOString(),
        gps_accuracy_m: Math.max(current.accuracy ?? 1, 1),
        latitude: current.latitude,
        longitude: current.longitude,
        reason: exceptionReason.trim(),
        target_id: visitId,
        target_type: "doctor_visit",
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Request Exception",
        getApiErrorMessage(error, "Unable to send this location exception.")
      );
    },
    onSuccess: async () => {
      setExceptionReason("");
      await sessionQuery.refetch();
      Alert.alert(
        "Request Sent",
        "An administrator must approve this one-time location exception before you continue."
      );
    },
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/visits" as Href);
    }
  };
  const confirmCancel = () => {
    if (!visit || cancelMutation.isPending) {
      return;
    }
    Alert.alert(
      "Cancel Visit?",
      `Cancel the scheduled visit for ${visit.patient_name}?`,
      [
        { style: "cancel", text: "Back" },
        {
          onPress: () => cancelMutation.mutate(),
          style: "destructive",
          text: "Cancel Visit",
        },
      ]
    );
  };
  const confirmPunchIn = () => {
    Alert.alert(
      "Punch In?",
      `Start the visit for ${visit?.patient_name ?? "this patient"}?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => punchInMutation.mutate(),
          text: "Punch In",
        },
      ]
    );
  };
  const confirmPunchOut = () => {
    Alert.alert(
      "Punch Out?",
      "This completes the visit and records the treatment duration.",
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => punchOutMutation.mutate(),
          text: "Punch Out",
        },
      ]
    );
  };
  const refreshLocation = async () => {
    try {
      await requestLocationPermission();
      const current = await getCurrentLocation();
      setCoordinates({
        ...current,
        deviceTimestamp: new Date().toISOString(),
      });
      setLocationError(null);
    } catch (error) {
      setLocationError(
        getApiErrorMessage(error, "Unable to capture current location.")
      );
    }
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

  const session = sessionQuery.data;
  const elapsedSeconds =
    session?.session_status === "IN_PROGRESS" && session.punch_in_time
      ? Math.max(
          session.elapsed_seconds,
          Math.floor(
            (Date.now() - new Date(session.punch_in_time).getTime()) /
              1000
          )
        )
      : (session?.treatment_duration ?? 0);
  void elapsedTick;
  const actionBusy =
    cancelMutation.isPending ||
    punchInMutation.isPending ||
    punchOutMutation.isPending ||
    exceptionMutation.isPending;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Visit Details" />
      <FormScrollView contentContainerStyle={styles.content}>
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
                <Text style={styles.sessionTitle}>Visit Session</Text>
                {sessionQuery.isPending && !session ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={styles.sessionLoader}
                  />
                ) : (
                  <>
                    <DoctorDetailRow
                      label="Session status"
                      value={
                        session?.session_status ??
                        visit.session_status
                      }
                    />
                    <DoctorDetailRow
                      label="Punch In"
                      value={formatSessionTime(
                        session?.punch_in_time ??
                          visit.punch_in_time
                      )}
                    />
                    {(session?.session_status ??
                      visit.session_status) !== "NOT_STARTED" ? (
                      <DoctorDetailRow
                        label={
                          session?.session_status === "IN_PROGRESS"
                            ? "Elapsed"
                            : "Duration"
                        }
                        value={formatDuration(elapsedSeconds)}
                      />
                    ) : null}
                  </>
                )}
                {session?.eligibility_message ? (
                  <Text style={styles.eligibilityText}>
                    {session.eligibility_message}
                  </Text>
                ) : null}
                {locationError ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.locationRetry}
                    onPress={() => void refreshLocation()}
                  >
                    <Text style={styles.locationError}>
                      {locationError}
                    </Text>
                    <Text style={styles.retryText}>Retry location</Text>
                  </TouchableOpacity>
                ) : null}
                <DoctorField
                  label="Remarks"
                  multiline
                  placeholder="Add optional visit notes"
                  value={remarks}
                  onChangeText={setRemarks}
                />
                {session?.can_request_location_exception ? (
                  <View style={styles.exceptionBox}>
                    <Text style={styles.exceptionTitle}>GPS exception request</Text>
                    <Text style={styles.exceptionHelp}>
                      Explain the issue. A fresh GPS reading will be sent for one-time administrator approval.
                    </Text>
                    <DoctorField
                      label="Exception reason"
                      multiline
                      placeholder="Explain why the normal GPS check cannot be completed"
                      value={exceptionReason}
                      onChangeText={setExceptionReason}
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={actionBusy || exceptionReason.trim().length < 10}
                      style={[styles.exceptionButton, (actionBusy || exceptionReason.trim().length < 10) && styles.disabledButton]}
                      onPress={() => exceptionMutation.mutate()}
                    >
                      {exceptionMutation.isPending ? (
                        <ActivityIndicator color={colors.warning} size="small" />
                      ) : (
                        <Ionicons color={colors.warning} name="warning-outline" size={18} />
                      )}
                      <Text style={styles.exceptionButtonText}>Capture GPS & Send</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={
                      actionBusy ||
                      (session?.session_status ??
                        visit.session_status) === "IN_PROGRESS"
                    }
                    style={[
                      styles.actionButton,
                      styles.cancelButton,
                      actionBusy && styles.disabledButton,
                    ]}
                    onPress={confirmCancel}
                  >
                    {cancelMutation.isPending &&
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

                  {session?.can_punch_in ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={actionBusy}
                      style={[
                        styles.actionButton,
                        styles.visitedButton,
                        actionBusy && styles.disabledButton,
                      ]}
                      onPress={confirmPunchIn}
                    >
                      {punchInMutation.isPending ? (
                        <ActivityIndicator
                          color={colors.surface}
                          size="small"
                        />
                      ) : (
                        <Ionicons
                          color={colors.surface}
                          name="log-in-outline"
                          size={18}
                        />
                      )}
                      <Text style={styles.visitedText}>Punch In</Text>
                    </TouchableOpacity>
                  ) : null}
                  {session?.can_punch_out ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={actionBusy}
                      style={[
                        styles.actionButton,
                        styles.visitedButton,
                        actionBusy && styles.disabledButton,
                      ]}
                      onPress={confirmPunchOut}
                    >
                      {punchOutMutation.isPending ? (
                        <ActivityIndicator
                          color={colors.surface}
                          size="small"
                        />
                      ) : (
                        <Ionicons
                          color={colors.surface}
                          name="log-out-outline"
                          size={18}
                        />
                      )}
                      <Text style={styles.visitedText}>Punch Out</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </FormScrollView>
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
  sessionTitle: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
  },
  sessionLoader: {
    marginVertical: spacing.xl,
  },
  eligibilityText: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  locationRetry: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  locationError: {
    color: colors.danger,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
  },
  retryText: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
  },
  exceptionBox: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBright,
    borderRadius: radius.control,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  exceptionTitle: {
    color: colors.warningDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  exceptionHelp: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  exceptionButton: {
    alignItems: "center",
    borderColor: colors.warning,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
  },
  exceptionButtonText: {
    color: colors.warningDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
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
