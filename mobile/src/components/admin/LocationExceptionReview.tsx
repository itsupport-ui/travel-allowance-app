import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, radius, spacing, typography } from "../../theme";
import { getApiErrorMessage } from "../../services/errorHandler";
import {
  decideLocationException,
  listLocationExceptions,
  type LocationExceptionRequest,
} from "../../services/locationExceptionService";

export function LocationExceptionReview() {
  const [requests, setRequests] = useState<LocationExceptionRequest[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await listLocationExceptions("pending"));
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to load location exceptions.")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    request: LocationExceptionRequest,
    decision: "approved" | "rejected"
  ) => {
    const reason = (reasons[request.id] ?? "").trim();
    if (reason.length < 5) {
      Alert.alert("Review Reason Required", "Enter at least 5 characters.");
      return;
    }
    try {
      setBusyId(request.id);
      await decideLocationException(request.id, {
        decision,
        reason,
        version: request.version,
      });
      setReasons((current) => ({ ...current, [request.id]: "" }));
      await load();
      Alert.alert("Decision Saved", `The request was ${decision}.`);
    } catch (requestError) {
      Alert.alert(
        "Unable to Save Decision",
        getApiErrorMessage(requestError, "Refresh and try again.")
      );
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Location Exception Review</Text>
          <Text style={styles.help}>
            One-time attendance overrides awaiting a reasoned decision.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Refresh location exceptions"
          accessibilityRole="button"
          disabled={loading}
          style={styles.refresh}
          onPress={() => void load()}
        >
          <Ionicons color={colors.primary} name="refresh" size={18} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.state} />
      ) : error ? (
        <TouchableOpacity accessibilityRole="button" style={styles.error} onPress={() => void load()}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>No pending location exceptions.</Text>
      ) : (
        requests.map((request) => (
          <View key={request.id} style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.headingCopy}>
                <Text style={styles.staff}>
                  {request.requester_name ?? `Staff #${request.id}`}
                </Text>
                <Text style={styles.meta}>
                  {request.staff_role} · {request.action.replace("_", " ")} · {request.target_type.replaceAll("_", " ")} #{request.target_id}
                </Text>
              </View>
              <View style={styles.pendingBadge}><Text style={styles.pendingText}>Pending</Text></View>
            </View>
            <Text style={styles.reason}>{request.reason}</Text>
            <Text style={styles.evidence}>
              Policy v{request.location_policy_version} · {request.geofence_radius_m} m radius · GPS {request.evidence_quality} · ±{Math.round(request.gps_accuracy_m)} m
              {request.distance_km == null ? "" : ` · ${request.distance_km.toFixed(2)} km away`}
            </Text>
            <TextInput
              accessibilityLabel={`Review reason for request ${request.id}`}
              editable={busyId === null}
              maxLength={500}
              onChangeText={(value) => setReasons((current) => ({ ...current, [request.id]: value }))}
              placeholder="Required decision reason"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              value={reasons[request.id] ?? ""}
            />
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busyId !== null}
                style={[styles.button, styles.rejectButton, busyId !== null && styles.disabled]}
                onPress={() => void decide(request, "rejected")}
              >
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busyId !== null}
                style={[styles.button, styles.approveButton, busyId !== null && styles.disabled]}
                onPress={() => void decide(request, "approved")}
              >
                {busyId === request.id ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.approveText}>Approve Once</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, marginTop: spacing.lg, padding: spacing.lg },
  headingRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  headingCopy: { flex: 1 },
  title: { color: colors.textStrong, fontSize: typography.size.body, fontWeight: typography.weight.extrabold },
  help: { color: colors.textMuted, fontSize: typography.size.small, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.xs },
  refresh: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  state: { marginVertical: spacing.xl },
  empty: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.lg, textAlign: "center" },
  error: { backgroundColor: colors.dangerSurface, borderRadius: radius.control, marginTop: spacing.lg, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: typography.size.small },
  retryText: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  card: { borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  cardHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  staff: { color: colors.textStrong, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  meta: { color: colors.textMuted, fontSize: typography.size.tiny, marginTop: spacing.xs, textTransform: "capitalize" },
  pendingBadge: { backgroundColor: colors.warningSurface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pendingText: { color: colors.warningDark, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold },
  reason: { backgroundColor: colors.background, borderRadius: radius.control, color: colors.textPrimary, fontSize: typography.size.small, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.md, padding: spacing.md },
  evidence: { color: colors.textMuted, fontSize: typography.size.tiny, marginTop: spacing.sm, textTransform: "capitalize" },
  input: { borderColor: colors.inputBorder, borderRadius: radius.control, borderWidth: 1, color: colors.textPrimary, fontSize: typography.size.small, marginTop: spacing.md, minHeight: 44, paddingHorizontal: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  button: { alignItems: "center", borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 44 },
  rejectButton: { borderColor: colors.danger, borderWidth: 1 },
  rejectText: { color: colors.danger, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  approveButton: { backgroundColor: colors.greenDark },
  approveText: { color: colors.surface, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  disabled: { opacity: 0.55 },
});
