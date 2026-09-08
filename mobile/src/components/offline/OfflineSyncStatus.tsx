import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { queryClient } from "../../query/queryClient";
import {
  discardOfflineMutation,
  getOfflineQueueSummary,
  offlineMutationLabel,
  processOfflineMutationQueue,
  subscribeToOfflineQueue,
} from "../../services/offlineMutationQueue";
import { colors, radius, shadows, spacing, typography } from "../../theme";
import type { OfflineQueueSummary } from "../../types/offlineMutation";

const EMPTY_SUMMARY: OfflineQueueSummary = {
  items: [],
  needsAttentionCount: 0,
  queuedCount: 0,
  syncingCount: 0,
};

const errorMessage = (code: string | null): string | null => {
  if (!code) return null;
  if (code === "BUSINESS_DATE_EXPIRED") {
    return "This action belongs to an earlier business day and will not be replayed.";
  }
  if (code === "SECURE_PAYLOAD_UNAVAILABLE") {
    return "The secure action data is unavailable. Remove this item and repeat the action.";
  }
  return `Server review required (${code.replaceAll("_", " ").toLowerCase()}).`;
};

export function OfflineSyncStatus() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSummary(await getOfflineQueueSummary());
  }, []);

  const sync = useCallback(async (includeNeedsAttention: boolean) => {
    setSyncing(true);
    setMessage(null);
    try {
      const next = await processOfflineMutationQueue(includeNeedsAttention);
      setSummary(next);
      if (next.items.length === 0) {
        setMessage("All saved actions are synchronized.");
      } else if (next.needsAttentionCount > 0) {
        setMessage("Some actions need review before they can be retried.");
      }
      await queryClient.invalidateQueries();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Saved actions could not be synchronized."
      );
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToOfflineQueue(() => {
      void load();
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void sync(false);
      }
    );
    const timer = setInterval(() => {
      void sync(false);
    }, 30_000);
    return () => {
      unsubscribe();
      appStateSubscription.remove();
      clearInterval(timer);
    };
  }, [load, sync]);

  const remove = (id: string, label: string) => {
    Alert.alert(
      "Remove Saved Action?",
      `${label} will not be sent. You may need to repeat it in the app.`,
      [
        { style: "cancel", text: "Keep" },
        {
          onPress: () => void discardOfflineMutation(id),
          style: "destructive",
          text: "Remove",
        },
      ]
    );
  };

  if (summary.items.length === 0 && !open) return null;

  return (
    <>
      {summary.items.length > 0 ? (
        <TouchableOpacity
          accessibilityHint="Opens saved action details and retry controls"
          accessibilityLabel={`${summary.items.length} saved actions pending synchronization`}
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={styles.banner}
        >
          {syncing ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : null}
          <Text style={styles.bannerText}>
            {syncing
              ? "Synchronizing saved actions..."
              : summary.needsAttentionCount
                ? `${summary.needsAttentionCount} saved action${summary.needsAttentionCount === 1 ? "" : "s"} need review`
                : `${summary.queuedCount} action${summary.queuedCount === 1 ? "" : "s"} waiting to sync`}
          </Text>
          <Text style={styles.bannerAction}>View</Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <SafeAreaView style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Saved Field Actions</Text>
                <Text style={styles.description}>
                  Payloads are stored in device secure storage, scoped to your account,
                  and never replayed after their business date.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Close saved actions"
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </Text>
            ) : null}

            <ScrollView contentContainerStyle={styles.list}>
              {summary.items.length === 0 ? (
                <Text style={styles.empty}>All saved actions are synchronized.</Text>
              ) : (
                summary.items.map((item) => {
                  const label = offlineMutationLabel(item.operationType);
                  const itemError = errorMessage(item.lastErrorCode);
                  return (
                    <View key={item.id} style={styles.item}>
                      <View style={styles.itemHeading}>
                        <Text style={styles.itemTitle}>{label}</Text>
                        <Text style={styles.status}>{item.status.replaceAll("_", " ")}</Text>
                      </View>
                      <Text style={styles.itemMeta}>
                        Saved {new Date(item.createdAt).toLocaleString()} · attempts {item.attemptCount}
                      </Text>
                      {itemError ? <Text style={styles.itemError}>{itemError}</Text> : null}
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => remove(item.id, label)}
                        style={styles.removeButton}
                      >
                        <Text style={styles.removeText}>Remove action</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {summary.items.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={syncing}
                onPress={() => void sync(true)}
                style={[styles.syncButton, syncing && styles.disabled]}
              >
                {syncing ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : null}
                <Text style={styles.syncText}>
                  {syncing ? "Synchronizing..." : "Retry Saved Actions"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    backgroundColor: colors.warningDark,
    borderRadius: radius.control,
    bottom: 82,
    elevation: shadows.elevation.floating,
    flexDirection: "row",
    gap: spacing.md,
    left: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: "absolute",
    right: spacing.lg,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.medium,
    shadowRadius: shadows.radius.card,
    zIndex: 100,
  },
  bannerAction: {
    color: colors.surface,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textDecorationLine: "underline",
  },
  bannerText: {
    color: colors.surface,
    flex: 1,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.lg,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  description: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  disabled: { opacity: 0.55 },
  empty: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    paddingVertical: spacing.section,
    textAlign: "center",
  },
  header: { flexDirection: "row", gap: spacing.md },
  headerText: { flex: 1 },
  item: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.lg,
  },
  itemError: {
    color: colors.danger,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.sm,
  },
  itemHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: typography.size.tiny,
    marginTop: spacing.sm,
  },
  itemTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  list: { gap: spacing.md, paddingVertical: spacing.xl },
  message: {
    backgroundColor: colors.blueSurface,
    borderRadius: radius.control,
    color: colors.blueDark,
    fontSize: typography.size.small,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  modalBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    flex: 1,
    justifyContent: "flex-end",
  },
  removeButton: { alignSelf: "flex-start", marginTop: spacing.md },
  removeText: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.largePanel,
    borderTopRightRadius: radius.largePanel,
    maxHeight: "82%",
    padding: spacing.xxl,
  },
  status: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.pill,
    color: colors.warningDark,
    fontSize: typography.size.tiny,
    fontWeight: typography.weight.extrabold,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textTransform: "capitalize",
  },
  syncButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 50,
  },
  syncText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
});
