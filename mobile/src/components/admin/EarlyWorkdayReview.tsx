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

import { getApiErrorMessage } from "../../services/errorHandler";
import {
  decideEarlyWorkdayClosure,
  listEarlyWorkdayClosures,
  type EarlyClosureReviewItem,
  type EarlyClosureReviewStatus,
} from "../../services/workdayExceptionService";
import { colors, radius, spacing, typography } from "../../theme";


const reviewStatuses: readonly EarlyClosureReviewStatus[] = [
  "pending",
  "acknowledged",
  "follow_up_required",
];


const formatStatus = (value: string): string =>
  value.replaceAll("_", " ");


export function EarlyWorkdayReview() {
  const [status, setStatus] = useState<EarlyClosureReviewStatus>("pending");
  const [items, setItems] = useState<EarlyClosureReviewItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listEarlyWorkdayClosures(status));
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to load early closures.")
      );
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    item: EarlyClosureReviewItem,
    decision: "acknowledged" | "follow_up_required"
  ) => {
    const key = `${item.staff_role}-${item.workday_id}`;
    const reason = (reasons[key] ?? "").trim();
    if (reason.length < 5) {
      Alert.alert("Review Note Required", "Enter at least 5 characters.");
      return;
    }
    try {
      setBusyKey(key);
      await decideEarlyWorkdayClosure(item, {
        decision,
        reason,
        version: item.version,
      });
      setReasons((current) => ({ ...current, [key]: "" }));
      await load();
      Alert.alert(
        "Review Saved",
        decision === "acknowledged"
          ? "The closure was acknowledged."
          : "The closure was marked for follow-up."
      );
    } catch (requestError) {
      Alert.alert(
        "Unable to Save Review",
        getApiErrorMessage(requestError, "Refresh and try again.")
      );
      await load();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Early Workday Review</Text>
          <Text style={styles.help}>
            Acknowledge a supported closure or flag a supervisor follow-up. The original attendance record is retained.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Refresh early workday closures"
          accessibilityRole="button"
          disabled={loading}
          style={styles.refresh}
          onPress={() => void load()}
        >
          <Ionicons color={colors.primary} name="refresh" size={18} />
        </TouchableOpacity>
      </View>

      <View accessibilityRole="tablist" style={styles.filters}>
        {reviewStatuses.map((value) => (
          <TouchableOpacity
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === value }}
            style={[styles.filter, status === value && styles.filterSelected]}
            onPress={() => setStatus(value)}
          >
            <Text style={[styles.filterText, status === value && styles.filterTextSelected]}>
              {formatStatus(value)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.state} />
      ) : error ? (
        <TouchableOpacity accessibilityRole="button" style={styles.error} onPress={() => void load()}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No {formatStatus(status)} early closures.</Text>
      ) : (
        items.map((item) => {
          const key = `${item.staff_role}-${item.workday_id}`;
          return (
            <View key={key} style={styles.card}>
              <View style={styles.cardHeading}>
                <View style={styles.headingCopy}>
                  <Text style={styles.staff}>{item.staff_name}</Text>
                  <Text style={styles.meta}>
                    {item.staff_role} · {new Date(`${item.business_date}T00:00:00`).toLocaleDateString()} · {item.total_work_minutes} min
                  </Text>
                </View>
                <View style={item.review_status === "follow_up_required" ? styles.followUpBadge : item.review_status === "acknowledged" ? styles.acknowledgedBadge : styles.pendingBadge}>
                  <Text style={item.review_status === "follow_up_required" ? styles.followUpText : item.review_status === "acknowledged" ? styles.acknowledgedText : styles.pendingText}>
                    {formatStatus(item.review_status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.reason}>
                <Text style={styles.reasonLabel}>Staff reason: </Text>
                {item.staff_reason}
              </Text>
              <Text style={styles.evidence}>
                Started {new Date(item.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Ended {new Date(item.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {item.completed_activities} completed · {item.pending_activities} pending
              </Text>
              {item.review_reason ? (
                <Text style={styles.reviewText}>
                  Review: {item.review_reason}{item.reviewer_name ? ` — ${item.reviewer_name}` : ""}
                </Text>
              ) : null}
              {item.review_status === "pending" ? (
                <>
                  <TextInput
                    accessibilityLabel={`Review note for ${item.staff_name}`}
                    editable={busyKey === null}
                    maxLength={500}
                    onChangeText={(value) => setReasons((current) => ({ ...current, [key]: value }))}
                    placeholder="Required review note"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.input}
                    value={reasons[key] ?? ""}
                  />
                  <View style={styles.actions}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busyKey !== null}
                      style={[styles.button, styles.followUpButton, busyKey !== null && styles.disabled]}
                      onPress={() => void decide(item, "follow_up_required")}
                    >
                      <Text style={styles.followUpButtonText}>Needs Follow-up</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busyKey !== null}
                      style={[styles.button, styles.acknowledgeButton, busyKey !== null && styles.disabled]}
                      onPress={() => void decide(item, "acknowledged")}
                    >
                      {busyKey === key ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.acknowledgeText}>Acknowledge</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          );
        })
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
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
  filter: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  filterSelected: { backgroundColor: colors.textStrong, borderColor: colors.textStrong },
  filterText: { color: colors.textMuted, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, textTransform: "capitalize" },
  filterTextSelected: { color: colors.surface },
  state: { marginVertical: spacing.xl },
  empty: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.lg, textAlign: "center", textTransform: "capitalize" },
  error: { backgroundColor: colors.dangerSurface, borderRadius: radius.control, marginTop: spacing.lg, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: typography.size.small },
  retryText: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  card: { borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  cardHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  staff: { color: colors.textStrong, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  meta: { color: colors.textMuted, fontSize: typography.size.tiny, marginTop: spacing.xs, textTransform: "capitalize" },
  pendingBadge: { backgroundColor: colors.warningSurface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pendingText: { color: colors.warningDark, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, textTransform: "capitalize" },
  acknowledgedBadge: { backgroundColor: colors.greenSurface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  acknowledgedText: { color: colors.greenDark, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, textTransform: "capitalize" },
  followUpBadge: { backgroundColor: colors.dangerSurface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  followUpText: { color: colors.danger, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, textTransform: "capitalize" },
  reason: { backgroundColor: colors.background, borderRadius: radius.control, color: colors.textPrimary, fontSize: typography.size.small, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.md, padding: spacing.md },
  reasonLabel: { fontWeight: typography.weight.extrabold },
  evidence: { color: colors.textMuted, fontSize: typography.size.tiny, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.sm },
  reviewText: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.sm },
  input: { borderColor: colors.inputBorder, borderRadius: radius.control, borderWidth: 1, color: colors.textPrimary, fontSize: typography.size.small, marginTop: spacing.md, minHeight: 44, paddingHorizontal: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  button: { alignItems: "center", borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 44 },
  followUpButton: { borderColor: colors.danger, borderWidth: 1 },
  followUpButtonText: { color: colors.danger, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  acknowledgeButton: { backgroundColor: colors.greenDark },
  acknowledgeText: { color: colors.surface, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  disabled: { opacity: 0.55 },
});
