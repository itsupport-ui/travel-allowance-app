import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  getMyDoctorTask,
  punchInDoctorTask,
  punchOutDoctorTask,
} from "../../src/services/doctorTaskService";
import {
  createLocationException,
  listMyLocationExceptions,
} from "../../src/services/locationExceptionService";
import type {
  TaskProofPhoto,
  TaskPunchLocation,
} from "../../src/types/doctorTask";
import { taskTypeLabels } from "../../src/utils/doctorTask";
import {
  formatDoctorDate,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";
import {
  getCurrentLocation,
  requestLocationPermission,
} from "../../src/utils/location";

const formatTime = (value: string | null | undefined): string =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not recorded";

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export default function DoctorTaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const taskId = useMemo(() => parsePositiveId(id), [id]);
  const queryClient = useQueryClient();
  const [location, setLocation] = useState<TaskPunchLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<TaskProofPhoto | null>(null);
  const [notes, setNotes] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  const taskQuery = useQuery({
    enabled: taskId !== null,
    queryFn: () => getMyDoctorTask(taskId ?? 0),
    queryKey: ["doctor", "tasks", "detail", taskId],
  });
  const task = taskQuery.data;
  const action = task?.can_punch_in ? "punch_in" : "punch_out";
  const active = Boolean(task?.can_punch_in || task?.can_punch_out);

  const exceptionsQuery = useQuery({
    enabled: active,
    queryFn: listMyLocationExceptions,
    queryKey: ["doctor", "tasks", "exceptions", taskId],
  });
  const currentException = (exceptionsQuery.data ?? []).find(
    (request) =>
      request.target_type === "doctor_task" &&
      request.target_id === taskId &&
      request.action === action &&
      (request.status === "pending" || request.status === "approved")
  );
  const approvedExceptionId =
    currentException?.status === "approved" ? currentException.id : null;

  const captureLocation = async () => {
    try {
      await requestLocationPermission();
      setLocation(await getCurrentLocation());
      setLocationError(null);
    } catch (error) {
      setLocationError(
        getApiErrorMessage(error, "Unable to capture current location.")
      );
    }
  };

  useEffect(() => {
    if (active) {
      void captureLocation();
    }
  }, [active]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["doctor", "tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["doctor", "workday"] }),
    ]);
  };

  const freshLocation = async (): Promise<TaskPunchLocation> => {
    await requestLocationPermission();
    const current = await getCurrentLocation();
    setLocation(current);
    return current;
  };

  const punchInMutation = useMutation({
    mutationFn: async () =>
      punchInDoctorTask(taskId ?? 0, await freshLocation(), approvedExceptionId),
    onError: (error) =>
      Alert.alert(
        "Unable to Punch In",
        getApiErrorMessage(error, "Unable to start this task.")
      ),
    onSuccess: async () => {
      await refreshAll();
      Alert.alert("Task Started", "Punch In was recorded.");
    },
  });
  const punchOutMutation = useMutation({
    mutationFn: async () => {
      if (!photo) {
        throw new Error("Take a proof photo before punching out.");
      }
      return punchOutDoctorTask(
        taskId ?? 0,
        await freshLocation(),
        photo,
        notes,
        approvedExceptionId
      );
    },
    onError: (error) =>
      Alert.alert(
        "Unable to Punch Out",
        getApiErrorMessage(error, "Unable to complete this task.")
      ),
    onSuccess: async () => {
      setPhoto(null);
      await refreshAll();
      Alert.alert("Task Completed", "Punch Out and proof were recorded.");
    },
  });
  const exceptionMutation = useMutation({
    mutationFn: async () => {
      if (taskId === null || exceptionReason.trim().length < 10) {
        throw new Error(
          "Enter at least 10 characters explaining the GPS issue."
        );
      }
      const current = await freshLocation();
      return createLocationException({
        action,
        device_timestamp: new Date().toISOString(),
        gps_accuracy_m: Math.max(current.accuracy ?? 1, 1),
        latitude: current.latitude,
        longitude: current.longitude,
        reason: exceptionReason.trim(),
        target_id: taskId,
        target_type: "doctor_task",
      });
    },
    onError: (error) =>
      Alert.alert(
        "Unable to Request Exception",
        getApiErrorMessage(error, "Unable to send this location exception.")
      ),
    onSuccess: async () => {
      setExceptionReason("");
      await exceptionsQuery.refetch();
      Alert.alert(
        "Request Sent",
        "An administrator must approve this one-time location exception before you continue."
      );
    },
  });

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera Needed",
        "Allow camera access to capture proof of completed work."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        fileName: `task-${taskId}-proof.jpg`,
        mimeType: "image/jpeg",
        uri: asset.uri,
      });
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/tasks" as Href);
    }
  };

  const busy =
    punchInMutation.isPending ||
    punchOutMutation.isPending ||
    exceptionMutation.isPending;

  if (taskId === null) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Task" />
        <DoctorErrorState
          message="This task link is invalid."
          onRetry={goBack}
          title="Invalid task"
        />
      </SafeAreaView>
    );
  }
  if (taskQuery.isPending) {
    return <DoctorLoadingState label="Loading task..." />;
  }
  if (taskQuery.error || !task) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Task" />
        <DoctorErrorState
          message={getApiErrorMessage(
            taskQuery.error,
            "Unable to load this task."
          )}
          onRetry={() => void taskQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Task" />
      <FormScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{task.title}</Text>
            <Text style={styles.subtitle}>
              {taskTypeLabels[task.task_type]}
            </Text>
          </View>
          <DoctorStatusBadge status={task.status} />
        </View>

        <View style={styles.detailCard}>
          <DoctorDetailRow
            label="Date"
            value={formatDoctorDate(task.scheduled_date)}
          />
          <DoctorDetailRow label="Place" value={task.place?.name ?? ""} />
          <DoctorDetailRow label="Address" value={task.place?.address ?? ""} />
          <DoctorDetailRow
            label="Allowed radius"
            value={
              task.geofence_radius_m
                ? `${Math.round(task.geofence_radius_m)} m`
                : "Not set"
            }
          />
          <DoctorDetailRow label="Notes" value={task.notes ?? "None"} />
          <DoctorDetailRow
            label="Punch In"
            value={formatTime(task.punch_in_time)}
          />
          <DoctorDetailRow
            label="Punch Out"
            value={formatTime(task.punch_out_time)}
          />
          {task.duration_seconds ? (
            <DoctorDetailRow
              label="Duration"
              value={formatDuration(task.duration_seconds)}
            />
          ) : null}
          {task.cancel_reason ? (
            <DoctorDetailRow label="Cancelled" value={task.cancel_reason} />
          ) : null}
        </View>

        {active ? (
          <View style={styles.actionCard}>
            <Text style={styles.sectionTitle}>
              {task.can_punch_in ? "Start this task" : "Finish this task"}
            </Text>
            {locationError ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.locationError}
                onPress={() => void captureLocation()}
              >
                <Text style={styles.errorText}>{locationError}</Text>
                <Text style={styles.retryText}>Retry location</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.hint}>
                {location
                  ? `Location ready (accuracy ±${Math.round(location.accuracy ?? 0)} m).`
                  : "Capturing your location..."}
              </Text>
            )}

            {task.can_punch_out ? (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.photoButton}
                  onPress={() => void takePhoto()}
                >
                  <Ionicons
                    color={colors.primary}
                    name="camera-outline"
                    size={20}
                  />
                  <Text style={styles.photoText}>
                    {photo ? "Retake proof photo" : "Take proof photo"}
                  </Text>
                </TouchableOpacity>
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.preview} />
                ) : null}
                <DoctorField
                  label="Notes"
                  multiline
                  placeholder="Optional notes about the completed work"
                  value={notes}
                  onChangeText={setNotes}
                />
              </>
            ) : null}

            {currentException?.status === "pending" ? (
              <Text style={styles.hint}>
                Your GPS exception request is waiting for administrator
                approval.
              </Text>
            ) : approvedExceptionId ? (
              <Text style={styles.hint}>
                A one-time GPS exception is approved and will be used on the
                next punch.
              </Text>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy || (task.can_punch_out && !photo)}
              style={[
                styles.primaryButton,
                (busy || (task.can_punch_out && !photo)) && styles.disabled,
              ]}
              onPress={() =>
                Alert.alert(
                  task.can_punch_in ? "Punch In?" : "Punch Out?",
                  task.can_punch_in
                    ? "Start this task at your current location?"
                    : "Complete this task with the proof photo?",
                  [
                    { style: "cancel", text: "Cancel" },
                    {
                      onPress: () =>
                        task.can_punch_in
                          ? punchInMutation.mutate()
                          : punchOutMutation.mutate(),
                      text: task.can_punch_in ? "Punch In" : "Punch Out",
                    },
                  ]
                )
              }
            >
              {busy ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryText}>
                  {task.can_punch_in ? "Punch In" : "Punch Out"}
                </Text>
              )}
            </TouchableOpacity>

            {!currentException ? (
              <View style={styles.exceptionBox}>
                <Text style={styles.exceptionTitle}>Trouble with GPS?</Text>
                <DoctorField
                  label="Exception reason"
                  multiline
                  placeholder="Explain why the normal GPS check cannot be completed"
                  value={exceptionReason}
                  onChangeText={setExceptionReason}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy || exceptionReason.trim().length < 10}
                  style={[
                    styles.exceptionButton,
                    (busy || exceptionReason.trim().length < 10) &&
                      styles.disabled,
                  ]}
                  onPress={() => exceptionMutation.mutate()}
                >
                  <Text style={styles.exceptionText}>
                    Request GPS exception
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {task.status === "completed" && task.has_proof ? (
          <Text style={styles.hint}>Proof photo submitted.</Text>
        ) : null}
        {task.status === "assigned" && !task.can_punch_in ? (
          <Text style={styles.hint}>
            Punch In is available on the task date.
          </Text>
        ) : null}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  headerCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  headerText: { flex: 1 },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  subtitle: {
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
  sectionTitle: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginVertical: spacing.md,
  },
  locationError: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  errorText: { color: colors.danger, fontSize: typography.size.small },
  retryText: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
  },
  photoButton: {
    alignItems: "center",
    borderColor: colors.primary,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginVertical: spacing.md,
    minHeight: 46,
  },
  photoText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  preview: {
    borderRadius: radius.control,
    height: 180,
    marginBottom: spacing.lg,
    width: "100%",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  primaryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  exceptionBox: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBright,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  exceptionTitle: {
    color: colors.warningDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
  },
  exceptionButton: {
    alignItems: "center",
    borderColor: colors.warning,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  exceptionText: {
    color: colors.warningDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabled: { opacity: 0.6 },
});
