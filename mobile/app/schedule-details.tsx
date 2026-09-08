import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { FormScrollView } from "../src/components/layout/FormScrollView";
import { ScheduleListSkeleton } from "../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../src/query/queryKeys";
import { getApiErrorMessage } from "../src/services/errorHandler";
import { isOfflineMutationQueuedError } from "../src/services/offlineMutationQueue";
import { createLocationException } from "../src/services/locationExceptionService";
import {
  getScheduleById,
  getTreatmentSession,
  markTreatmentMissed,
  punchInTreatment,
  punchOutTreatment,
} from "../src/services/scheduleService";
import type { ScheduleTransportMode } from "../src/types/schedule";
import {
  getCurrentLocation,
  requestLocationPermission,
} from "../src/utils/location";

const PRIMARY = colors.primary;
const DANGER = colors.danger;
const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

type ActionMode = "complete" | "missed" | null;

interface InvoiceFile {
  mimeType: string;
  name: string;
  size: number | null;
  uri: string;
}

const transportModes: {
  label: string;
  value: ScheduleTransportMode;
}[] = [
  { label: "Vehicle", value: "vehicle" },
  { label: "Auto", value: "auto" },
  { label: "Bus", value: "bus" },
  { label: "Metro", value: "metro" },
  { label: "Cab", value: "cab" },
];

