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
  decideManualTravel,
  listManualTravelReviews,
} from "../../services/travelService";
import { colors, radius, spacing, typography } from "../../theme";
import type { TravelResponse } from "../../types/travel";


const statuses = ["pending", "approved", "changes_requested"] as const;


export function ManualTravelReview() {
  const [status, setStatus] = useState<(typeof statuses)[number]>("pending");
  const [items, setItems] = useState<TravelResponse[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listManualTravelReviews(status));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load manual travel."));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    item: TravelResponse,
    decision: "approved" | "changes_requested"
  ) => {
    const reason = (reasons[item.id] ?? "").trim();
    if (reason.length < 5) {
      Alert.alert("Review Note Required", "Enter at least 5 characters.");
      return;
    }
    try {
      setBusyId(item.id);
      await decideManualTravel(item.id, {
        decision,
        reason,
        version: item.manual_review_version,
      });
      setReasons((current) => ({ ...current, [item.id]: "" }));
      await load();
      Alert.alert(
        "Review Saved",
        decision === "approved"
          ? "The manual travel is now claim-eligible."
          : "The therapist can now correct and resubmit this entry."
      );
    } catch (requestError) {
      Alert.alert(
        "Unable to Save Review",
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
          <Text style={styles.title}>Manual Travel Review</Text>
          <Text style={styles.help}>
            Approve therapist-entered evidence or request correctable changes before claim submission.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Refresh manual travel reviews"
          accessibilityRole="button"
          disabled={loading}
          style={styles.refresh}
          onPress={() => void load()}
        >
          <Ionicons color={colors.primary} name="refresh" size={18} />
        </TouchableOpacity>
      </View>
      <View accessibilityRole="tablist" style={styles.filters}>
        {statuses.map((value) => (
          <TouchableOpacity
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === value }}
            style={[styles.filter, status === value && styles.filterSelected]}
            onPress={() => setStatus(value)}
          >
            <Text style={[styles.filterText, status === value && styles.filterTextSelected]}>
              {value.replaceAll("_", " ")}
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
        <Text style={styles.empty}>No {status.replaceAll("_", " ")} manual travel.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.headingCopy}>
                <Text style={styles.staff}>
                  {item.therapist_name ?? `Therapist #${item.therapist_id}`}
                </Text>
                <Text style={styles.meta}>
                  {item.travel_date} · {item.transport_mode} · {item.total_km} km · INR {item.travel_fare.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.revision}>R{item.manual_revision}</Text>
            </View>
            <Text style={styles.reason}>
              <Text style={styles.reasonLabel}>Reason: </Text>
              {item.manual_reason}
            </Text>
            <Text style={styles.evidence}>
              {item.from_address} → {item.to_address} · {item.invoice_file ? "Proof attached" : "No proof attached"}
            </Text>
            {item.manual_review_reason ? (
              <Text style={styles.reviewText}>Review: {item.manual_review_reason}</Text>
            ) : null}
            {item.manual_review_status === "pending" ? (
              <>
                <TextInput
                  accessibilityLabel={`Manual travel review note for ${item.therapist_name ?? item.id}`}
                  editable={busyId === null}
                  maxLength={500}
                  onChangeText={(value) => setReasons((current) => ({ ...current, [item.id]: value }))}
                  placeholder="Required review note"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                  value={reasons[item.id] ?? ""}
                />
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={busyId !== null}
                    style={[styles.button, styles.changeButton, busyId !== null && styles.disabled]}
                    onPress={() => void decide(item, "changes_requested")}
                  >
                    <Text style={styles.changeText}>Request Changes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={busyId !== null}
                    style={[styles.button, styles.approveButton, busyId !== null && styles.disabled]}
                    onPress={() => void decide(item, "approved")}
                  >
                    {busyId === item.id ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.approveText}>Approve</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
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
  revision: { backgroundColor: colors.warningSurface, borderRadius: radius.pill, color: colors.warningDark, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  reason: { backgroundColor: colors.background, borderRadius: radius.control, color: colors.textPrimary, fontSize: typography.size.small, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.md, padding: spacing.md },
  reasonLabel: { fontWeight: typography.weight.extrabold },
  evidence: { color: colors.textMuted, fontSize: typography.size.tiny, lineHeight: typography.lineHeight.smallRelaxed, marginTop: spacing.sm },
  reviewText: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.sm },
  input: { borderColor: colors.inputBorder, borderRadius: radius.control, borderWidth: 1, color: colors.textPrimary, fontSize: typography.size.small, marginTop: spacing.md, minHeight: 44, paddingHorizontal: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  button: { alignItems: "center", borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 44 },
  changeButton: { borderColor: colors.warningDark, borderWidth: 1 },
  changeText: { color: colors.warningDark, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  approveButton: { backgroundColor: colors.greenDark },
  approveText: { color: colors.surface, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  disabled: { opacity: 0.55 },
});
