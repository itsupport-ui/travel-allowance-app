import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatScheduleTime,
  SchedulePriorityBadge,
  ScheduleStatusBadge,
} from "../../src/components/schedule/AdminScheduleUi";
import {
  AdminScheduleServiceError,
  cancelAdminSchedule,
} from "../../src/services/adminScheduleService";
import {
  getScheduleById,
  ScheduleServiceError,
} from "../../src/services/scheduleService";
import type { ScheduleResponse } from "../../src/types/schedule";
import { formatDateForDisplay } from "../../src/utils/date";
import { clearAuthSession } from "../../src/utils/storage";

const getSingleParam = (
  value: string | string[] | undefined
): string | undefined => (Array.isArray(value) ? value[0] : value);

const formatLabel = (value: string): string =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const DetailRow = ({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) => (
  <View style={styles.detailRow}>
    <View style={styles.detailIcon}>
      <Ionicons color={colors.primary} name={icon} size={18} />
    </View>
    <View style={styles.detailText}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  </View>
);

const Section = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

export default function AdminScheduleDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const parsedId = Number(getSingleParam(params.id));
  const scheduleId =
    Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        (requestError instanceof ScheduleServiceError ||
          requestError instanceof AdminScheduleServiceError) &&
        requestError.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }
      return false;
    },
    []
  );

  const load = useCallback(
    async (refresh = false): Promise<void> => {
      if (!scheduleId) {
        setError("A valid schedule ID is required.");
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setSchedule(await getScheduleById(scheduleId));
      } catch (requestError) {
        if (await handleSessionExpiry(requestError)) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load the schedule."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleSessionExpiry, scheduleId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = useCallback(() => {
    if (!scheduleId || !schedule) return;
    const performCancel = async (
      scope: "this" | "future" | "series"
    ) => {
      setCancelling(true);
      try {
        setSchedule(await cancelAdminSchedule(scheduleId, scope));
      } catch (requestError) {
        if (await handleSessionExpiry(requestError)) return;
        Alert.alert(
          "Unable to Cancel",
          requestError instanceof Error
            ? requestError.message
            : "Unable to cancel the appointment."
        );
      } finally {
        setCancelling(false);
      }
    };
    if (schedule.series_id) {
      Alert.alert(
        "Cancel Recurring Visit?",
        "Choose whether to cancel only this visit or this and future unstarted visits.",
        [
          { style: "cancel", text: "Keep Appointment" },
          {
            onPress: () => void performCancel("this"),
            text: "This Visit",
          },
          {
            onPress: () => void performCancel("future"),
            style: "destructive",
            text: "This and Future",
          },
        ]
      );
      return;
    }
    Alert.alert(
      "Cancel Appointment?",
      `${schedule.patient_name}'s appointment will be cancelled.`,
      [
        { style: "cancel", text: "Keep Appointment" },
        {
          onPress: async () => {
            await performCancel("this");
          },
          style: "destructive",
          text: "Cancel Appointment",
        },
      ]
    );
  }, [handleSessionExpiry, schedule, scheduleId]);

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading appointment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!schedule || error) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.center}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={40}
          />
          <Text style={styles.errorTitle}>Appointment unavailable</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const canEdit = schedule.available_actions.includes("edit");
  const canCancel = schedule.available_actions.includes("cancel");
  const dateLabel =
    schedule.series_id
      ? formatDateForDisplay(
          schedule.occurrence_date ?? schedule.treatment_date
        )
      : schedule.schedule_type === "recurring"
      ? `${formatDateForDisplay(schedule.start_date)} to ${formatDateForDisplay(
          schedule.end_date
        )}`
      : formatDateForDisplay(schedule.treatment_date);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons
            color={colors.textSecondary}
            name="arrow-back"
            size={22}
          />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Appointment #{schedule.id}</Text>
          <Text style={styles.title}>Schedule Details</Text>
        </View>
        <ScheduleStatusBadge status={schedule.status} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.patientHeader}>
          <View style={styles.patientAvatar}>
            <Ionicons
              color={colors.primary}
              name="person-outline"
              size={25}
            />
          </View>
          <View style={styles.patientIdentity}>
            <Text style={styles.patientName}>{schedule.patient_name}</Text>
            <Text style={styles.patientMeta}>
              {schedule.patient_reference_id ?? "No patient ID"}
              {schedule.patient_phone
                ? ` | ${schedule.patient_phone}`
                : ""}
            </Text>
          </View>
          <SchedulePriorityBadge priority={schedule.priority} />
        </View>

        <Section title="Visit Schedule">
          <DetailRow
            icon="calendar-outline"
            label={schedule.schedule_type === "recurring" ? "Date Range" : "Visit Date"}
            value={dateLabel ?? "Not set"}
          />
          <DetailRow
            icon="time-outline"
            label="Service Window"
            value={`${formatScheduleTime(
              schedule.in_time
            )} to ${formatScheduleTime(schedule.out_time)}`}
          />
          <DetailRow
            icon="repeat-outline"
            label="Schedule Type"
            value={schedule.series_id ? "Recurring Series Visit" : formatLabel(schedule.schedule_type)}
          />
        </Section>

        <Section title="Clinical Assignment">
          <DetailRow
            icon="person-circle-outline"
            label="Therapist"
            value={schedule.therapist_name ?? "Not assigned"}
          />
          <DetailRow
            icon="medical-outline"
            label="Doctor"
            value={schedule.doctor_name ?? "Not assigned"}
          />
        </Section>

        <Section title="Treatment">
          <DetailRow
            icon="medkit-outline"
            label="Treatment"
            value={schedule.treatment_name}
          />
          <DetailRow
            icon="home-outline"
            label="Visit Type"
            value={formatLabel(schedule.visit_type)}
          />
          <DetailRow
            icon="medical-outline"
            label="Medicines"
            value={schedule.medicines || "None recorded"}
          />
        </Section>

        <Section title="Patient Location">
          <DetailRow
            icon="location-outline"
            label="Address"
            value={schedule.patient_address}
          />
        </Section>

        <Section title="Visit Guidance">
          <DetailRow
            icon="list-outline"
            label="Instructions"
            value={schedule.instructions}
          />
          <DetailRow
            icon="clipboard-outline"
            label="Clinical Notes"
            value={schedule.clinical_notes || "None recorded"}
          />
          <DetailRow
            icon="warning-outline"
            label="Precautions"
            value={schedule.precautions || "None recorded"}
          />
        </Section>
      </ScrollView>

      {canEdit || canCancel ? (
        <View style={styles.actionBar}>
          {canEdit ? <><TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(admin)/schedule-edit",
                params: { id: String(schedule.id) },
              })
            }
            style={styles.secondaryButton}
          >
            <Ionicons
              color={colors.primary}
              name="create-outline"
              size={18}
            />
            <Text style={styles.secondaryButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(admin)/schedule-edit",
                params: { id: String(schedule.id), reschedule: "1" },
              })
            }
            style={styles.secondaryButton}
          >
            <Ionicons
              color={colors.primary}
              name="calendar-number-outline"
              size={18}
            />
            <Text style={styles.secondaryButtonText}>Reschedule</Text>
          </TouchableOpacity></> : null}
          {canCancel ? <TouchableOpacity
            accessibilityRole="button"
            disabled={cancelling}
            onPress={cancel}
            style={styles.cancelButton}
          >
            {cancelling ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Ionicons
                color={colors.danger}
                name="close-circle-outline"
                size={18}
              />
            )}
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity> : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headerText: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: 2,
  },
  content: { padding: spacing.xxl, paddingBottom: 110 },
  patientHeader: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  patientAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  patientIdentity: { flex: 1 },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  patientMeta: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: 3,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  sectionTitle: {
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    padding: spacing.lg,
  },
  sectionBody: { paddingHorizontal: spacing.lg },
  detailRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  detailIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  detailText: { flex: 1 },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 21,
    marginTop: 3,
  },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    left: 0,
    padding: spacing.md,
    position: "absolute",
    right: 0,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  cancelButton: {
    alignItems: "center",
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
  },
  cancelText: {
    color: colors.danger,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
  },
  loadingText: { color: colors.textMuted, marginTop: spacing.lg },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  errorMessage: {
    color: colors.textMuted,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: typography.weight.bold,
  },
});
