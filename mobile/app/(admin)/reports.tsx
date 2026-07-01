import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { appConfig } from "../../src/config/env";
import {
  FilterFieldSkeleton,
  ReportsSkeleton,
} from "../../src/components/skeletons/ScreenSkeletons";
import {
  DateTimeField,
  SearchableSelect,
  type SelectOption,
} from "../../src/components/schedule/ScheduleFormControls";
import {
  AdminReportServiceError,
  getAdminReportClaims,
  getAdminReportSummary,
} from "../../src/services/adminReportService";
import {
  getTherapists,
  TherapistServiceError,
} from "../../src/services/therapistService";
import type {
  AdminReportFilters,
  AdminReportSummary,
  ReportClaimStatus,
} from "../../src/types/adminReport";
import type { ClaimResponse } from "../../src/types/claim";
import { formatScheduleDate } from "../../src/utils/scheduleForm";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;
const MAX_CSV_EXPORT_ROWS = 50_000;
const MAX_PDF_EXPORT_ROWS = 2_000;

class ReportExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportExportError";
  }
}

interface MetricCardProps {
  backgroundColor: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  period: string;
  value: string;
}

interface ReportFilterForm {
  fromDate: Date | null;
  status: ReportClaimStatus;
  therapistId: number | null;
  therapistName: string | null;
  toDate: Date | null;
}

type LoadMode = "initial" | "refresh" | "apply";

const createEmptyFilterForm = (): ReportFilterForm => ({
  fromDate: null,
  status: "all",
  therapistId: null,
  therapistName: null,
  toDate: null,
});

const createEmptyApiFilters = (): AdminReportFilters => ({
  fromDate: null,
  status: "all",
  therapistId: null,
  therapistName: null,
  toDate: null,
});

const statusOptions: SelectOption[] = [
  { id: "all", label: "All Statuses" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const toApiFilters = (
  filters: ReportFilterForm
): AdminReportFilters => ({
  fromDate: filters.fromDate
    ? formatScheduleDate(filters.fromDate)
    : null,
  status: filters.status,
  therapistId: filters.therapistId,
  therapistName: filters.therapistName,
  toDate: filters.toDate ? formatScheduleDate(filters.toDate) : null,
});

const hasFilters = (filters: AdminReportFilters): boolean =>
  Boolean(
    filters.fromDate ||
      filters.toDate ||
      filters.therapistId !== null ||
      filters.status !== "all"
  );

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load report metrics.";
};

const getStorageErrorMessage = (error: unknown): string => {
  const normalizedMessage =
    error instanceof Error ? error.message.toLocaleLowerCase() : "";

  if (
    normalizedMessage.includes("enospc") ||
    normalizedMessage.includes("no space") ||
    normalizedMessage.includes("storage full")
  ) {
    return "There is not enough device storage to create this report.";
  }

  if (
    normalizedMessage.includes("eacces") ||
    normalizedMessage.includes("eperm") ||
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("denied")
  ) {
    return "The app could not access its temporary storage. Check app permissions and try again.";
  }

  return "The report file could not be created in temporary storage.";
};

const getExportErrorMessage = (
  error: unknown,
  format: "CSV" | "PDF"
): string => {
  if (
    error instanceof ReportExportError ||
    error instanceof AdminReportServiceError
  ) {
    return error.message;
  }

  return `The ${format} report could not be generated. Please try again.`;
};

const validateExportSize = (
  rowCount: number,
  format: "CSV" | "PDF"
): void => {
  const maximumRows =
    format === "CSV" ? MAX_CSV_EXPORT_ROWS : MAX_PDF_EXPORT_ROWS;

  if (rowCount > maximumRows) {
    throw new ReportExportError(
      `This report contains ${rowCount.toLocaleString(
        "en-IN"
      )} records. Apply a narrower date or therapist filter to export ${maximumRows.toLocaleString(
        "en-IN"
      )} records or fewer as ${format}.`
    );
  }
};

const deleteFileSafely = (file: File | null): void => {
  if (!file) {
    return;
  }

  try {
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cache cleanup must not replace the original export error.
  }
};

const validateGeneratedFile = (
  file: File,
  format: "CSV" | "PDF"
): void => {
  if (!file.exists || file.size <= 0) {
    throw new ReportExportError(
      `${format} generation completed without creating a valid file.`
    );
  }
};

const ensureSharingAvailable = async (): Promise<void> => {
  let sharingAvailable: boolean;

  try {
    sharingAvailable = await Sharing.isAvailableAsync();
  } catch {
    throw new ReportExportError(
      "The app could not access the system sharing service. Check app permissions and try again."
    );
  }

  if (!sharingAvailable) {
    throw new ReportExportError(
      "File sharing is unavailable on this device. Use a supported mobile device or enable a sharing app."
    );
  }
};

const escapeCsvText = (value: string): string => {
  const formulaSafeValue = /^[\t\r ]*[=+\-@]/.test(value)
    ? `'${value}`
    : value;

  return `"${formulaSafeValue.replace(/"/g, '""')}"`;
};

const buildReportCsv = (claims: ClaimResponse[]): string => {
  const header = [
    "Claim Date",
    "Therapist",
    "Patient Count",
    "Total KM",
    "Travel Total",
    "Daily Allowance",
    "Grand Total",
    "Status",
  ].join(",");
  const rows = claims.map((claim) =>
    [
      escapeCsvText(claim.claim_date),
      escapeCsvText(claim.therapist_name ?? "Not assigned"),
      String(claim.patient_count ?? 0),
      claim.total_km.toFixed(2),
      claim.travel_total.toFixed(2),
      claim.daily_allowance.toFixed(2),
      claim.grand_total.toFixed(2),
      escapeCsvText(claim.status),
    ].join(",")
  );

  return `\uFEFF${[header, ...rows].join("\r\n")}`;
};

const getReportFileName = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `reports_${year}_${month}_${day}.csv`;
};

