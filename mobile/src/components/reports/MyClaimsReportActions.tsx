import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  previewMyClaimsReport,
  getMyReportExportHistory,
  deliverMyClaimsReport,
  type MyClaimsReportFormat,
  type MyClaimsReportStatus,
  type MyReportType,
  type ReportExportHistoryItem,
} from "../../services/reportCenterService";
import { getApiErrorMessage } from "../../services/errorHandler";
import type { ReportDeliveryMode } from "../../services/reportFileDelivery";
import { colors, radius, spacing, typography } from "../../theme";
import { formatDateForApi } from "../../utils/date";
import { DateTimeField } from "../schedule/ScheduleFormControls";

const formats: readonly MyClaimsReportFormat[] = ["pdf", "xlsx", "csv"];
const periods = ["all", "30_days", "this_month", "custom"] as const;
type ReportPeriod = (typeof periods)[number];
const claimStatuses: readonly MyClaimsReportStatus[] = [
  "all",
  "pending",
  "approved",
  "rejected",
];
const attendanceStatuses: readonly MyClaimsReportStatus[] = [
  "all",
  "active",
  "completed",
  "ended_early",
];
const expenseStatuses: readonly MyClaimsReportStatus[] = [
  "all",
  "draft",
  "submitted",
];
const clinicalStatuses: readonly MyClaimsReportStatus[] = [
  "all",
  "scheduled",
  "in_progress",
  "completed",
  "missed",
  "cancelled",
  "pending",
  "submitted",
  "approved",
  "rejected",
];

