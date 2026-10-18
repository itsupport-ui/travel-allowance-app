import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
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
  DoctorChoiceChips,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorLoadingState,
  DoctorPressableCard,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { getMyDoctorTasks } from "../../src/services/doctorTaskService";
import type {
  DoctorTaskScope,
  DoctorTaskType,
} from "../../src/types/doctorTask";
import { openDoctorTask, taskTypeLabels } from "../../src/utils/doctorTask";
import { formatDoctorDate } from "../../src/utils/doctorWorkflow";

const scopeOptions: readonly { label: string; value: DoctorTaskScope }[] = [
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "History", value: "history" },
];

const taskIcons: Record<DoctorTaskType, keyof typeof Ionicons.glyphMap> = {
  clinic_training: "school-outline",
  other: "briefcase-outline",
  patient_visit: "person-outline",
};

const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(doctor)/(tabs)/work" as Href);
  }
};

export default function DoctorTasksScreen() {
  const [scope, setScope] = useState<DoctorTaskScope>("today");
  const tasksQuery = useQuery({
    queryFn: () => getMyDoctorTasks(scope),
    queryKey: ["doctor", "tasks", "mine", scope],
  });
  const tasks = tasksQuery.data ?? [];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="My Tasks" />
      <View style={styles.chips}>
        <DoctorChoiceChips
          options={scopeOptions}
          value={scope}
          onChange={setScope}
        />
      </View>
      {tasksQuery.isPending ? (
        <DoctorLoadingState label="Loading tasks..." />
      ) : tasksQuery.error ? (
        <DoctorErrorState
          message={getApiErrorMessage(
            tasksQuery.error,
            "Unable to load your tasks."
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
              description="Tasks assigned to you will appear here."
              icon="checkmark-done-outline"
              title={`No ${scope} tasks`}
            />
          ) : (
            tasks.map((task) => (
              <DoctorPressableCard
                accessibilityLabel={`Open task ${task.title}`}
                key={task.id}
                style={styles.card}
                onPress={() => openDoctorTask(task)}
              >
                <View style={styles.icon}>
                  <Ionicons
                    color={colors.primary}
                    name={taskIcons[task.task_type]}
                    size={22}
                  />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{task.title}</Text>
                  <Text style={styles.cardMeta}>
                    {taskTypeLabels[task.task_type]} ·{" "}
                    {formatDoctorDate(task.scheduled_date)}
                  </Text>
                  <Text numberOfLines={1} style={styles.cardMeta}>
                    {task.place?.name ?? task.patient_name ?? ""}
                  </Text>
                </View>
                <DoctorStatusBadge status={task.status} />
              </DoctorPressableCard>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  chips: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  content: { gap: spacing.md, padding: spacing.xl },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.lg,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  cardText: { flex: 1 },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
});