const getPdfFileName = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `report_${year}_${month}_${day}.pdf`;
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '"': "&quot;",
        "&": "&amp;",
        "'": "&#39;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character
  );

const formatReportDate = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Date not available";
  }

  const [year, month, day] = value
    .split("-")
    .map((part) => Number(part));
  const date = new Date(year, month - 1, day);

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatGeneratedDate = (value: Date): string =>
  `${value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${value.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
  })}`;

const getStatusClass = (status: string): string => {
  switch (status.toLocaleLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "pending":
      return "pending";
    default:
      return "neutral";
  }
};

const buildReportHtml = (
  reportSummary: AdminReportSummary,
  claims: ClaimResponse[],
  filters: AdminReportFilters,
  generatedAt: Date
): string => {
  const totals = claims.reduce(
    (current, claim) => ({
      dailyAllowance:
        current.dailyAllowance + claim.daily_allowance,
      grandTotal: current.grandTotal + claim.grand_total,
      patientCount:
        current.patientCount + (claim.patient_count ?? 0),
      totalKm: current.totalKm + claim.total_km,
      travelTotal: current.travelTotal + claim.travel_total,
    }),
    {
      dailyAllowance: 0,
      grandTotal: 0,
      patientCount: 0,
      totalKm: 0,
      travelTotal: 0,
    }
  );
  const tableRows =
    claims.length > 0
      ? `${claims
          .map(
            (claim) => `
              <tr>
                <td>${escapeHtml(
                  formatReportDate(claim.claim_date)
                )}</td>
                <td>${escapeHtml(
                  claim.therapist_name ?? "Not assigned"
                )}</td>
                <td class="number">${claim.patient_count ?? 0}</td>
                <td class="number">${claim.total_km.toFixed(2)}</td>
                <td class="number">${claim.travel_total.toFixed(
                  2
                )}</td>
                <td class="number">${claim.daily_allowance.toFixed(
                  2
                )}</td>
                <td class="number strong">${claim.grand_total.toFixed(
                  2
                )}</td>
                <td>
                  <span class="status ${getStatusClass(
                    claim.status
                  )}">
                    ${escapeHtml(claim.status.toLocaleUpperCase())}
                  </span>
                </td>
              </tr>
            `
          )
          .join("")}
          <tr class="totals-row">
            <td colspan="2">TOTALS</td>
            <td class="number">${totals.patientCount}</td>
            <td class="number">${totals.totalKm.toFixed(2)}</td>
            <td class="number">${totals.travelTotal.toFixed(2)}</td>
            <td class="number">${totals.dailyAllowance.toFixed(
              2
            )}</td>
            <td class="number">${totals.grandTotal.toFixed(2)}</td>
            <td></td>
          </tr>`
      : `
          <tr>
            <td class="empty-row" colspan="8">
              No claim records match the applied filters.
            </td>
          </tr>
        `;
  const dateRange =
    filters.fromDate || filters.toDate
      ? `${filters.fromDate ?? "Beginning"} to ${
          filters.toDate ?? "Present"
        }`
      : "All dates";
  const therapist = filters.therapistName ?? "All therapists";
  const status =
    filters.status === "all"
      ? "All statuses"
      : filters.status.charAt(0).toLocaleUpperCase() +
        filters.status.slice(1);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <style>
          @page {
            size: A4 landscape;
            margin: ${spacing.s26}px;
          }

          * {
            box-sizing: border-box;
          }

          body {
            background: ${colors.white};
            color: ${colors.textStrong};
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${typography.size.caption}px;
            margin: ${spacing.none};
          }

          .header {
            background: ${colors.primary};
            color: ${colors.white};
            padding: ${spacing.xxlPlus}px ${spacing.xxxl}px;
          }

          .company {
            font-size: ${typography.size.small}px;
            font-weight: ${typography.weight.bold};
            letter-spacing: ${typography.letterSpacing.wide}px;
            margin: ${spacing.none} ${spacing.none} ${spacing.md}px;
            text-transform: uppercase;
          }

          .report-title {
            font-size: ${typography.size.heading}px;
            margin: ${spacing.none};
          }

          .generated {
            color: ${colors.primarySurfaceBright};
            font-size: ${typography.size.tiny}px;
            margin: ${spacing.s7}px ${spacing.none} ${spacing.none};
          }

          .content {
            padding: ${spacing.xlPlus}px ${spacing.xxlPlus}px ${spacing.md}px;
          }

          .filter-bar {
            background: ${colors.neutral100};
            border-left: ${spacing.xs}px solid ${colors.primary};
            color: ${colors.textMutedDark};
            margin-bottom: ${spacing.xl}px;
            padding: ${spacing.mdPlus}px ${spacing.lg}px;
          }

          .filter-label {
            color: ${colors.primaryDark};
            font-weight: ${typography.weight.bold};
          }

          .summary-title,
          .table-title {
            color: ${colors.textPrimary};
            font-size: ${typography.size.smallLarge}px;
            margin: ${spacing.none} ${spacing.none} ${spacing.s9}px;
          }

          .summary-grid {
            display: flex;
            margin: ${spacing.none} -${spacing.xs}px ${spacing.xlPlus}px;
          }

          .summary-card {
            background: ${colors.surfaceMuted};
            border: ${spacing.hairline}px solid ${colors.border};
            border-top: ${spacing.s3}px solid ${colors.primary};
            margin: ${spacing.none} ${spacing.xs}px;
            min-height: ${spacing.s68}px;
            padding: ${spacing.s11}px ${spacing.mdPlus}px;
            width: 20%;
          }

          .summary-value {
            color: ${colors.textPrimary};
            font-size: ${typography.size.title}px;
            font-weight: ${typography.weight.bold};
            margin-bottom: ${spacing.s5}px;
          }

          .summary-label {
            color: ${colors.textMuted};
            font-size: ${typography.size.micro}px;
            font-weight: ${typography.weight.bold};
            text-transform: uppercase;
          }

          table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
          }

          thead {
            display: table-header-group;
          }

          th {
            background: ${colors.primary};
            color: ${colors.white};
            font-size: ${typography.size.micro}px;
            padding: ${spacing.md}px ${spacing.sm}px;
            text-align: left;
          }

          td {
            border-bottom: ${spacing.hairline}px solid ${colors.border};
            color: ${colors.textSecondary};
            font-size: ${typography.size.micro}px;
            overflow-wrap: anywhere;
            padding: ${spacing.md}px ${spacing.sm}px;
            vertical-align: middle;
          }

          tbody tr:nth-child(even) {
            background: ${colors.surfaceMuted};
          }

          tr {
            page-break-inside: avoid;
          }

          .number {
            text-align: right;
          }

          .strong {
            color: ${colors.textPrimary};
            font-weight: ${typography.weight.bold};
          }

          .status {
            border-radius: ${radius.control}px;
            display: inline-block;
            font-size: ${typography.size.nano}px;
            font-weight: ${typography.weight.bold};
            padding: ${spacing.xs}px ${spacing.s7}px;
          }

          .approved {
            background: ${colors.greenSurface};
            color: ${colors.primaryDark};
          }

          .pending {
            background: ${colors.warningSurface};
            color: ${colors.warningDark};
          }

          .rejected {
            background: ${colors.dangerSurfaceStrong};
            color: ${colors.dangerDark};
          }

          .neutral {
            background: ${colors.border};
            color: ${colors.textSecondary};
          }

          .totals-row {
            background: ${colors.primarySurface} !important;
            font-weight: ${typography.weight.bold};
          }

          .totals-row td {
            border-bottom: ${spacing.xxs}px solid ${colors.primary};
            color: ${colors.primaryDeep};
          }

          .empty-row {
            color: ${colors.textMuted};
            padding: ${spacing.xxxl}px;
            text-align: center;
          }

          .footer {
            border-top: ${spacing.hairline}px solid ${colors.border};
            color: ${colors.textMuted};
            font-size: ${typography.size.micro}px;
            margin: ${spacing.xlPlus}px ${spacing.xxlPlus}px ${spacing.none};
            padding: ${spacing.s9}px ${spacing.none};
            text-align: right;
          }
        </style>
      </head>
      <body>
        <header class="header">
          <p class="company">
            Travel Allowance Management System
          </p>
          <h1 class="report-title">Administrative Claims Report</h1>
          <p class="generated">
            Generated on ${escapeHtml(
              formatGeneratedDate(generatedAt)
            )}
          </p>
        </header>

        <main class="content">
          <div class="filter-bar">
            <span class="filter-label">Applied Filters:</span>
            Date: ${escapeHtml(dateRange)} &nbsp; | &nbsp;
            Therapist: ${escapeHtml(therapist)} &nbsp; | &nbsp;
            Claim Status: ${escapeHtml(status)}
          </div>

          <h2 class="summary-title">Operational Summary</h2>
          <section class="summary-grid">
            <div class="summary-card">
              <div class="summary-value">
                ${reportSummary.todaysTreatments}
              </div>
              <div class="summary-label">Today's Treatments</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">
                ${reportSummary.totalKm.toFixed(2)}
              </div>
              <div class="summary-label">Total KM</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">
                ${reportSummary.totalClaims}
              </div>
              <div class="summary-label">Total Claims</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">
                ${reportSummary.pendingClaims}
              </div>
              <div class="summary-label">Pending Claims</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">
                ${reportSummary.completedTreatments}
              </div>
              <div class="summary-label">Completed Treatments</div>
            </div>
          </section>

          <h2 class="table-title">Claim Details</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 11%;">Claim Date</th>
                <th style="width: 18%;">Therapist</th>
                <th style="width: 9%; text-align: right;">
                  Patients
                </th>
                <th style="width: 10%; text-align: right;">
                  Total KM
                </th>
                <th style="width: 13%; text-align: right;">
                  Travel Total
                </th>
                <th style="width: 14%; text-align: right;">
                  Daily Allowance
                </th>
                <th style="width: 13%; text-align: right;">
                  Grand Total
                </th>
                <th style="width: 12%;">Status</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </main>

        <footer class="footer">
          Travel Allowance Management System &nbsp; | &nbsp;
          Confidential administrative report
        </footer>
      </body>
    </html>
  `;
};

const MetricCard = ({
  backgroundColor,
  color,
  icon,
  label,
  period,
  value,
}: MetricCardProps) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor }]}>
      <Ionicons color={color} name={icon} size={22} />
    </View>
    <Text numberOfLines={1} style={styles.metricValue}>
      {value}
    </Text>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricPeriod}>{period}</Text>
  </View>
);

export default function AdminReportsScreen() {
  const [summary, setSummary] =
    useState<AdminReportSummary | null>(null);
  const [draftFilters, setDraftFilters] =
    useState<ReportFilterForm>(createEmptyFilterForm);
  const [appliedFilters, setAppliedFilters] =
    useState<AdminReportFilters>(createEmptyApiFilters);
  const [therapistOptions, setTherapistOptions] = useState<
    SelectOption[]
  >([]);
  const [therapistsLoading, setTherapistsLoading] = useState(true);
  const [therapistError, setTherapistError] = useState<string | null>(
    null
  );
  const [filterError, setFilterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appliedFiltersRef = useRef(appliedFilters);
  const exportInFlightRef = useRef(false);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        (requestError instanceof AdminReportServiceError ||
          requestError instanceof TherapistServiceError) &&
        requestError.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }

      return false;
    },
    []
  );

  const loadReports = useCallback(
    async (
      filters: AdminReportFilters,
      mode: LoadMode
    ): Promise<boolean> => {
      if (mode === "refresh") {
        setRefreshing(true);
      } else if (mode === "apply") {
        setApplying(true);
      } else {
        setLoading(true);
      }

      if (mode === "initial") {
        setError(null);
      }

      try {
        const data = await getAdminReportSummary(filters);
        setSummary(data);
        setError(null);
        return true;
      } catch (loadError) {
        if (await handleSessionExpiry(loadError)) {
          return false;
        }

        const message = getErrorMessage(loadError);

        if (mode === "initial") {
          setError(message);
        } else {
          Alert.alert(
            mode === "refresh"
              ? "Unable to Refresh Reports"
              : "Unable to Apply Report Filters",
            message
          );
        }
        return false;
      } finally {
        setLoading(false);
        setRefreshing(false);
        setApplying(false);
      }
    },
    [handleSessionExpiry]
  );

  useFocusEffect(
    useCallback(() => {
      void loadReports(appliedFiltersRef.current, "initial");
    }, [loadReports])
  );

  const loadTherapists = useCallback(async (): Promise<void> => {
    setTherapistsLoading(true);
    setTherapistError(null);

    try {
      const therapists = await getTherapists();
      setTherapistOptions(
        therapists
          .map((therapist) => ({
            description: therapist.email,
            id: therapist.id,
            label: therapist.username,
          }))
          .sort((first, second) =>
            first.label.localeCompare(second.label)
          )
      );
    } catch (loadError) {
      if (await handleSessionExpiry(loadError)) {
        return;
      }

      setTherapistError(getErrorMessage(loadError));
    } finally {
      setTherapistsLoading(false);
    }
  }, [handleSessionExpiry]);

  useEffect(() => {
    void loadTherapists();
  }, [loadTherapists]);

  const applyFilters = useCallback(async (): Promise<void> => {
    if (
      draftFilters.fromDate &&
      draftFilters.toDate &&
      draftFilters.toDate < draftFilters.fromDate
    ) {
      setFilterError("To Date cannot be before From Date.");
      return;
    }

    setFilterError(null);
    const nextFilters = toApiFilters(draftFilters);
    const applied = await loadReports(nextFilters, "apply");

    if (applied) {
      appliedFiltersRef.current = nextFilters;
      setAppliedFilters(nextFilters);
    }
  }, [draftFilters, loadReports]);

  const resetFilters = useCallback(async (): Promise<void> => {
    const emptyForm = createEmptyFilterForm();
    const emptyFilters = createEmptyApiFilters();
    setDraftFilters(emptyForm);
    setFilterError(null);

    const reset = await loadReports(emptyFilters, "apply");

    if (reset) {
      appliedFiltersRef.current = emptyFilters;
      setAppliedFilters(emptyFilters);
    }
  }, [loadReports]);

  const exportReport = useCallback(async (): Promise<void> => {
    if (exportInFlightRef.current) {
      return;
    }

    exportInFlightRef.current = true;
    setExporting(true);
    let reportFile: File | null = null;

    try {
      await ensureSharingAvailable();

      const claims = await getAdminReportClaims(
        appliedFiltersRef.current
      );
      validateExportSize(claims.length, "CSV");
      const fileName = getReportFileName();
      const csv = buildReportCsv(claims);

      try {
        reportFile = new File(Paths.cache, fileName);
        reportFile.create({ overwrite: true });
        reportFile.write(csv);
        validateGeneratedFile(reportFile, "CSV");
      } catch (fileError) {
        deleteFileSafely(reportFile);

        if (fileError instanceof ReportExportError) {
          throw fileError;
        }

        throw new ReportExportError(
          getStorageErrorMessage(fileError)
        );
      }

      try {
        await Sharing.shareAsync(reportFile.uri, {
          dialogTitle: "Export Claims Report",
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
        });
      } catch {
        throw new ReportExportError(
          "The CSV file was generated, but the system share sheet could not be opened. Check sharing permissions and try again."
        );
      }

      Alert.alert(
        "Report Exported",
        claims.length === 0
          ? `${fileName} was generated with column headers. No claims matched the applied filters.`
          : `${fileName} was generated successfully.`
      );
    } catch (exportError) {
      deleteFileSafely(reportFile);

      if (await handleSessionExpiry(exportError)) {
        return;
      }

      Alert.alert(
        "Unable to Export Report",
        getExportErrorMessage(exportError, "CSV")
      );
    } finally {
      exportInFlightRef.current = false;
      setExporting(false);
    }
  }, [handleSessionExpiry]);

  const exportPdfReport = useCallback(async (): Promise<void> => {
    if (exportInFlightRef.current) {
      return;
    }

    exportInFlightRef.current = true;
    setPdfExporting(true);
    let generatedFile: File | null = null;
    let reportFile: File | null = null;

    try {
      await ensureSharingAvailable();

      const filters = appliedFiltersRef.current;
      const [reportSummary, claims] = await Promise.all([
        getAdminReportSummary(filters),
        getAdminReportClaims(filters),
      ]);
      validateExportSize(claims.length, "PDF");
      const html = buildReportHtml(
        reportSummary,
        claims,
        filters,
        new Date()
      );
      let generatedPdf: Print.FilePrintResult;

      try {
        generatedPdf = await Print.printToFileAsync({
          height: 595,
          html,
          textZoom: 100,
          width: 842,
        });
      } catch {
        throw new ReportExportError(
          "The PDF renderer could not generate this report. Try again or apply narrower filters."
        );
      }

      generatedFile = new File(generatedPdf.uri);
      validateGeneratedFile(generatedFile, "PDF");

      if (generatedPdf.numberOfPages < 1) {
        throw new ReportExportError(
          "PDF generation completed without creating a printable page."
        );
      }

      const fileName = getPdfFileName();
      reportFile = new File(Paths.cache, fileName);

      try {
        if (reportFile.exists) {
          reportFile.delete();
        }

        generatedFile.move(reportFile);
        validateGeneratedFile(reportFile, "PDF");
      } catch (fileError) {
        deleteFileSafely(generatedFile);
        deleteFileSafely(reportFile);

        if (fileError instanceof ReportExportError) {
          throw fileError;
        }

        throw new ReportExportError(
          getStorageErrorMessage(fileError)
        );
      }

      try {
        await Sharing.shareAsync(reportFile.uri, {
          dialogTitle: "Export Administrative Report",
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      } catch {
        throw new ReportExportError(
          "The PDF was generated, but the system share sheet could not be opened. Check sharing permissions and try again."
        );
      }

      Alert.alert(
        "Report Exported",
        claims.length === 0
          ? `${fileName} was generated with an empty claim table because no claims matched the applied filters.`
          : `${fileName} was generated successfully.`
      );
    } catch (exportError) {
      deleteFileSafely(generatedFile);
      deleteFileSafely(reportFile);

      if (await handleSessionExpiry(exportError)) {
        return;
      }

      Alert.alert(
        "Unable to Export PDF",
        getExportErrorMessage(exportError, "PDF")
      );
    } finally {
      exportInFlightRef.current = false;
      setPdfExporting(false);
    }
  }, [handleSessionExpiry]);

  const filtersActive = hasFilters(appliedFilters);
  const filterBusy =
    applying || exporting || loading || pdfExporting || refreshing;
  const exportDisabled = filterBusy || Boolean(error) || !summary;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={() =>
              void loadReports(appliedFiltersRef.current, "refresh")
            }
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Administration</Text>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>
          Treatment, travel, and claims performance
        </Text>

        <View style={styles.filterSection}>
          <View style={styles.filterHeader}>
            <View style={styles.filterHeaderIcon}>
              <Ionicons
                color={PRIMARY}
                name="options-outline"
                size={22}
              />
            </View>
            <View style={styles.filterHeaderText}>
              <Text style={styles.filterTitle}>Report Filters</Text>
              <Text style={styles.filterSubtitle}>
                Refine report metrics by date, therapist, and claim
                status.
              </Text>
            </View>
            {filtersActive ? (
              <View style={styles.activeFilterBadge}>
                <View style={styles.activeFilterDot} />
                <Text style={styles.activeFilterText}>Applied</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.dateFields}>
            <DateTimeField
              label="From Date"
              mode="date"
              onChange={(value) => {
                setDraftFilters((current) => ({
                  ...current,
                  fromDate: value,
                }));
                setFilterError(null);
              }}
              placeholder="Select start date"
              value={draftFilters.fromDate}
            />
            <DateTimeField
              label="To Date"
              minimumDate={draftFilters.fromDate ?? undefined}
              mode="date"
              onChange={(value) => {
                setDraftFilters((current) => ({
                  ...current,
                  toDate: value,
                }));
                setFilterError(null);
              }}
              placeholder="Select end date"
              value={draftFilters.toDate}
            />
          </View>

          {therapistsLoading ? (
            <FilterFieldSkeleton />
          ) : therapistError ? (
            <View style={styles.filterInlineError}>
              <View style={styles.filterInlineErrorText}>
                <Ionicons
                  color={colors.danger}
                  name="alert-circle-outline"
                  size={18}
                />
                <Text style={styles.filterInlineErrorMessage}>
                  {therapistError}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Retry loading therapists"
                accessibilityRole="button"
                activeOpacity={0.82}
                onPress={() => void loadTherapists()}
                style={styles.inlineRetryButton}
              >
                <Ionicons color={PRIMARY} name="refresh" size={17} />
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SearchableSelect
              accessibilityLabel="Select therapist report filter"
              emptyMessage="No therapists found."
              icon="person-outline"
              label="Therapist"
              onSelect={(option) => {
                setDraftFilters((current) => ({
                  ...current,
                  therapistId:
                    typeof option.id === "number"
                      ? option.id
                      : Number(option.id),
                  therapistName: option.label,
                }));
                setFilterError(null);
              }}
              options={therapistOptions}
              placeholder="All therapists"
              searchPlaceholder="Search therapists"
              selectedId={draftFilters.therapistId}
              title="Select Therapist"
            />
          )}

          <SearchableSelect
            accessibilityLabel="Select claim status report filter"
            emptyMessage="No statuses found."
            icon="checkmark-circle-outline"
            label="Claim Status"
            onSelect={(option) => {
              setDraftFilters((current) => ({
                ...current,
                status: option.id as ReportClaimStatus,
              }));
              setFilterError(null);
            }}
            options={statusOptions}
            placeholder="All statuses"
            searchPlaceholder="Search statuses"
            selectedId={draftFilters.status}
            title="Select Claim Status"
          />

          {filterError ? (
            <View style={styles.filterError}>
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={17}
              />
              <Text style={styles.filterErrorText}>{filterError}</Text>
            </View>
          ) : null}

          <View style={styles.filterActions}>
            <TouchableOpacity
              accessibilityLabel="Reset report filters"
              accessibilityRole="button"
              activeOpacity={0.82}
              disabled={filterBusy}
              onPress={() => void resetFilters()}
              style={[
                styles.resetButton,
                filterBusy ? styles.disabledButton : null,
              ]}
            >
              <Ionicons color={PRIMARY} name="refresh" size={18} />
              <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Apply report filters"
              accessibilityRole="button"
              activeOpacity={0.82}
              disabled={filterBusy}
              onPress={() => void applyFilters()}
              style={[
                styles.applyButton,
                filterBusy ? styles.disabledButton : null,
              ]}
            >
              {applying ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Ionicons color={colors.surface} name="funnel" size={18} />
              )}
              <Text style={styles.applyButtonText}>
                {applying ? "Applying..." : "Apply Filters"}
              </Text>
            </TouchableOpacity>
          </View>

          {appConfig.features.reportExports ? (
            <View style={styles.exportActions}>
              <TouchableOpacity
                accessibilityLabel="Export filtered report as CSV"
                accessibilityRole="button"
                accessibilityState={{
                  busy: exporting,
                  disabled: exportDisabled,
                }}
                activeOpacity={0.82}
                disabled={exportDisabled}
                onPress={() => void exportReport()}
                style={[
                  styles.exportButton,
                  exportDisabled ? styles.disabledButton : null,
                ]}
              >
                {exporting ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <Ionicons
                    color={colors.surface}
                    name="download-outline"
                    size={18}
                  />
                )}
                <Text style={styles.exportButtonText}>
                  {exporting ? "Preparing..." : "Export CSV"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityLabel="Export filtered report as PDF"
                accessibilityRole="button"
                accessibilityState={{
                  busy: pdfExporting,
                  disabled: exportDisabled,
                }}
                activeOpacity={0.82}
                disabled={exportDisabled}
                onPress={() => void exportPdfReport()}
                style={[
                  styles.exportButton,
                  styles.pdfExportButton,
                  exportDisabled ? styles.disabledButton : null,
                ]}
              >
                {pdfExporting ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <Ionicons
                    color={colors.surface}
                    name="document-text-outline"
                    size={18}
                  />
                )}
                <Text style={styles.exportButtonText}>
                  {pdfExporting ? "Preparing..." : "Export PDF"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {loading ? (
          <ReportsSkeleton />
        ) : error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={26}
              />
            </View>
            <Text style={styles.errorTitle}>Reports unavailable</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() =>
                void loadReports(
                  appliedFiltersRef.current,
                  "initial"
                )
              }
              style={styles.retryButton}
            >
              <Ionicons color={colors.surface} name="refresh" size={18} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : summary ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Operational Summary</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>
                  {filtersActive ? "Filtered" : "Current"}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <MetricCard
                backgroundColor={colors.blueSurface}
                color={colors.blueDark}
                icon="calendar-outline"
                label="Today's Treatments"
                period="Scheduled today"
                value={String(summary.todaysTreatments)}
              />
              <MetricCard
                backgroundColor={colors.tealSurface}
                color={colors.teal}
                icon="navigate-outline"
                label="Total KM"
                period="All travel entries"
                value={summary.totalKm.toFixed(2)}
              />
              <MetricCard
                backgroundColor={colors.purpleSurface}
                color={colors.purple}
                icon="receipt-outline"
                label="Total Claims"
                period="All claim records"
                value={String(summary.totalClaims)}
              />
              <MetricCard
                backgroundColor={colors.warningSurface}
                color={colors.warning}
                icon="time-outline"
                label="Pending Claims"
                period="Awaiting review"
                value={String(summary.pendingClaims)}
              />
              <MetricCard
                backgroundColor={colors.greenSurface}
                color={colors.greenDark}
                icon="checkmark-done-outline"
                label="Completed Treatments"
                period="All completed records"
                value={String(summary.completedTreatments)}
              />
            </View>
          </>
        ) : (
          <View style={styles.stateContainer}>
            <Ionicons
              color={colors.textSubtle}
              name="bar-chart-outline"
              size={38}
            />
            <Text style={styles.stateText}>
              Report metrics are not available.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xlPlus,
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
  filterSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xxxl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  filterHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    marginBottom: spacing.xlPlus,
  },
  filterHeaderIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  filterHeaderText: {
    flex: 1,
    marginLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  filterTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  filterSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.body,
    marginTop: spacing.s3,
  },
  activeFilterBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.s5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeFilterDot: {
    backgroundColor: colors.green,
    borderRadius: radius.s3,
    height: 6,
    width: 6,
  },
  activeFilterText: {
    color: colors.primaryDark,
    fontSize: typography.size.tiny,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  dateFields: {
    gap: spacing.xxs,
  },
  filterInlineError: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  filterInlineErrorText: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  filterInlineErrorMessage: {
    color: colors.dangerDark,
    flex: 1,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.body,
  },
  inlineRetryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.s5,
    marginTop: spacing.s9,
    minHeight: 32,
    paddingHorizontal: spacing.xxs,
  },
  inlineRetryText: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  filterError: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lgPlus,
    padding: spacing.mdPlus,
  },
  filterErrorText: {
    color: colors.dangerDark,
    flex: 1,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
  },
  filterActions: {
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.xxs,
  },
  resetButton: {
    alignItems: "center",
    borderColor: PRIMARY,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.s7,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.mdPlus,
  },
  resetButtonText: {
    color: PRIMARY,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  applyButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.s7,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.mdPlus,
  },
  applyButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  exportActions: {
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.lg,
  },
  exportButton: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.mdPlus,
  },
  pdfExportButton: {
    backgroundColor: colors.teal,
  },
  exportButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  stateContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 360,
    paddingHorizontal: spacing.xxxl,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.s13,
    textAlign: "center",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    marginTop: spacing.s26,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  liveBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.s9,
    paddingVertical: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    height: 7,
    width: 7,
  },
  liveText: {
    color: colors.primaryDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 166,
    padding: spacing.s15,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  metricIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lgPlus,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
    lineHeight: typography.lineHeight.body,
    marginTop: spacing.s5,
  },
  metricPeriod: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.section,
    padding: spacing.xxxl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xlPlus,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
