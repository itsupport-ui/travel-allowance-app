import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DateTimeField,
  SearchableSelect,
} from "../schedule/ScheduleFormControls";
import {
  AdminScheduleServiceError,
  getAdminScheduleFormOptions,
} from "../../services/adminScheduleService";
import { getApiErrorMessage } from "../../services/errorHandler";
import {
  deliverReportFile,
  type ReportDeliveryMode,
} from "../../services/reportFileDelivery";
import {
  downloadTravelExpenseReport,
  getTravelExpenseReport,
} from "../../services/travelExpenseReportService";
import type {
  TravelExpenseReportFilters,
  TravelExpenseReportFormat,
  TravelExpenseReportGroup,
  TravelExpenseReportResponse,
  TravelExpensePersonType,
} from "../../types/travelExpenseReport";
import { formatDateForApi } from "../../utils/date";

const PRIMARY = colors.primary;

export type TravelExpenseReportVariant = "admin" | "therapist" | "doctor";

type PeriodMode = "month" | "custom";

interface TravelExpenseReportScreenProps {
  variant: TravelExpenseReportVariant;
}

const formatCurrency = (value: number): string =>
  `INR ${value.toFixed(2)}`;

const formatKm = (value: number): string => `${value.toFixed(2)} km`;

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

const monthRange = (
  anchor: Date
): { startDate: string; endDate: string } => {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return {
    startDate: formatDateForApi(start),
    endDate: formatDateForApi(end),
  };
};

