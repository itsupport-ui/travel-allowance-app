import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DomainAuditServiceError,
  getDomainAuditEvents,
  type DomainAuditEvent,
} from "../../src/services/domainAuditService";
import { clearAuthSession } from "../../src/utils/storage";


const PAGE_SIZE = 30;
const domains = [
  ["", "All"],
  ["administration", "Staff"],
  ["attendance", "Attendance"],
  ["clinical", "Clinical"],
  ["configuration", "Configuration"],
  ["financial", "Financial"],
  ["location", "Location"],
  ["notification", "Notifications"],
  ["scheduling", "Scheduling"],
  ["reporting", "Reporting"],
] as const;
const periods = [
  ["all", "All time"],
  ["today", "Today"],
  ["7", "7 days"],
  ["30", "30 days"],
] as const;

type Period = (typeof periods)[number][0];

const titleCase = (value: string | null): string =>
  (value || "Not recorded")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const indiaBusinessDate = (daysAgo = 0): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const base = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  base.setUTCDate(base.getUTCDate() - daysAgo);
  return base.toISOString().slice(0, 10);
};

const rangeForPeriod = (period: Period) => {
  if (period === "all") return {};
  const days = period === "today" ? 0 : Number(period) - 1;
  return { fromDate: indiaBusinessDate(days), toDate: indiaBusinessDate() };
};

