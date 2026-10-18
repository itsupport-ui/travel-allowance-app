import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import {
  DoctorBackHeader,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  cancelDoctorTask,
  getManagedDoctorTasks,
} from "../../src/services/doctorTaskService";
import { taskTypeLabels } from "../../src/utils/doctorTask";
import { formatDoctorDate } from "../../src/utils/doctorWorkflow";

const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(admin)/doctor-workflow" as Href);
  }
};

export default function AdminDoctorTasksScreen() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const tasksQuery = useQuery({
    queryFn: () =>
      getManagedDoctorTasks({ scheduled_date: date || undefined }),
    queryKey: ["admin", "doctor-tasks", date],
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      cancelDoctorTask(id, reason),
    onError: (error) =>
      Alert.alert(
        "Unable to Cancel",
        getApiErrorMessage(error, "Unable to cancel this task.")
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "doctor-tasks"] }),
  });

  const confirmCancel = (id: number, title: string) => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Cancel task?",
        `Give a reason for cancelling "${title}" (min 5 characters).`,
        [
          { style: "cancel", text: "Back" },
          {
            onPress: (reason?: string) => {
              if ((reason ?? "").trim().length < 5) {
                Alert.alert("Reason needed", "Enter at least 5 characters.");
                return;
              }
              cancelMutation.mutate({ id, reason: (reason ?? "").trim() });
            },
            style: "destructive",
            text: "Cancel task",
          },
        ]
      );
      return;
    }
    // Alert.prompt is iOS-only; Android confirms and records a standard reason.
    Alert.alert("Cancel task?", `Cancel "${title}" for the doctor?`, [
      { style: "cancel", text: "Back" },
      {
        onPress: () =>
          cancelMutation.mutate({ id, reason: "Cancelled by clinical head" }),
        style: "destructive",
        text: "Cancel task",
      },
    ]);
  };

  const tasks = tasksQuery.data ?? [];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        action={
          <TouchableOpacity
            accessibilityLabel="Assign a task"
            accessibilityRole="button"
            onPress={() => router.push("/(admin)/doctor-task-create" as Href)}
          >
            <Ionicons color={colors.primary} name="add-circle" size={30} />
          </TouchableOpacity>
        }
        onBack={goBack}
        title="Doctor Tasks"
      />
      <View style={styles.filters}>
        <AppDatePickerField
          allowClear
          label="Date"
          placeholder="All dates"
          value={date}
          onChange={setDate}
        />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.push("/(admin)/places" as Href)}
        >
          <Text style={styles.link}>Manage places</Text>
        </TouchableOpacity>
      </View>
      {tasksQuery.isPending ? (
        <DoctorLoadingState label="Loading tasks..." />
      ) : tasksQuery.error ? (
        <DoctorErrorState
          message={getApiErrorMessage(
            tasksQuery.error,
            "Unable to load doctor tasks."
          )}
          onRetry={() => void tasksQuery.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={tasksQuery.isRefetching}
              onRefresh={() => void tasksQuery.refetch()}
            />
          }
        >
          {tasks.length === 0 ? (
            <DoctorEmptyState
              description="Assign clinic training, patient visits or other work to a doctor."
              icon="clipboard-outline"
              title="No tasks"
            />
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{task.title}</Text>
                    <Text style={styles.meta}>
                      {task.doctor_name ?? `Doctor #${task.doctor_id}`} ·{" "}
                      {taskTypeLabels[task.task_type]}
                    </Text>
                    <Text style={styles.meta}>
                      {formatDoctorDate(task.scheduled_date)} ·{" "}
                      {task.place?.name ?? task.patient_name ?? ""}
                    </Text>
                  </View>
                  <DoctorStatusBadge status={task.status} />
                </View>
                {task.status === "assigned" ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={cancelMutation.isPending}
                    onPress={() => confirmCancel(task.id, task.title)}
                  >
                    <Text style={styles.cancel}>Cancel task</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  link: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  content: { gap: spacing.md, padding: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardHead: { alignItems: "center", flexDirection: "row", gap: spacing.lg },
  cardText: { flex: 1 },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  meta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  cancel: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
});
