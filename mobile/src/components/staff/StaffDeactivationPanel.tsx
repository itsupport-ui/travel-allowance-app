import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  decideStaffDeactivationOverride,
  getStaffDeactivationOverrides,
  getStaffDeactivationReadiness,
  requestStaffDeactivationOverride,
} from "../../services/staffOverrideService";
import { colors, radius, spacing, typography } from "../../theme";
import type {
  StaffDeactivationControlState,
  StaffDeactivationOverride,
  StaffDeactivationReadiness,
  StaffRole,
} from "../../types/staffOverride";

interface Props {
  onChange: (state: StaffDeactivationControlState) => void;
  staffId: number;
  staffRole: StaffRole;
}

const EMPTY_CONTROL: StaffDeactivationControlState = {
  canDeactivate: false,
  overrideRequestId: null,
  reason: "",
};

export function StaffDeactivationPanel({
  onChange,
  staffId,
  staffRole,
}: Props) {
  const [readiness, setReadiness] =
    useState<StaffDeactivationReadiness | null>(null);
  const [overrideRequest, setOverrideRequest] =
    useState<StaffDeactivationOverride | null>(null);
  const [reason, setReason] = useState("");
  const reasonRef = useRef("");
  const [decisionReason, setDecisionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);

  const notify = useCallback(
    (
      nextReadiness: StaffDeactivationReadiness | null,
      nextRequest: StaffDeactivationOverride | null,
      nextReason: string
    ) => {
      const reasonReady = nextReason.trim().length >= 10;
      const canDeactivate = Boolean(
        reasonReady &&
          (nextReadiness?.readiness_state === "ready" ||
            (nextReadiness?.readiness_state === "override_required" &&
              nextRequest?.status === "approved"))
      );
      onChange({
        canDeactivate,
        overrideRequestId:
          nextRequest?.status === "approved" ? nextRequest.id : null,
        reason: nextReason.trim(),
      });
    },
    [onChange]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextReadiness, requests] = await Promise.all([
        getStaffDeactivationReadiness(staffRole, staffId),
        getStaffDeactivationOverrides(staffRole, staffId),
      ]);
      const nextRequest =
        requests.find((item) =>
          ["pending", "approved"].includes(item.status)
        ) ?? null;
      setReadiness(nextReadiness);
      setOverrideRequest(nextRequest);
      notify(nextReadiness, nextRequest, reasonRef.current);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to check deactivation readiness."
      );
      notify(null, null, reasonRef.current);
    } finally {
      setLoading(false);
    }
  }, [notify, staffId, staffRole]);

  useEffect(() => {
    // The panel is mounted only for an active-to-inactive transition.
    void load();
    return () => onChange(EMPTY_CONTROL);
  }, [load, onChange]);

  const updateReason = (value: string) => {
    setReason(value);
    reasonRef.current = value;
    notify(readiness, overrideRequest, value);
  };

  const requestOverride = async () => {
    if (reason.trim().length < 10) {
      setError("Enter a handover reason of at least 10 characters.");
      return;
    }
    setAction("requesting");
    setError(null);
    try {
      const request = await requestStaffDeactivationOverride({
        reason: reason.trim(),
        staff_id: staffId,
        staff_role: staffRole,
      });
      setOverrideRequest(request);
      notify(readiness, request, reason);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to request override."
      );
    } finally {
      setAction("");
    }
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!overrideRequest) return;
    if (decisionReason.trim().length < 5) {
      setError("Enter a reviewer note of at least 5 characters.");
      return;
    }
    setAction(decision);
    setError(null);
    try {
      const request = await decideStaffDeactivationOverride(
        overrideRequest.id,
        {
          decision,
          reason: decisionReason.trim(),
          version: overrideRequest.version,
        }
      );
      const nextRequest = decision === "rejected" ? null : request;
      setOverrideRequest(nextRequest);
      notify(readiness, nextRequest, reason);
      if (decision === "rejected") {
        setError(
          "Override rejected. Update the handover reason before requesting again."
        );
      }
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Unable to review override."
      );
      await load();
    } finally {
      setAction("");
    }
  };

  return (
    <View accessibilityLiveRegion="polite" style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.title}>Deactivation Safety Check</Text>
          <Text style={styles.description}>
            Active clinical work cannot be overridden. Open operational records
            require a documented approval.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void load()}
          style={styles.refreshButton}
        >
          {loading ? (
            <ActivityIndicator color={colors.blueDark} size="small" />
          ) : (
            <Text style={styles.refreshText}>Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {readiness ? (
        <>
          <Text style={styles.status}>
            Status: {readiness.readiness_state.replaceAll("_", " ")}
          </Text>
          {[...readiness.hard_blockers, ...readiness.operational_impacts].map(
            (item) => (
              <View key={item.code} style={styles.condition}>
                <Text style={styles.conditionTitle}>
                  {item.code.replaceAll("_", " ")} · {item.count}
                </Text>
                <Text style={styles.conditionMessage}>{item.message}</Text>
              </View>
            )
          )}

          {readiness.readiness_state !== "hard_blocked" ? (
            <>
              <Text style={styles.label}>Deactivation and handover reason</Text>
              <TextInput
                accessibilityLabel="Deactivation and handover reason"
                editable={!action}
                maxLength={500}
                multiline
                onChangeText={updateReason}
                placeholder="Explain why access is ending and who owns remaining follow-up."
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                textAlignVertical="top"
                value={reason}
              />
            </>
          ) : null}

          {readiness.readiness_state === "override_required" &&
          !overrideRequest ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={Boolean(action)}
              onPress={() => void requestOverride()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>
                {action === "requesting"
                  ? "Requesting..."
                  : "Request Documented Override"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {overrideRequest ? (
            <View style={styles.overrideCard}>
              <Text style={styles.overrideTitle}>
                Override #{overrideRequest.id}: {overrideRequest.status}
              </Text>
              {overrideRequest.status === "pending" ? (
                <>
                  <Text style={styles.label}>Reviewer note</Text>
                  <TextInput
                    accessibilityLabel="Override reviewer note"
                    editable={!action}
                    maxLength={500}
                    multiline
                    onChangeText={setDecisionReason}
                    style={styles.reviewInput}
                    textAlignVertical="top"
                    value={decisionReason}
                  />
                  <View style={styles.decisionRow}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={Boolean(action)}
                      onPress={() => void decide("approved")}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryText}>
                        {action === "approved" ? "Approving..." : "Approve"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={Boolean(action)}
                      onPress={() => void decide("rejected")}
                      style={styles.rejectButton}
                    >
                      <Text style={styles.rejectText}>
                        {action === "rejected" ? "Rejecting..." : "Reject"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
              {overrideRequest.status === "approved" ? (
                <Text style={styles.approvedText}>
                  Approved for one deactivation while conditions remain unchanged.
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  approvedText: {
    color: colors.blueDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.sm,
  },
  condition: {
    backgroundColor: colors.surface,
    borderColor: colors.warningBright,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  conditionMessage: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  conditionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textTransform: "capitalize",
  },
  decisionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  description: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  headingRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headingText: { flex: 1 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    minHeight: 88,
    padding: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  overrideCard: {
    backgroundColor: colors.blueSurface,
    borderColor: colors.blue,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  overrideTitle: {
    color: colors.blueDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textTransform: "capitalize",
  },
  panel: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBright,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flex: 1,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  primaryText: {
    color: colors.surface,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.warningBright,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  refreshText: {
    color: colors.blueDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  rejectButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 44,
  },
  rejectText: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  reviewInput: {
    backgroundColor: colors.surface,
    borderColor: colors.blue,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    minHeight: 68,
    padding: spacing.md,
  },
  status: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
    textTransform: "capitalize",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
});