export default function AdminAuditLogScreen() {
  const [events, setEvents] = useState<DomainAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [domain, setDomain] = useState("");
  const [period, setPeriod] = useState<Period>("7");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (
    offset = 0,
    append = false,
    refresh = false
  ): Promise<void> => {
    if (append) setLoadingMore(true);
    else if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const page = await getDomainAuditEvents({
        domain: domain || undefined,
        ...rangeForPeriod(period),
        limit: PAGE_SIZE,
        offset,
      });
      setEvents((current) => append ? [...current, ...page.items] : page.items);
      setTotal(page.total);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof DomainAuditServiceError && loadError.status === 401) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Unable to load the audit log.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [domain, period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const resultLabel = useMemo(
    () => `${events.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} events`,
    [events.length, total]
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void load(0, false, true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back to reports"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons color={colors.textSecondary} name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Administration</Text>
            <Text style={styles.title}>Audit Log</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Trace operational, staff, configuration, notification, and reporting changes.
        </Text>

        <View style={styles.privacyCard}>
          <Ionicons color={colors.blueDark} name="shield-checkmark-outline" size={20} />
          <Text style={styles.privacyText}>
            Structured fields exclude patient identity, locations, proofs, clinical notes, staff contact/credential values, push tokens, and installation IDs. Do not enter patient details in operational reasons.
          </Text>
        </View>

        <Text style={styles.filterLabel}>Domain</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {domains.map(([value, label]) => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: domain === value }}
                key={value || "all"}
                onPress={() => setDomain(value)}
                style={[styles.chip, domain === value && styles.chipSelected]}
              >
                <Text style={[styles.chipText, domain === value && styles.chipTextSelected]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.filterLabel}>Business date</Text>
        <View style={styles.chipRowWrap}>
          {periods.map(([value, label]) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: period === value }}
              key={value}
              onPress={() => setPeriod(value)}
              style={[styles.chip, period === value && styles.chipSelected]}
            >
              <Text style={[styles.chipText, period === value && styles.chipTextSelected]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View accessibilityRole="progressbar" style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.stateText}>Loading audit history…</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateCard, styles.errorCard]}>
            <Ionicons color={colors.danger} name="alert-circle-outline" size={26} />
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons color={colors.textMuted} name="time-outline" size={28} />
            <Text style={styles.emptyTitle}>No audit events found</Text>
            <Text style={styles.stateText}>No recorded event matches these filters.</Text>
          </View>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{resultLabel}</Text>
            {events.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <View style={styles.domainBadge}>
                    <Text style={styles.domainText}>{titleCase(event.domain)}</Text>
                  </View>
                  <Text style={styles.eventDate}>{event.businessDate}</Text>
                </View>
                <Text style={styles.action}>{titleCase(event.action)}</Text>
                <Text style={styles.entity}>{titleCase(event.entityType)} #{event.entityId}</Text>
                <View style={styles.divider} />
                <Text style={styles.meta}>
                  {event.actorName || `User #${event.actorId}`} · {titleCase(event.actorRole)}
                </Text>
                <Text style={styles.meta}>{new Date(event.occurredAt).toLocaleString()}</Text>
                {(event.fromState || event.toState) ? (
                  <Text style={styles.transition}>
                    {titleCase(event.fromState)} → {titleCase(event.toState)}
                  </Text>
                ) : null}
                {(event.reason || event.reasonCode) ? (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonLabel}>Reason</Text>
                    <Text style={styles.reasonText}>{event.reason || titleCase(event.reasonCode)}</Text>
                  </View>
                ) : null}
              </View>
            ))}
            {events.length < total ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: loadingMore }}
                disabled={loadingMore}
                onPress={() => void load(events.length, true)}
                style={[styles.loadMoreButton, loadingMore && styles.disabled]}
              >
                {loadingMore ? <ActivityIndicator color={colors.surface} size="small" /> : null}
                <Text style={styles.loadMoreText}>{loadingMore ? "Loading…" : "Load More"}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: spacing.s80 },
  header: { alignItems: "center", flexDirection: "row", marginTop: spacing.md },
  backButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  headerText: { flex: 1, marginLeft: spacing.lg },
  eyebrow: { color: colors.textMuted, fontSize: typography.size.small, fontWeight: typography.weight.bold, textTransform: "uppercase" },
  title: { color: colors.textPrimary, fontSize: typography.size.size27, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  subtitle: { color: colors.textMuted, fontSize: typography.size.bodySmall, lineHeight: typography.lineHeight.bodyRelaxed, marginTop: spacing.lg },
  privacyCard: { alignItems: "flex-start", backgroundColor: colors.blueSurface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg },
  privacyText: { color: colors.blueDark, flex: 1, fontSize: typography.size.small, lineHeight: typography.lineHeight.body },
  filterLabel: { color: colors.textSecondary, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold, marginBottom: spacing.md, marginTop: spacing.xxl },
  chipRow: { flexDirection: "row", gap: spacing.md, paddingRight: spacing.xl },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  chip: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.lg },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: typography.size.small, fontWeight: typography.weight.bold },
  chipTextSelected: { color: colors.surface },
  stateCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, justifyContent: "center", marginTop: spacing.xxl, minHeight: 180, padding: spacing.xxl },
  stateText: { color: colors.textMuted, fontSize: typography.size.bodySmall, marginTop: spacing.lg, textAlign: "center" },
  errorCard: { borderColor: colors.dangerBorder },
  errorText: { color: colors.dangerDark, fontSize: typography.size.bodySmall, marginTop: spacing.md, textAlign: "center" },
  retryButton: { backgroundColor: colors.primary, borderRadius: radius.control, marginTop: spacing.xl, paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg },
  retryText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  emptyTitle: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold, marginTop: spacing.lg },
  resultCount: { color: colors.textMuted, fontSize: typography.size.small, fontWeight: typography.weight.bold, marginBottom: spacing.md, marginTop: spacing.xxl },
  eventCard: { backgroundColor: colors.surface, borderColor: colors.borderMuted, borderRadius: radius.control, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.xl, elevation: shadows.elevation.card, shadowColor: shadows.color, shadowOffset: shadows.offset.y2, shadowOpacity: shadows.opacity.soft, shadowRadius: shadows.radius.cardSoft },
  eventHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  domainBadge: { backgroundColor: colors.primarySurface, borderRadius: radius.pill, paddingHorizontal: spacing.mdPlus, paddingVertical: spacing.sm },
  domainText: { color: colors.primaryDark, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  eventDate: { color: colors.textMuted, fontSize: typography.size.small },
  action: { color: colors.textPrimary, fontSize: typography.size.bodyLarge, fontWeight: typography.weight.extrabold, marginTop: spacing.lg },
  entity: { color: colors.textSecondary, fontSize: typography.size.bodySmall, marginTop: spacing.xs },
  divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: spacing.lg },
  meta: { color: colors.textMuted, fontSize: typography.size.small, marginTop: spacing.xs },
  transition: { color: colors.textStrong, fontSize: typography.size.bodySmall, fontWeight: typography.weight.bold, marginTop: spacing.lg },
  reasonBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, marginTop: spacing.lg, padding: spacing.lg },
  reasonLabel: { color: colors.textMuted, fontSize: typography.size.tiny, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  reasonText: { color: colors.textSecondary, fontSize: typography.size.bodySmall, lineHeight: typography.lineHeight.body, marginTop: spacing.xs },
  loadMoreButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flexDirection: "row", gap: spacing.md, justifyContent: "center", marginTop: spacing.md, minHeight: 48 },
  loadMoreText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  disabled: { opacity: 0.55 },
});
