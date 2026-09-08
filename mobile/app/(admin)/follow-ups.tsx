import { colors, radius, spacing, typography } from "@/src/theme";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createOperationalFollowUp,
  getFollowUpAssignees,
  getOperationalFollowUps,
  updateOperationalFollowUp,
  type FollowUpAssignee,
  type FollowUpStatus,
  type OperationalFollowUp,
} from "../../src/services/operationalFollowUpService";
import { getApiErrorMessage } from "../../src/services/errorHandler";

const DOMAINS = ["attendance", "clinical", "claims", "expenses", "location", "reporting", "scheduling", "staff", "travel"];
const STATUSES: (FollowUpStatus | "all")[] = ["open", "in_progress", "resolved", "cancelled", "all"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function OperationalFollowUpsScreen() {
  const [status, setStatus] = useState<FollowUpStatus | "all">("open");
  const [items, setItems] = useState<OperationalFollowUp[]>([]);
  const [assignees, setAssignees] = useState<FollowUpAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [domain, setDomain] = useState("attendance");
  const [recordType, setRecordType] = useState("");
  const [recordId, setRecordId] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [decisionReasons, setDecisionReasons] = useState<Record<number, string>>({});
  const [selectedOwners, setSelectedOwners] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, owners] = await Promise.all([
        getOperationalFollowUps(status),
        getFollowUpAssignees(),
      ]);
      setItems(page.items);
      setAssignees(owners);
    } catch (error) {
      Alert.alert("Unable to load follow-ups", getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (recordType.trim().length < 1 || recordId.trim().length < 1 || title.trim().length < 4 || reason.trim().length < 8) {
      Alert.alert("Complete the form", "Enter a record type, record ID, title, and a reason of at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await createOperationalFollowUp({
        source_domain: domain,
        source_entity_type: recordType.trim(),
        source_entity_id: recordId.trim(),
        title: title.trim(),
        priority,
        assignee_id: ownerId,
        due_date: dueDate.trim() || null,
        reason: reason.trim(),
      });
      setRecordType(""); setRecordId(""); setTitle(""); setReason(""); setDueDate(""); setPriority("medium");
      setStatus(ownerId ? "in_progress" : "open");
      Alert.alert("Follow-up created", "The item is now in the shared operational queue.");
      await load();
    } catch (error) {
      Alert.alert("Unable to create follow-up", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (
    item: OperationalFollowUp,
    nextStatus: FollowUpStatus,
    requestedOwnerId = item.assignee_id,
  ) => {
    const value = decisionReasons[item.id]?.trim() ?? "";
    if (value.length < 8) {
      Alert.alert("Reason required", "Enter at least 8 characters and do not include patient details.");
      return;
    }
    setSaving(true);
    try {
      await updateOperationalFollowUp(item.id, {
        status: nextStatus,
        version: item.version,
        assignee_id: requestedOwnerId,
        reason: value,
      });
      setDecisionReasons((current) => ({ ...current, [item.id]: "" }));
      await load();
    } catch (error) {
      Alert.alert("Unable to update follow-up", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: true, title: "Operational Follow-ups" }} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Operational follow-ups</Text>
        <Text style={styles.subtitle}>Assign exceptions across teams and retain an auditable resolution.</Text>
        <View style={styles.notice}><Text style={styles.noticeText}>Use operational record IDs only. Never enter patient identity, clinical notes, addresses, coordinates, or proof paths.</Text></View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create follow-up</Text>
          <Text style={styles.fieldLabel}>Domain</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{DOMAINS.map((value) => <TouchableOpacity key={value} onPress={() => setDomain(value)} style={[styles.chip, domain === value && styles.chipActive]}><Text style={[styles.chipText, domain === value && styles.chipTextActive]}>{label(value)}</Text></TouchableOpacity>)}</ScrollView>
          <TextInput accessibilityLabel="Record type" placeholder="Record type, e.g. therapist_workday" style={styles.input} value={recordType} onChangeText={setRecordType} />
          <TextInput accessibilityLabel="Record ID" placeholder="Record ID" style={styles.input} value={recordId} onChangeText={setRecordId} />
          <TextInput accessibilityLabel="Follow-up title" placeholder="Follow-up title" style={styles.input} value={title} onChangeText={setTitle} />
          <TextInput accessibilityLabel="Follow-up reason" multiline placeholder="Reason (no patient details)" style={[styles.input, styles.multiline]} value={reason} onChangeText={setReason} />
          <Text style={styles.fieldLabel}>Owner</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}><TouchableOpacity onPress={() => setOwnerId(null)} style={[styles.chip, ownerId === null && styles.chipActive]}><Text style={[styles.chipText, ownerId === null && styles.chipTextActive]}>Unassigned</Text></TouchableOpacity>{assignees.map((owner) => <TouchableOpacity key={owner.id} onPress={() => setOwnerId(owner.id)} style={[styles.chip, ownerId === owner.id && styles.chipActive]}><Text style={[styles.chipText, ownerId === owner.id && styles.chipTextActive]}>{owner.name}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.fieldLabel}>Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{PRIORITIES.map((value) => <TouchableOpacity key={value} onPress={() => setPriority(value)} style={[styles.chip, priority === value && styles.chipActive]}><Text style={[styles.chipText, priority === value && styles.chipTextActive]}>{label(value)}</Text></TouchableOpacity>)}</ScrollView>
          <TextInput accessibilityLabel="Follow-up due date" autoCapitalize="none" placeholder="Due date (YYYY-MM-DD), optional" style={styles.input} value={dueDate} onChangeText={setDueDate} />
          <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => void create()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Create follow-up"}</Text></TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Queue status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{STATUSES.map((value) => <TouchableOpacity key={value} onPress={() => setStatus(value)} style={[styles.chip, status === value && styles.chipActive]}><Text style={[styles.chipText, status === value && styles.chipTextActive]}>{label(value)}</Text></TouchableOpacity>)}</ScrollView>
        {loading && items.length === 0 ? <ActivityIndicator color={colors.primary} /> : items.length === 0 ? <Text style={styles.empty}>No follow-ups found.</Text> : items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}><Text style={styles.domain}>{label(item.source_domain)}</Text><Text style={styles.status}>{label(item.status)}</Text></View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.meta}>{item.source_entity_type} #{item.source_entity_id} - {label(item.priority)}</Text>
            <Text style={styles.meta}>Owner: {item.assignee_name ?? "Unassigned"} - Due: {item.due_date ?? "Not set"}</Text>
            <Text style={styles.body}>{item.resolution ?? item.created_reason}</Text>
            {item.available_actions.length > 0 && <><Text style={styles.fieldLabel}>Follow-up owner</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><TouchableOpacity onPress={() => setSelectedOwners((current) => ({ ...current, [item.id]: 0 }))} style={[styles.chip, (selectedOwners[item.id] ?? item.assignee_id) === null || selectedOwners[item.id] === 0 ? styles.chipActive : null]}><Text style={[styles.chipText, (selectedOwners[item.id] ?? item.assignee_id) === null || selectedOwners[item.id] === 0 ? styles.chipTextActive : null]}>Unassigned</Text></TouchableOpacity>{assignees.map((owner) => { const selected = (selectedOwners[item.id] ?? item.assignee_id) === owner.id; return <TouchableOpacity key={owner.id} onPress={() => setSelectedOwners((current) => ({ ...current, [item.id]: owner.id }))} style={[styles.chip, selected && styles.chipActive]}><Text style={[styles.chipText, selected && styles.chipTextActive]}>{owner.name}</Text></TouchableOpacity>; })}</ScrollView><TextInput accessibilityLabel={`Decision reason for ${item.title}`} multiline placeholder="Assignment, resolution, or cancellation reason" style={[styles.input, styles.multiline]} value={decisionReasons[item.id] ?? ""} onChangeText={(value) => setDecisionReasons((current) => ({ ...current, [item.id]: value }))} /><View style={styles.actions}>{Boolean(selectedOwners[item.id] ?? item.assignee_id) && <TouchableOpacity disabled={saving} onPress={() => void changeStatus(item, "in_progress", selectedOwners[item.id] ?? item.assignee_id)} style={styles.primarySmallButton}><Text style={styles.primaryButtonText}>{item.status === "open" ? "Assign & start" : "Update owner"}</Text></TouchableOpacity>}<TouchableOpacity disabled={saving} onPress={() => void changeStatus(item, "resolved")} style={styles.resolveButton}><Text style={styles.primaryButtonText}>Resolve</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={() => void changeStatus(item, "cancelled")} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity></View></>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: typography.size.title, fontWeight: "800", color: colors.textPrimary }, subtitle: { color: colors.textMuted, lineHeight: 20 },
  notice: { backgroundColor: colors.warningSurface, borderRadius: radius.md, padding: spacing.md }, noticeText: { color: colors.textPrimary, fontSize: typography.size.caption, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm }, cardTitle: { color: colors.textPrimary, fontSize: typography.size.body, fontWeight: "800" },
  fieldLabel: { color: colors.textPrimary, fontSize: typography.size.caption, fontWeight: "700" }, input: { borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.background }, multiline: { minHeight: 72, textAlignVertical: "top" },
  chip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, marginRight: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textPrimary, fontSize: typography.size.caption, fontWeight: "600" }, chipTextActive: { color: colors.surface },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md }, primaryButtonText: { color: colors.surface, fontWeight: "800" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }, domain: { color: colors.primary, fontSize: typography.size.caption, fontWeight: "800", textTransform: "uppercase" }, status: { color: colors.textMuted, fontSize: typography.size.caption, fontWeight: "700" }, meta: { color: colors.textMuted, fontSize: typography.size.caption }, body: { color: colors.textPrimary, lineHeight: 20 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, primarySmallButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, resolveButton: { backgroundColor: colors.greenDeep, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, cancelButton: { borderColor: colors.danger, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, cancelText: { color: colors.danger, fontWeight: "800" }, empty: { color: colors.textMuted, padding: spacing.xl, textAlign: "center" },
});