const chooseDeliveryMode = (): Promise<ReportDeliveryMode | null> =>
  new Promise((resolve) => {
    Alert.alert(
      "Deliver Report",
      "Save a durable copy to a folder, or open the system share sheet.",
      [
        { onPress: () => resolve(null), style: "cancel", text: "Cancel" },
        { onPress: () => resolve("save"), text: "Save" },
        { onPress: () => resolve("share"), text: "Share" },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });

const indiaDate = (): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const periodDates = (
  period: ReportPeriod,
  customFrom: Date | null,
  customTo: Date | null
) => {
  if (period === "all") return {};
  if (period === "custom") {
    return {
      fromDate: customFrom ? formatDateForApi(customFrom) : undefined,
      toDate: customTo ? formatDateForApi(customTo) : undefined,
    };
  }
  const toDate = indiaDate();
  if (period === "this_month") {
    return { fromDate: `${toDate.slice(0, 8)}01`, toDate };
  }
  const start = new Date(`${toDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { fromDate: start.toISOString().slice(0, 10), toDate };
};

export function MyClaimsReportActions() {
  const [reportType, setReportType] = useState<MyReportType>("my_claims");
  const [working, setWorking] = useState<MyClaimsReportFormat | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [status, setStatus] = useState<MyClaimsReportStatus>("all");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [history, setHistory] = useState<ReportExportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await getMyReportExportHistory());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const prepare = async (format: MyClaimsReportFormat): Promise<void> => {
    if (working) return;
    setWorking(format);
    try {
      if (period === "custom" && (!customFrom || !customTo)) {
        Alert.alert(
          "Choose a Date Range",
          "Select both From date and To date before previewing the report."
        );
        return;
      }
      if (
        period === "custom" &&
        customFrom &&
        customTo &&
        customTo < customFrom
      ) {
        Alert.alert(
          "Invalid Date Range",
          "To date cannot be before From date."
        );
        return;
      }
      const preview = await previewMyClaimsReport({
        ...periodDates(period, customFrom, customTo),
        status,
      }, reportType);
      if (preview.row_count === 0) {
        Alert.alert(
          "No Records to Export",
          `No ${reportType === "my_claims" ? "claim" : reportType === "my_attendance" ? "attendance" : reportType === "my_expenses" ? "travel or expense" : reportType === "my_performance" ? "operational" : "clinical activity"} records are available for this report.`
        );
        return;
      }
      Alert.alert(
        `Generate ${format.toUpperCase()}?`,
        reportType === "my_claims"
          ? `${preview.row_count} claim${preview.row_count === 1 ? "" : "s"} · INR ${preview.total_amount.toFixed(2)}\nPatient-identifying columns are excluded.`
          : reportType === "my_attendance"
            ? `${preview.row_count} workday${preview.row_count === 1 ? "" : "s"} · ${Number(preview.summary.total_work_minutes ?? 0)} worked minutes\nPrecise locations and patient-identifying data are excluded.`
            : reportType === "my_performance"
              ? `${preview.row_count} staff summary · ${Number(preview.summary.total_workdays ?? 0)} workdays · ${Number(preview.summary.completed_clinical_activities ?? 0)} completed activities\nThis report contains objective totals only and excludes patients, locations, notes, and proof files.`
              : reportType === "my_expenses"
              ? `${preview.row_count} entr${preview.row_count === 1 ? "y" : "ies"} · INR ${preview.total_amount.toFixed(2)} · ${Number(preview.summary.total_distance_km ?? 0)} km\nAddresses, coordinates, patient data, remarks, and proof paths are excluded.`
              : `${preview.row_count} activit${preview.row_count === 1 ? "y" : "ies"} · ${Number(preview.summary.total_clinical_minutes ?? 0)} clinical minutes\nPatients, diagnoses, notes, phone numbers, and locations are excluded.`,
        [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => {
              void (async () => {
                setWorking(format);
                try {
                  const result = await deliverMyClaimsReport(
                    format,
                    preview.snapshot_id,
                    "save"
                  );
                  await loadHistory();
                  Alert.alert(
                    "Report Saved",
                    `${result.fileName} was saved to the selected folder with ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}.`
                  );
                } catch (error) {
                  Alert.alert(
                    "Unable to Export Report",
                    getApiErrorMessage(error, "Unable to create the report.")
                  );
                } finally {
                  setWorking(null);
                }
              })();
            },
            text: "Save",
          },
          {
            onPress: () => {
              void deliverPreview(format, preview.snapshot_id, "share");
            },
            text: "Share",
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        "Unable to Preview Report",
        getApiErrorMessage(error, "Unable to preview the report.")
      );
    } finally {
      setWorking(null);
    }
  };

  const deliverPreview = async (
    format: MyClaimsReportFormat,
    snapshotId: string,
    mode: ReportDeliveryMode
  ): Promise<void> => {
    if (working) return;
    setWorking(format);
    try {
      const result = await deliverMyClaimsReport(format, snapshotId, mode);
      await loadHistory();
      Alert.alert(
        mode === "save" ? "Report Saved" : "Report Shared",
        `${result.fileName} contains ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      Alert.alert(
        `Unable to ${mode === "save" ? "Save" : "Share"} Report`,
        getApiErrorMessage(error, "Unable to deliver the report.")
      );
    } finally {
      setWorking(null);
    }
  };

  const shareAgain = async (item: ReportExportHistoryItem): Promise<void> => {
    if (working) return;
    const deliveryMode = await chooseDeliveryMode();
    if (!deliveryMode) return;
    setWorking(item.format);
    try {
      const result = await deliverMyClaimsReport(
        item.format,
        item.snapshot_id,
        deliveryMode
      );
      await loadHistory();
      Alert.alert(
        deliveryMode === "save" ? "Report Saved" : "Report Shared",
        `${result.fileName} was ${deliveryMode === "save" ? "saved to the selected folder" : "sent to the system share sheet"}.`
      );
    } catch (error) {
      Alert.alert(
        `Unable to ${deliveryMode === "save" ? "Save" : "Share"} Report`,
        getApiErrorMessage(error, "Preview the report again and retry.")
      );
      await loadHistory();
    } finally {
      setWorking(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.iconBox}>
          <Ionicons color={colors.primary} name="download-outline" size={20} />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.title}>My Reports</Text>
          <Text style={styles.subtitle}>
            Filter, preview, then save or share claims, attendance, travel, clinical activity, or your operational summary.
          </Text>
        </View>
      </View>
      <Text style={styles.filterLabel}>Report</Text>
      <View style={styles.filters}>
        {(["my_claims", "my_attendance", "my_expenses", "my_clinical_activity", "my_performance"] as const).map((value) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: reportType === value }}
            disabled={working !== null}
            key={value}
            onPress={() => {
              setReportType(value);
              setStatus("all");
            }}
            style={[
              styles.filter,
              reportType === value && styles.filterSelected,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                reportType === value && styles.filterTextSelected,
              ]}
            >
              {value === "my_claims"
                ? "Claims"
                : value === "my_attendance"
                  ? "Attendance"
                  : value === "my_expenses"
                    ? "Travel & expenses"
                    : value === "my_clinical_activity"
                      ? "Clinical activity"
                      : "Operational summary"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.filterLabel}>Period</Text>
      <View style={styles.filters}>
        {periods.map((value) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: period === value }}
            disabled={working !== null}
            key={value}
            onPress={() => setPeriod(value)}
            style={[styles.filter, period === value && styles.filterSelected]}
          >
            <Text
              style={[
                styles.filterText,
                period === value && styles.filterTextSelected,
              ]}
            >
              {value === "all"
                ? "All time"
                : value === "30_days"
                  ? "30 days"
                  : value === "this_month"
                    ? "This month"
                    : "Custom"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {period === "custom" ? (
        <View style={styles.dateFields}>
          <DateTimeField
            label="From date"
            mode="date"
            onChange={(value) => {
              setCustomFrom(value);
              if (customTo && customTo < value) setCustomTo(null);
            }}
            placeholder="Select start date"
            required
            value={customFrom}
          />
          <DateTimeField
            label="To date"
            minimumDate={customFrom ?? undefined}
            mode="date"
            onChange={setCustomTo}
            placeholder="Select end date"
            required
            value={customTo}
          />
        </View>
      ) : null}
      <Text style={styles.filterLabel}>
        {reportType === "my_claims"
          ? "Claim status"
          : reportType === "my_attendance"
            ? "Workday status"
            : reportType === "my_expenses"
              ? "Entry status"
              : reportType === "my_performance"
                ? "Status (not applicable)"
                : "Activity status"}
      </Text>
      <View style={styles.filters}>
        {(reportType === "my_claims"
          ? claimStatuses
          : reportType === "my_attendance"
            ? attendanceStatuses
            : reportType === "my_expenses"
              ? expenseStatuses
              : reportType === "my_performance"
                ? (["all"] as const)
                : clinicalStatuses
        ).map((value) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: status === value }}
            disabled={working !== null}
            key={value}
            onPress={() => setStatus(value)}
            style={[styles.filter, status === value && styles.filterSelected]}
          >
            <Text
              style={[
                styles.filterText,
                status === value && styles.filterTextSelected,
              ]}
            >
              {value === "ended_early"
                ? "Ended early"
                : value === "completed" && reportType === "my_attendance"
                  ? "Completed normally"
                  : value[0].toUpperCase() + value.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.actions}>
        {formats.map((format) => (
          <TouchableOpacity
            accessibilityLabel={`Export my ${reportType === "my_claims" ? "claims" : reportType === "my_attendance" ? "attendance" : reportType === "my_expenses" ? "travel and expenses" : reportType === "my_performance" ? "operational summary" : "clinical activity"} as ${format.toUpperCase()}`}
            accessibilityRole="button"
            disabled={working !== null}
            key={format}
            onPress={() => void prepare(format)}
            style={[styles.button, working && styles.disabled]}
          >
            {working === format ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.buttonText}>{format.toUpperCase()}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.historySection}>
        <Text style={styles.filterLabel}>Recent exports</Text>
        {historyLoading ? (
          <ActivityIndicator
            color={colors.primary}
            style={styles.historyLoading}
          />
        ) : history.length === 0 ? (
          <Text style={styles.historyEmpty}>
            Generated reports will appear here.
          </Text>
        ) : (
          history.map((item) => {
            const expired = new Date(item.snapshot_expires_at) <= new Date();
            return (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyContent}>
                  <Text style={styles.historyTitle}>
                    {item.report_type === "my_attendance" ? "Attendance" : item.report_type === "my_expenses" ? "Travel & expenses" : item.report_type === "my_clinical_activity" ? "Clinical activity" : item.report_type === "my_performance" ? "Operational summary" : "Claims"} · {item.format.toUpperCase()} · {item.row_count} row
                    {item.row_count === 1 ? "" : "s"}
                    {item.report_type === "my_claims" || item.report_type === "my_expenses" || item.report_type === "my_performance" ? ` · INR ${item.total_amount.toFixed(2)}` : ""}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {new Date(item.last_downloaded_at).toLocaleString("en-IN")} · {item.download_count} download
                    {item.download_count === 1 ? "" : "s"}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityLabel={expired ? "Report expired" : `Share ${item.format.toUpperCase()} report again`}
                  accessibilityRole="button"
                  disabled={expired || working !== null}
                  onPress={() => void shareAgain(item)}
                  style={[styles.historyButton, (expired || working) && styles.disabled]}
                >
                  <Text style={styles.historyButtonText}>
                    {expired ? "Expired" : "Save / Share"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  heading: { alignItems: "center", flexDirection: "row" },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headingText: { flex: 1, marginLeft: spacing.md },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  filterLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.lg,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dateFields: { gap: spacing.md, marginTop: spacing.md },
  historySection: {
    borderTopColor: colors.primaryBorder,
    borderTopWidth: 1,
    marginTop: spacing.xl,
  },
  historyLoading: { alignSelf: "flex-start", marginTop: spacing.md },
  historyEmpty: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.md,
  },
  historyItem: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  historyContent: { flex: 1 },
  historyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  historyMeta: {
    color: colors.textMuted,
    fontSize: typography.size.tiny,
    marginTop: spacing.xs,
  },
  historyButton: {
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyButtonText: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  filter: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterSelected: { backgroundColor: colors.primary },
  filterText: { color: colors.primaryDark, fontSize: typography.size.small },
  filterTextSelected: {
    color: colors.white,
    fontWeight: typography.weight.bold,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
  },
  buttonText: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  disabled: { opacity: 0.55 },
});