const parseScheduleId = (
  value: string | string[] | undefined
): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue || !/^\d+$/.test(rawValue)) {
    return null;
  }

  const id = Number(rawValue);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const formatTime = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Time not available";
  }

  const [hourValue, minuteValue] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`;
};

const formatLabel = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Not available";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDateTime = (
  value: string | null | undefined
): string => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [
    hours > 0 ? `${hours}h` : null,
    `${minutes}m`,
    `${remainingSeconds}s`,
  ]
    .filter(Boolean)
    .join(" ");
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "Not available"}</Text>
    </View>
  );
}

function Section({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function ScheduleDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const scheduleId = useMemo(
    () => parseScheduleId(params.id),
    [params.id]
  );
  const queryClient = useQueryClient();
  const completionRef = useRef(false);
  const missedRef = useRef(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [missedReason, setMissedReason] = useState("");
  const [transportMode, setTransportMode] =
    useState<ScheduleTransportMode>("vehicle");
  const [billAmount, setBillAmount] = useState("");
  const [invoiceFile, setInvoiceFile] =
    useState<InvoiceFile | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [locationAccuracy, setLocationAccuracy] =
    useState<number | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [eligibilityCoordinates, setEligibilityCoordinates] = useState<{
    device_timestamp: string;
    gps_accuracy_m: number;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [eligibilityError, setEligibilityError] =
    useState<string | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [exceptionVisible, setExceptionVisible] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [, setElapsedTick] = useState(0);

  const scheduleQuery = useQuery({
    enabled: scheduleId !== null,
    queryKey:
      scheduleId === null
        ? ["schedules", "detail", "invalid"]
        : queryKeys.schedules.detail(scheduleId),
    queryFn: () => {
      if (scheduleId === null) {
        throw new Error("A valid schedule ID is required.");
      }

      return getScheduleById(scheduleId);
    },
  });

  const sessionQuery = useQuery({
    enabled: scheduleId !== null,
    queryKey:
      scheduleId === null
        ? ["treatment-sessions", "invalid"]
        : queryKeys.treatmentSessions.detail(
            scheduleId,
            eligibilityCoordinates?.latitude,
            eligibilityCoordinates?.longitude
          ),
    queryFn: () => {
      if (scheduleId === null) {
        throw new Error("A valid schedule ID is required.");
      }
      return getTreatmentSession(
        scheduleId,
        eligibilityCoordinates ?? undefined
      );
    },
  });

  useEffect(() => {
    const schedule = scheduleQuery.data;
    if (
      !schedule ||
      schedule.status !== "scheduled" ||
      schedule.session_status === "COMPLETED"
    ) {
      return;
    }

    let active = true;
    setCheckingEligibility(true);
    setEligibilityError(null);

    void (async () => {
      try {
        await requestLocationPermission();
        const coordinates = await getCurrentLocation();
        if (active) {
          setLocationAccuracy(coordinates.accuracy);
          setEligibilityCoordinates({
            device_timestamp: new Date().toISOString(),
            gps_accuracy_m: Math.max(coordinates.accuracy ?? 1, 1),
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          });
        }
      } catch (error) {
        if (active) {
          setEligibilityError(
            getApiErrorMessage(
              error,
              "Unable to verify your current location."
            )
          );
        }
      } finally {
        if (active) setCheckingEligibility(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [scheduleQuery.data]);

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

  const invalidateTreatmentQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.schedules.all,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.treatmentSessions.all,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.travel.today,
        refetchType: "all",
      }),
    ]);
  };

  const completionMutation = useMutation({
    mutationFn: async () => {
      if (scheduleId === null) {
        throw new Error("A valid schedule ID is required.");
      }

      setCapturingLocation(true);
      await requestLocationPermission();
      const coordinates = await getCurrentLocation();
      setLocationAccuracy(coordinates.accuracy);
      setCapturingLocation(false);

      return punchOutTreatment(scheduleId, {
        arrival_latitude: coordinates.latitude,
        arrival_longitude: coordinates.longitude,
        bill_amount:
          transportMode === "vehicle" ? null : Number(billAmount),
        completion_notes: completionNotes.trim(),
        invoice_file:
          transportMode === "vehicle" ? null : invoiceFile,
        transport_mode: transportMode,
        gps_accuracy_m: Math.max(coordinates.accuracy ?? 1, 1),
        location_exception_id:
          sessionQuery.data?.location_exception_id,
      });
    },
    onSuccess: async (schedule) => {
      if (scheduleId !== null) {
        queryClient.setQueryData(
          queryKeys.schedules.detail(scheduleId),
          schedule
        );
      }

      await invalidateTreatmentQueries();
      setActionMode(null);
      Alert.alert(
        "Treatment Completed",
        schedule.arrival_warning
          ? `The treatment was completed successfully.\n\n${schedule.arrival_warning}`
          : "The treatment was completed successfully.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/therapist/schedules",
                params: { view: "today" },
              } as Href),
          },
        ]
      );
    },
    onError: (error) => {
      setCapturingLocation(false);
      Alert.alert(
        isOfflineMutationQueuedError(error)
          ? "Saved for Sync"
          : "Unable to Complete Treatment",
        getApiErrorMessage(
          error,
          "Unable to complete this treatment."
        )
      );
    },
    onSettled: () => {
      completionRef.current = false;
    },
  });

  const punchInMutation = useMutation({
    mutationFn: async () => {
      if (scheduleId === null) {
        throw new Error("A valid schedule ID is required.");
      }
      setCapturingLocation(true);
      await requestLocationPermission();
      const coordinates = await getCurrentLocation();
      setLocationAccuracy(coordinates.accuracy);
      setEligibilityCoordinates({
        device_timestamp: new Date().toISOString(),
        gps_accuracy_m: Math.max(coordinates.accuracy ?? 1, 1),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });
      setCapturingLocation(false);
      return punchInTreatment(scheduleId, {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        device_timestamp: new Date().toISOString(),
        gps_accuracy_m: Math.max(coordinates.accuracy ?? 1, 1),
        location_exception_id:
          sessionQuery.data?.location_exception_id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        scheduleQuery.refetch(),
        sessionQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.schedules.all,
        }),
      ]);
      Alert.alert("Treatment Started", "Punch In was recorded successfully.");
    },
    onError: (error) => {
      setCapturingLocation(false);
      Alert.alert(
        isOfflineMutationQueuedError(error)
          ? "Saved for Sync"
          : "Unable to Punch In",
        getApiErrorMessage(error, "Unable to start this treatment.")
      );
    },
  });

  const confirmPunchIn = () => {
    if (!sessionQuery.data?.can_punch_in) return;
    Alert.alert(
      "Punch In",
      "Confirm that you are ready to begin this treatment.",
      [
        { style: "cancel", text: "Cancel" },
        {
          text: "Punch In",
          onPress: () => punchInMutation.mutate(),
        },
      ]
    );
  };

  const exceptionMutation = useMutation({
    mutationFn: async () => {
      if (scheduleId === null || exceptionReason.trim().length < 10) {
        throw new Error("Enter at least 10 characters explaining the GPS issue.");
      }
      await requestLocationPermission();
      const current = await getCurrentLocation();
      setLocationAccuracy(current.accuracy);
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
        target_id: scheduleId,
        target_type: "therapist_schedule",
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Request Exception",
        getApiErrorMessage(error, "Unable to send this location exception.")
      );
    },
    onSuccess: async () => {
      setExceptionVisible(false);
      setExceptionReason("");
      await sessionQuery.refetch();
      Alert.alert(
        "Request Sent",
        "An administrator must approve this one-time location exception before you continue."
      );
    },
  });

  const missedMutation = useMutation({
    mutationFn: async () => {
      if (scheduleId === null) {
        throw new Error("A valid schedule ID is required.");
      }

      return markTreatmentMissed(scheduleId, missedReason.trim());
    },
    onSuccess: async (schedule) => {
      if (scheduleId !== null) {
        queryClient.setQueryData(
          queryKeys.schedules.detail(scheduleId),
          schedule
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard.summary,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.schedules.all,
        }),
      ]);
      setActionMode(null);
      Alert.alert(
        "Treatment Marked Missed",
        "The schedule was updated successfully.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/therapist/schedules",
                params: { view: "today" },
              } as Href),
          },
        ]
      );
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Mark Treatment Missed",
        getApiErrorMessage(
          error,
          "Unable to update this treatment."
        )
      );
    },
    onSettled: () => {
      missedRef.current = false;
    },
  });

  const pickInvoice = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["application/pdf", "image/jpeg", "image/png"],
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];

    if (asset.size && asset.size > MAX_INVOICE_BYTES) {
      setFormError("Invoice files must be 10 MB or smaller.");
      return;
    }

    setInvoiceFile({
      mimeType: asset.mimeType ?? "application/octet-stream",
      name: asset.name,
      size: asset.size ?? null,
      uri: asset.uri,
    });
    setFormError(null);
  };

  const submitCompletion = () => {
    if (completionRef.current) {
      return;
    }

    if (!completionNotes.trim()) {
      setFormError("Completion notes are required.");
      return;
    }

    if (transportMode !== "vehicle") {
      const amount = Number(billAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError("Enter a valid bill amount.");
        return;
      }

      if (!invoiceFile) {
        setFormError("Attach the transport invoice.");
        return;
      }
    }

    setFormError(null);
    Alert.alert(
      "Punch Out",
      "Punching out will complete this treatment and create the travel entry.",
      [
        { style: "cancel", text: "Cancel" },
        {
          text: "Punch Out",
          onPress: () => {
            completionRef.current = true;
            completionMutation.mutate();
          },
        },
      ]
    );
  };

  const submitMissed = () => {
    if (missedRef.current) {
      return;
    }

    if (!missedReason.trim()) {
      setFormError("Missed reason is required.");
      return;
    }

    missedRef.current = true;
    setFormError(null);
    missedMutation.mutate();
  };

  const closeModal = () => {
    if (
      completionMutation.isPending ||
      missedMutation.isPending ||
      capturingLocation
    ) {
      return;
    }

    setActionMode(null);
    setFormError(null);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/therapist/schedules" as Href);
    }
  };

  if (scheduleQuery.isPending && !scheduleQuery.data) {
    return <ScheduleListSkeleton />;
  }

  const schedule = scheduleQuery.data;
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
  const actionBusy =
    completionMutation.isPending ||
    missedMutation.isPending ||
    punchInMutation.isPending ||
    exceptionMutation.isPending ||
    capturingLocation;
  const actionBarBottomPadding = Math.max(insets.bottom, spacing.lg);
  const actionContentPadding =
    52 + spacing.lg + actionBarBottomPadding + spacing.xl;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={styles.safeArea}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.headerButton}
          onPress={handleBack}
        >
          <Ionicons
            color={colors.textStrong}
            name="arrow-back"
            size={23}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      {scheduleId === null ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Invalid schedule</Text>
          <Text style={styles.stateText}>
            A valid schedule ID is required.
          </Text>
        </View>
      ) : scheduleQuery.error && !schedule ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons
              color={DANGER}
              name="alert-circle-outline"
              size={28}
            />
          </View>
          <Text style={styles.stateTitle}>Unable to load schedule</Text>
          <Text style={styles.stateText}>
            {getApiErrorMessage(
              scheduleQuery.error,
              "Unable to load schedule details."
            )}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => void scheduleQuery.refetch()}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : schedule ? (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              schedule.status === "scheduled"
                ? { paddingBottom: actionContentPadding }
                : null,
            ]}
            refreshControl={
              <RefreshControl
                colors={[PRIMARY]}
                refreshing={
                  scheduleQuery.isRefetching &&
                  !scheduleQuery.isPending
                }
                tintColor={PRIMARY}
                onRefresh={() => void scheduleQuery.refetch()}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.statusRow}>
              <Text style={styles.patientName}>{schedule.patient_name}</Text>
              <View
                style={[
                  styles.statusBadge,
                  schedule.status === "completed"
                    ? styles.completedBadge
                    : schedule.status === "missed"
                      ? styles.missedBadge
                      : styles.scheduledBadge,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {formatLabel(schedule.status)}
                </Text>
              </View>
            </View>

            <Section title="Patient Information">
              <DetailRow
                label="Patient Name"
                value={schedule.patient_name}
              />
              <DetailRow
                label="Address"
                value={schedule.patient_address}
              />
            </Section>

            <Section title="Treatment Information">
              <DetailRow
                label="Treatment"
                value={schedule.treatment_name}
              />
              <DetailRow
                label="Doctor"
                value={schedule.doctor_name}
              />
              <DetailRow
                label="Medicines"
                value={schedule.medicines}
              />
              <DetailRow
                label="Instructions"
                value={schedule.instructions}
              />
            </Section>

            <Section title="Schedule Information">
              <DetailRow
                label="Time"
                value={`${formatTime(schedule.in_time)} - ${formatTime(
                  schedule.out_time
                )}`}
              />
              <DetailRow
                label="Priority"
                value={formatLabel(schedule.priority)}
              />
            </Section>

            <Section title="Treatment Session">
              {sessionQuery.isPending || checkingEligibility ? (
                <View style={styles.sessionState}>
                  <ActivityIndicator color={PRIMARY} size="small" />
                  <Text style={styles.sessionStateText}>
                    Verifying workday and patient location...
                  </Text>
                </View>
              ) : sessionQuery.error ? (
                <View style={styles.sessionState}>
                  <Text style={styles.sessionErrorText}>
                    {getApiErrorMessage(
                      sessionQuery.error,
                      "Unable to load treatment session."
                    )}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.retryButton}
                    onPress={() => void sessionQuery.refetch()}
                  >
                    <Text style={styles.retryText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : session ? (
                <>
                  <DetailRow
                    label="Current Status"
                    value={formatLabel(session.session_status)}
                  />
                  <DetailRow
                    label="Punch In"
                    value={formatDateTime(session.punch_in_time)}
                  />
                  {session.session_status !== "NOT_STARTED" ? (
                    <DetailRow
                      label={
                        session.session_status === "IN_PROGRESS"
                          ? "Elapsed Duration"
                          : "Treatment Duration"
                      }
                      value={formatDuration(elapsedSeconds)}
                    />
                  ) : null}
                  {session.punch_out_time ? (
                    <DetailRow
                      label="Punch Out"
                      value={formatDateTime(session.punch_out_time)}
                    />
                  ) : null}
                  {session.eligibility_message ? (
                    <View
                      style={[
                        styles.eligibilityBanner,
                        session.location_verified === false
                          ? styles.eligibilityBlocked
                          : styles.eligibilityReady,
                      ]}
                    >
                      <Ionicons
                        color={
                          session.location_verified === false
                            ? DANGER
                            : PRIMARY
                        }
                        name={
                          session.location_verified === false
                            ? "location-outline"
                            : "checkmark-circle-outline"
                        }
                        size={18}
                      />
                      <Text style={styles.eligibilityText}>
                        {session.eligibility_message}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
              {eligibilityError ? (
                <View style={styles.eligibilityBanner}>
                  <Text style={styles.sessionErrorText}>
                    {eligibilityError}
                  </Text>
                </View>
              ) : null}
              {locationAccuracy !== null ? (
                <Text style={styles.locationAccuracy}>
                  GPS accuracy: approximately {Math.round(locationAccuracy)} m
                </Text>
              ) : null}
            </Section>

            {schedule.status === "completed" ? (
              <Section title="Completion">
                <DetailRow
                  label="Completion Notes"
                  value={schedule.completion_notes}
                />
              </Section>
            ) : null}

            {schedule.status === "missed" ? (
              <Section title="Missed Treatment">
                <DetailRow
                  label="Reason"
                  value={schedule.missed_reason}
                />
              </Section>
            ) : null}
          </ScrollView>

          {schedule.status === "scheduled" ? (
            <View
              style={[
                styles.actionBar,
                { paddingBottom: actionBarBottomPadding },
              ]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.85}
                style={styles.missedAction}
                onPress={() => {
                  setFormError(null);
                  setActionMode("missed");
                }}
              >
                <Ionicons
                  color={DANGER}
                  name="close-circle-outline"
                  size={20}
                />
                <Text style={styles.missedActionText}>Missed</Text>
              </TouchableOpacity>
              {session?.can_punch_in ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  disabled={actionBusy}
                  style={[
                    styles.completeAction,
                    actionBusy && styles.disabledButton,
                  ]}
                  onPress={confirmPunchIn}
                >
                  {punchInMutation.isPending ? (
                    <ActivityIndicator color={colors.surface} size="small" />
                  ) : (
                    <Ionicons
                      color={colors.surface}
                      name="log-in-outline"
                      size={20}
                    />
                  )}
                  <Text style={styles.completeActionText}>Punch In</Text>
                </TouchableOpacity>
              ) : null}
              {session?.can_punch_out ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  style={styles.completeAction}
                  onPress={() => {
                    setFormError(null);
                    setActionMode("complete");
                  }}
                >
                  <Ionicons
                    color={colors.surface}
                    name="log-out-outline"
                    size={20}
                  />
                  <Text style={styles.completeActionText}>Punch Out</Text>
                </TouchableOpacity>
              ) : null}
              {session?.can_request_location_exception ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={actionBusy}
                  style={[styles.exceptionAction, actionBusy && styles.disabledButton]}
                  onPress={() => {
                    setExceptionReason("");
                    setExceptionVisible(true);
                  }}
                >
                  <Ionicons color={colors.warning} name="warning-outline" size={20} />
                  <Text style={styles.exceptionActionText}>GPS Exception</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Schedule unavailable</Text>
        </View>
      )}

      <Modal
        animationType="slide"
        onRequestClose={closeModal}
        transparent
        visible={actionMode !== null}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {actionMode === "complete"
                  ? "Punch Out & Complete"
                  : "Mark Treatment Missed"}
              </Text>
              <TouchableOpacity
                accessibilityLabel="Close"
                accessibilityRole="button"
                disabled={actionBusy}
                style={styles.closeButton}
                onPress={closeModal}
              >
                <Ionicons
                  color={colors.textStrong}
                  name="close"
                  size={22}
                />
              </TouchableOpacity>
            </View>

            <FormScrollView
              contentContainerStyle={[
                styles.modalFormContent,
                {
                  paddingBottom: Math.max(
                    insets.bottom,
                    spacing.section
                  ),
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {actionMode === "complete" ? (
                <>
                  <Text style={styles.inputLabel}>Completion Notes</Text>
                  <TextInput
                    editable={!actionBusy}
                    multiline
                    onChangeText={setCompletionNotes}
                    placeholder="Add treatment observations and patient response."
                    placeholderTextColor={colors.textSubtle}
                    style={styles.textArea}
                    textAlignVertical="top"
                    value={completionNotes}
                  />

                  <Text style={styles.inputLabel}>Transport Mode</Text>
                  <View style={styles.modeGrid}>
                    {transportModes.map((mode) => {
                      const selected = mode.value === transportMode;

                      return (
                        <TouchableOpacity
                          key={mode.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          disabled={actionBusy}
                          style={[
                            styles.modeOption,
                            selected && styles.selectedMode,
                          ]}
                          onPress={() => {
                            setTransportMode(mode.value);
                            setFormError(null);
                          }}
                        >
                          <Text
                            style={[
                              styles.modeText,
                              selected && styles.selectedModeText,
                            ]}
                          >
                            {mode.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {transportMode !== "vehicle" ? (
                    <>
                      <Text style={styles.inputLabel}>Bill Amount</Text>
                      <TextInput
                        editable={!actionBusy}
                        keyboardType="decimal-pad"
                        onChangeText={setBillAmount}
                        placeholder="0.00"
                        placeholderTextColor={colors.textSubtle}
                        style={styles.input}
                        value={billAmount}
                      />

                      <Text style={styles.inputLabel}>Invoice</Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={actionBusy}
                        style={styles.fileButton}
                        onPress={() => void pickInvoice()}
                      >
                        <Ionicons
                          color={PRIMARY}
                          name="document-attach-outline"
                          size={20}
                        />
                        <Text
                          numberOfLines={1}
                          style={styles.fileButtonText}
                        >
                          {invoiceFile?.name ?? "Choose PDF or image"}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}

                  <View style={styles.locationState}>
                    {capturingLocation ? (
                      <ActivityIndicator color={PRIMARY} size="small" />
                    ) : (
                      <Ionicons
                        color={PRIMARY}
                        name="location-outline"
                        size={20}
                      />
                    )}
                    <View style={styles.locationContent}>
                      <Text style={styles.locationTitle}>
                        Arrival Verification
                      </Text>
                      <Text style={styles.locationText}>
                        {capturingLocation
                          ? "Capturing current location..."
                          : locationAccuracy !== null
                            ? `Captured, accuracy ±${Math.round(
                                locationAccuracy
                              )} m`
                            : "Fresh GPS will be captured when submitted."}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Missed Reason</Text>
                  <TextInput
                    editable={!actionBusy}
                    multiline
                    onChangeText={setMissedReason}
                    placeholder="Explain why the treatment could not be completed."
                    placeholderTextColor={colors.textSubtle}
                    style={styles.textArea}
                    textAlignVertical="top"
                    value={missedReason}
                  />
                </>
              )}

              {formError ? (
                <Text style={styles.validationText}>{formError}</Text>
              ) : null}

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: actionBusy }}
                activeOpacity={0.85}
                disabled={actionBusy}
                style={[
                  styles.submitButton,
                  actionMode === "missed" && styles.dangerButton,
                  actionBusy && styles.disabledButton,
                ]}
                onPress={
                  actionMode === "complete"
                    ? submitCompletion
                    : submitMissed
                }
              >
                {actionBusy ? (
                  <ActivityIndicator
                    color={colors.surface}
                    size="small"
                  />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {actionMode === "complete"
                      ? "Punch Out & Complete"
                      : "Mark as Missed"}
                  </Text>
                )}
              </TouchableOpacity>
            </FormScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={exceptionVisible}
        onRequestClose={() => {
          if (!exceptionMutation.isPending) setExceptionVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Location Exception</Text>
              <TouchableOpacity
                accessibilityLabel="Close location exception"
                accessibilityRole="button"
                disabled={exceptionMutation.isPending}
                style={styles.closeButton}
                onPress={() => setExceptionVisible(false)}
              >
                <Ionicons color={colors.textStrong} name="close" size={22} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalFormContent}>
              <Text style={styles.locationText}>
                A fresh GPS reading and your reason will be reviewed. Approval is valid once for this attendance action.
              </Text>
              <Text style={styles.inputLabel}>Reason</Text>
              <TextInput
                autoFocus
                editable={!exceptionMutation.isPending}
                maxLength={500}
                multiline
                onChangeText={setExceptionReason}
                placeholder="Explain why the normal GPS check cannot be completed."
                placeholderTextColor={colors.textSubtle}
                style={styles.textArea}
                textAlignVertical="top"
                value={exceptionReason}
              />
              <Text style={styles.locationText}>{exceptionReason.length}/500 characters</Text>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={exceptionMutation.isPending || exceptionReason.trim().length < 10}
                style={[styles.submitButton, (exceptionMutation.isPending || exceptionReason.trim().length < 10) && styles.disabledButton]}
                onPress={() => exceptionMutation.mutate()}
              >
                {exceptionMutation.isPending ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Capture GPS & Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: spacing.xl,
  },
  headerButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  patientName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  scheduledBadge: {
    backgroundColor: PRIMARY,
  },
  completedBadge: {
    backgroundColor: colors.greenDeep,
  },
  missedBadge: {
    backgroundColor: DANGER,
  },
  statusBadgeText: {
    color: colors.surface,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  section: {
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
  sectionTitle: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  detailRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.lineHeight.bodyLarge,
  },
  sessionState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  sessionStateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    textAlign: "center",
  },
  sessionErrorText: {
    color: DANGER,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    textAlign: "center",
  },
  eligibilityBanner: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  eligibilityReady: {
    backgroundColor: colors.primarySurface,
  },
  eligibilityBlocked: {
    backgroundColor: colors.dangerSurface,
  },
  eligibilityText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
  },
  locationAccuracy: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
    marginTop: spacing.sm,
    textAlign: "right",
  },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.lg,
    left: 0,
    padding: spacing.lg,
    position: "absolute",
    right: 0,
  },
  missedAction: {
    alignItems: "center",
    borderColor: DANGER,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52,
  },
  missedActionText: {
    color: DANGER,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  completeAction: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flex: 1.35,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52,
  },
  completeActionText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.section,
  },
  stateIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 54,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    textAlign: "center",
  },
  retryButton: {
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 44,
  },
  retryText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  modalOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.largePanel,
    borderTopRightRadius: radius.largePanel,
    height: "90%",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  exceptionAction: {
    alignItems: "center",
    borderColor: colors.warning,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52,
  },
  exceptionActionText: {
    color: colors.warning,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  modalFormContent: {
    flexGrow: 1,
  },
  modalHandle: {
    alignSelf: "center",
    backgroundColor: colors.inputBorder,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 44,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  modalTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
  },
  closeButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  textArea: {
    backgroundColor: colors.background,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.body,
    minHeight: 112,
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.body,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  modeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  modeOption: {
    alignItems: "center",
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 78,
    paddingHorizontal: spacing.lg,
  },
  selectedMode: {
    backgroundColor: colors.primarySurface,
    borderColor: PRIMARY,
  },
  modeText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
  },
  selectedModeText: {
    color: PRIMARY,
  },
  fileButton: {
    alignItems: "center",
    borderColor: PRIMARY,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  fileButtonText: {
    color: PRIMARY,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
  },
  locationState: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  locationContent: {
    flex: 1,
  },
  locationTitle: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  locationText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  validationText: {
    color: DANGER,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.lg,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 52,
  },
  dangerButton: {
    backgroundColor: DANGER,
  },
  disabledButton: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
});