const deleteFileSafely = (file: File | null): void => {
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must not replace the original export error.
  }
};

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ReportGroupTable({ group }: { group: TravelExpenseReportGroup }) {
  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupTitle}>{group.person_name}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colDate]}>
              Date
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colPatient]}>
              Patient
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colAddress]}>
              From
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colAddress]}>
              To
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colNumber]}>
              KM
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colNumber]}>
              Fare
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colNumber]}>
              DA
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colNumber]}>
              Others
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText, styles.colNumber]}>
              Total
            </Text>
          </View>
          {group.rows.map((row, index) => (
            <View
              key={`${row.date}-${index}`}
              style={[
                styles.tableRow,
                index % 2 === 1 ? styles.tableRowAlt : null,
              ]}
            >
              <Text style={[styles.tableCell, styles.colDate]}>{row.date}</Text>
              <Text style={[styles.tableCell, styles.colPatient]} numberOfLines={1}>
                {row.patient_name}
              </Text>
              <Text style={[styles.tableCell, styles.colAddress]} numberOfLines={2}>
                {row.from_address}
              </Text>
              <Text style={[styles.tableCell, styles.colAddress]} numberOfLines={2}>
                {row.to_address}
              </Text>
              <Text style={[styles.tableCell, styles.colNumber]}>
                {row.km.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, styles.colNumber]}>
                {row.fare.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, styles.colNumber]}>
                {row.daily_allowance.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, styles.colNumber]}>
                {row.others.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, styles.colNumber, styles.tableTotalCell]}>
                {row.total.toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={styles.groupSubtotalRow}>
            <Text style={[styles.tableCell, styles.colDate, styles.groupSubtotalLabel]}>
              Subtotal
            </Text>
            <Text style={[styles.tableCell, styles.colPatient]} />
            <Text style={[styles.tableCell, styles.colAddress]} />
            <Text style={[styles.tableCell, styles.colAddress]} />
            <Text style={[styles.tableCell, styles.colNumber, styles.groupSubtotalLabel]}>
              {group.total_km.toFixed(2)}
            </Text>
            <Text style={[styles.tableCell, styles.colNumber, styles.groupSubtotalLabel]}>
              {group.total_fare.toFixed(2)}
            </Text>
            <Text style={[styles.tableCell, styles.colNumber, styles.groupSubtotalLabel]}>
              {group.total_daily_allowance.toFixed(2)}
            </Text>
            <Text style={[styles.tableCell, styles.colNumber, styles.groupSubtotalLabel]}>
              {group.total_others.toFixed(2)}
            </Text>
            <Text style={[styles.tableCell, styles.colNumber, styles.groupSubtotalLabel]}>
              {group.grand_total.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function TravelExpenseReportScreen({
  variant,
}: TravelExpenseReportScreenProps) {
  const isAdmin = variant === "admin";

  const [personType, setPersonType] =
    useState<TravelExpensePersonType>("therapist");
  const [personId, setPersonId] = useState<number | null>(null);
  const [therapistOptions, setTherapistOptions] = useState<
    { id: number | string; label: string; description?: string }[]
  >([]);
  const [doctorOptions, setDoctorOptions] = useState<
    { id: number | string; label: string; description?: string }[]
  >([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(isAdmin);
  const [staffOptionsError, setStaffOptionsError] = useState<string | null>(
    null
  );

  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [monthAnchor, setMonthAnchor] = useState<Date | null>(new Date());
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TravelExpenseReportResponse | null>(
    null
  );
  const [exporting, setExporting] = useState<TravelExpenseReportFormat | null>(
    null
  );

  const loadStaffOptions = useCallback(async (): Promise<void> => {
    setStaffOptionsLoading(true);
    setStaffOptionsError(null);
    try {
      const options = await getAdminScheduleFormOptions();
      setTherapistOptions(
        options.therapists
          .map((therapist) => ({
            description: therapist.email,
            id: therapist.id,
            label: therapist.name,
          }))
          .sort((first, second) => first.label.localeCompare(second.label))
      );
      setDoctorOptions(
        options.doctors
          .map((doctor) => ({
            description: doctor.specialization || undefined,
            id: doctor.id,
            label: doctor.name,
          }))
          .sort((first, second) => first.label.localeCompare(second.label))
      );
    } catch (loadError) {
      setStaffOptionsError(
        loadError instanceof AdminScheduleServiceError
          ? loadError.message
          : getApiErrorMessage(loadError, "Unable to load therapists and doctors.")
      );
    } finally {
      setStaffOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void loadStaffOptions();
  }, [isAdmin, loadStaffOptions]);

  const buildFilters = useCallback((): TravelExpenseReportFilters | null => {
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (periodMode === "month") {
      if (!monthAnchor) {
        Alert.alert("Choose a Month", "Select any date within the desired month.");
        return null;
      }
      const range = monthRange(monthAnchor);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      if (!customFrom || !customTo) {
        Alert.alert(
          "Choose a Date Range",
          "Select both From date and To date before generating the report."
        );
        return null;
      }
      if (customTo < customFrom) {
        Alert.alert("Invalid Date Range", "To date cannot be before From date.");
        return null;
      }
      startDate = formatDateForApi(customFrom);
      endDate = formatDateForApi(customTo);
    }

    return {
      personType: isAdmin ? personType : undefined,
      personId: isAdmin ? personId ?? "all" : undefined,
      startDate,
      endDate,
    };
  }, [customFrom, customTo, isAdmin, monthAnchor, periodMode, personId, personType]);

  const generateReport = useCallback(async (): Promise<void> => {
    const filters = buildFilters();
    if (!filters) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTravelExpenseReport(filters);
      setReport(data);
    } catch (loadError) {
      setReport(null);
      setError(
        getApiErrorMessage(loadError, "Unable to load the travel expense report.")
      );
    } finally {
      setLoading(false);
    }
  }, [buildFilters]);

  const exportReport = useCallback(
    async (format: TravelExpenseReportFormat): Promise<void> => {
      if (exporting) return;
      const filters = buildFilters();
      if (!filters) return;
      const deliveryMode = await chooseDeliveryMode();
      if (!deliveryMode) return;
      setExporting(format);
      let file: File | null = null;
      try {
        const download = await downloadTravelExpenseReport(filters, format);
        file = download.file;
        await deliverReportFile(deliveryMode, {
          dialogTitle: "Share Travel Expense Report",
          file: download.file,
          fileName: download.fileName,
          mimeType: download.mimeType,
        });
        Alert.alert(
          deliveryMode === "save" ? "Report Saved" : "Report Shared",
          `${download.fileName} was ${
            deliveryMode === "save"
              ? "saved to the selected folder"
              : "sent to the system share sheet"
          }.`
        );
      } catch (exportError) {
        Alert.alert(
          `Unable to Export ${format === "xlsx" ? "Excel" : format.toUpperCase()}`,
          getApiErrorMessage(exportError, "Unable to generate the report file.")
        );
      } finally {
        deleteFileSafely(file);
        setExporting(null);
      }
    },
    [buildFilters, exporting]
  );

  const busy = loading || exporting !== null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.container}
    >
      <Text style={styles.eyebrow}>
        {isAdmin ? "Administration" : variant === "doctor" ? "Doctor" : "Therapist"}
      </Text>
      <Text style={styles.title}>Travel Expense Report</Text>
      <Text style={styles.subtitle}>
        {isAdmin
          ? "Generate travel expense reports for any therapist or doctor."
          : "Generate your travel expense report for a month or custom date range."}
      </Text>

      {isAdmin ? (
        <View style={styles.card}>
          <Text style={styles.filterLabel}>Person Type</Text>
          <View style={styles.chipRow}>
            {(["therapist", "doctor"] as const).map((value) => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: personType === value }}
                disabled={busy}
                key={value}
                onPress={() => {
                  setPersonType(value);
                  setPersonId(null);
                  setReport(null);
                }}
                style={[styles.chip, personType === value && styles.chipSelected]}
              >
                <Text
                  style={[
                    styles.chipText,
                    personType === value && styles.chipTextSelected,
                  ]}
                >
                  {value === "therapist" ? "Therapist" : "Doctor"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {staffOptionsLoading ? (
            <ActivityIndicator
              color={PRIMARY}
              style={styles.inlineLoading}
            />
          ) : staffOptionsError ? (
            <View style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>{staffOptionsError}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => void loadStaffOptions()}
                style={styles.inlineRetryButton}
              >
                <Ionicons color={PRIMARY} name="refresh" size={16} />
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SearchableSelect
              accessibilityLabel={`Select ${personType}`}
              emptyMessage={`No ${personType}s found.`}
              icon={personType === "doctor" ? "medkit-outline" : "person-outline"}
              label={personType === "doctor" ? "Doctor" : "Therapist"}
              onSelect={(option) => {
                setPersonId(option.id === "all" ? null : Number(option.id));
                setReport(null);
              }}
              options={[
                {
                  id: "all",
                  label: personType === "doctor" ? "All doctors" : "All therapists",
                },
                ...(personType === "doctor" ? doctorOptions : therapistOptions),
              ]}
              placeholder={personType === "doctor" ? "All doctors" : "All therapists"}
              searchPlaceholder={`Search ${personType}s`}
              selectedId={personId ?? "all"}
              title={personType === "doctor" ? "Select Doctor" : "Select Therapist"}
            />
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.filterLabel}>Period</Text>
        <View style={styles.chipRow}>
          {(["month", "custom"] as const).map((value) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: periodMode === value }}
              disabled={busy}
              key={value}
              onPress={() => {
                setPeriodMode(value);
                setReport(null);
              }}
              style={[styles.chip, periodMode === value && styles.chipSelected]}
            >
              <Text
                style={[
                  styles.chipText,
                  periodMode === value && styles.chipTextSelected,
                ]}
              >
                {value === "month" ? "Month" : "Custom range"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {periodMode === "month" ? (
          <DateTimeField
            label="Any date in the month"
            mode="date"
            onChange={(value) => {
              setMonthAnchor(value);
              setReport(null);
            }}
            placeholder="Select a date"
            value={monthAnchor}
          />
        ) : (
          <View style={styles.dateFields}>
            <DateTimeField
              label="From date"
              mode="date"
              onChange={(value) => {
                setCustomFrom(value);
                if (customTo && customTo < value) setCustomTo(null);
                setReport(null);
              }}
              placeholder="Select start date"
              value={customFrom}
            />
            <DateTimeField
              label="To date"
              minimumDate={customFrom ?? undefined}
              mode="date"
              onChange={(value) => {
                setCustomTo(value);
                setReport(null);
              }}
              placeholder="Select end date"
              value={customTo}
            />
          </View>
        )}

        <TouchableOpacity
          accessibilityLabel="Generate travel expense report"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void generateReport()}
          style={[styles.generateButton, busy && styles.disabledButton]}
        >
          {loading ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons color={colors.surface} name="document-text-outline" size={18} />
          )}
          <Text style={styles.generateButtonText}>
            {loading ? "Generating..." : "Generate Report"}
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={22} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {report ? (
        <View style={styles.card}>
          <Text style={styles.reportHeading}>{report.heading}</Text>
          <Text style={styles.reportPeriod}>{report.period_label}</Text>

          {report.row_count === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                color={colors.textSubtle}
                name="document-outline"
                size={30}
              />
              <Text style={styles.emptyStateText}>
                {report.warnings[0] ??
                  "No travel expense records found for the selected period."}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryGrid}>
                <SummaryMetric label="Total KM" value={formatKm(report.total_km)} />
                <SummaryMetric
                  label="Total Fare"
                  value={formatCurrency(report.total_fare)}
                />
                <SummaryMetric
                  label="Daily Allowance"
                  value={formatCurrency(report.total_daily_allowance)}
                />
                <SummaryMetric
                  label="Others"
                  value={formatCurrency(report.total_others)}
                />
                <SummaryMetric
                  label="Grand Total"
                  value={formatCurrency(report.grand_total)}
                />
              </View>

              {report.groups.map((group) => (
                <ReportGroupTable group={group} key={group.person_id} />
              ))}

              <View style={styles.exportRow}>
                {(["pdf", "xlsx", "csv"] as const).map((format) => (
                  <TouchableOpacity
                    accessibilityLabel={`Export report as ${format.toUpperCase()}`}
                    accessibilityRole="button"
                    disabled={exporting !== null}
                    key={format}
                    onPress={() => void exportReport(format)}
                    style={[
                      styles.exportButton,
                      exporting !== null && styles.disabledButton,
                    ]}
                  >
                    {exporting === format ? (
                      <ActivityIndicator color={PRIMARY} size="small" />
                    ) : (
                      <Text style={styles.exportButtonText}>
                        {format === "xlsx" ? "EXCEL" : format.toUpperCase()}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s5,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
  },
  chipTextSelected: {
    color: colors.white,
    fontWeight: typography.weight.bold,
  },
  dateFields: {
    gap: spacing.md,
  },
  inlineLoading: {
    alignSelf: "flex-start",
    marginTop: spacing.lg,
  },
  inlineError: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  inlineErrorText: {
    color: colors.dangerDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.body,
  },
  inlineRetryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.s5,
    marginTop: spacing.s9,
  },
  inlineRetryText: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  generateButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 50,
  },
  generateButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorCard: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.dangerDark,
    flex: 1,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
  },
  reportHeading: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  reportPeriod: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.section,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  summaryMetric: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexBasis: "48%",
    flexGrow: 1,
    padding: spacing.lg,
  },
  summaryLabel: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  groupCard: {
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    overflow: "hidden",
    padding: spacing.md,
  },
  groupTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tableHeaderRow: {
    backgroundColor: colors.neutral100,
    flexDirection: "row",
  },
  tableRow: {
    borderTopColor: colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  tableRowAlt: {
    backgroundColor: colors.surfaceMuted,
  },
  tableCell: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tableHeaderText: {
    color: colors.textMuted,
    fontWeight: typography.weight.bold,
  },
  tableTotalCell: {
    fontWeight: typography.weight.bold,
  },
  colDate: { width: 78 },
  colPatient: { width: 110 },
  colAddress: { width: 140 },
  colNumber: { textAlign: "right", width: 70 },
  groupSubtotalRow: {
    backgroundColor: colors.primarySurface,
    borderTopColor: colors.primaryBorder,
    borderTopWidth: 1,
    flexDirection: "row",
  },
  groupSubtotalLabel: {
    color: colors.primaryDark,
    fontWeight: typography.weight.extrabold,
  },
  exportRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  exportButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  exportButtonText: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
});
