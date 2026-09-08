import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { router, useFocusEffect } from "expo-router";
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
import { LocationExceptionReview } from "../../src/components/admin/LocationExceptionReview";
import { EarlyWorkdayReview } from "../../src/components/admin/EarlyWorkdayReview";
import { ManualTravelReview } from "../../src/components/admin/ManualTravelReview";
import { ManualDoctorExpenseReview } from "../../src/components/admin/ManualDoctorExpenseReview";
import {
  FilterFieldSkeleton,
} from "../../src/components/skeletons/ScreenSkeletons";
import {
  ReportDashboard,
  ReportDashboardSkeleton,
  ReportExportPanel,
} from "../../src/components/reports/ReportDashboard";
import {
  DateTimeField,
  SearchableSelect,
  type SelectOption,
} from "../../src/components/schedule/ScheduleFormControls";
import {
  AdminReportServiceError,
  downloadAdminClaimRegister,
  getAdminReportExportEvents,
  getAdminReportExportHistory,
  getReportOperationsHealth,
  getAdminReportSummary,
  previewAdminClaimRegister,
  type AdminClaimRegisterPreview,
  type AdminReportExportEvent,
  type AdminReportExportHistoryItem,
  type ReportOperationsHealth,
} from "../../src/services/adminReportService";
import {
  AdminScheduleServiceError,
  getAdminScheduleFormOptions,
} from "../../src/services/adminScheduleService";
import {
  deliverReportFile,
  type ReportDeliveryMode,
} from "../../src/services/reportFileDelivery";
import type {
  AdminReportFilters,
  AdminReportSummary,
  ReportClaimStatus,
} from "../../src/types/adminReport";
import { formatScheduleDate } from "../../src/utils/scheduleForm";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;
const formatReportAmount = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);

class ReportExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportExportError";
  }
}

interface ReportFilterForm {
  fromDate: Date | null;
  status: ReportClaimStatus;
  therapistId: number | null;
  therapistName: string | null;
  toDate: Date | null;
}

type LoadMode = "initial" | "refresh" | "apply";
type OrganizationReportType =
  | "consolidated_claims"
  | "organization_attendance"
  | "organization_expenses"
  | "organization_clinical_activity"
  | "organization_exceptions"
  | "organization_performance";
type OrganizationReportStatus =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "active"
  | "completed"
  | "ended_early"
  | "draft"
  | "submitted"
  | "scheduled"
  | "in_progress"
  | "missed"
  | "cancelled"
  | "open"
  | "needs_review"
  | "needs_correction"
  | "manual";

const claimExportStatuses: readonly OrganizationReportStatus[] = [
  "all",
  "pending",
  "approved",
  "rejected",
];
const attendanceExportStatuses: readonly OrganizationReportStatus[] = [
  "all",
  "active",
  "completed",
  "ended_early",
];
const expenseExportStatuses: readonly OrganizationReportStatus[] = [
  "all",
  "draft",
  "submitted",
];
const clinicalExportStatuses: readonly OrganizationReportStatus[] = [
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
const exceptionExportStatuses: readonly OrganizationReportStatus[] = [
  "all",
  "open",
  "needs_review",
  "needs_correction",
  "missed",
  "manual",
];

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

const isReportClaimStatus = (
  value: SelectOption["id"]
): value is ReportClaimStatus =>
  value === "all" ||
  value === "pending" ||
  value === "approved" ||
  value === "rejected";

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
  format: "CSV" | "PDF" | "Excel"
): string => {
  if (
    error instanceof ReportExportError ||
    error instanceof AdminReportServiceError
  ) {
    return error.message;
  }

  return `The ${format} report could not be generated. Please try again.`;
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
  format: "CSV" | "PDF" | "Excel"
): void => {
  if (!file.exists || file.size <= 0) {
    throw new ReportExportError(
      `${format} generation completed without creating a valid file.`
    );
  }
};

const chooseReportDelivery = (): Promise<ReportDeliveryMode | null> =>
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
  const [doctorOptions, setDoctorOptions] = useState<SelectOption[]>([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(true);
  const [staffOptionsError, setStaffOptionsError] = useState<string | null>(
    null
  );
  const [filterError, setFilterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exportReportType, setExportReportType] =
    useState<OrganizationReportType>("consolidated_claims");
  const [exportStatus, setExportStatus] =
    useState<OrganizationReportStatus>("all");
  const [exportRole, setExportRole] =
    useState<"all" | "therapist" | "doctor">("all");
  const [exportStaffId, setExportStaffId] = useState<number | null>(null);
  const [exportPreview, setExportPreview] =
    useState<AdminClaimRegisterPreview | null>(null);
  const [exportHistory, setExportHistory] = useState<
    AdminReportExportHistoryItem[]
  >([]);
  const [exportFailures, setExportFailures] = useState<
    AdminReportExportEvent[]
  >([]);
  const [operationsHealth, setOperationsHealth] =
    useState<ReportOperationsHealth | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySharing, setHistorySharing] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appliedFiltersRef = useRef(appliedFilters);
  const exportInFlightRef = useRef(false);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        (requestError instanceof AdminReportServiceError ||
          requestError instanceof AdminScheduleServiceError) &&
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

  const clearExpiredPreview = useCallback((requestError: unknown) => {
    if (
      requestError instanceof AdminReportServiceError &&
      requestError.status === 410
    ) {
      setExportPreview(null);
    }
  }, []);

  const loadExportHistory = useCallback(async (): Promise<void> => {
    setHistoryLoading(true);
    try {
      const [historyResult, eventsResult, healthResult] = await Promise.allSettled([
        getAdminReportExportHistory(),
        getAdminReportExportEvents(),
        getReportOperationsHealth(),
      ]);
      const rejected = [historyResult, eventsResult, healthResult].find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (rejected && await handleSessionExpiry(rejected.reason)) return;
      setExportHistory(
        historyResult.status === "fulfilled" ? historyResult.value : []
      );
      setExportFailures(
        eventsResult.status === "fulfilled"
          ? eventsResult.value.filter((item) => item.outcome === "failure")
          : []
      );
      setOperationsHealth(
        healthResult.status === "fulfilled" ? healthResult.value : null
      );
    } catch (historyError) {
      if (await handleSessionExpiry(historyError)) return;
      setExportHistory([]);
      setExportFailures([]);
      setOperationsHealth(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [handleSessionExpiry]);

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
          .sort((first, second) =>
            first.label.localeCompare(second.label)
          )
      );
      setDoctorOptions(
        options.doctors
          .map((doctor) => ({
            description: doctor.specialization || undefined,
            id: doctor.id,
            label: doctor.name,
          }))
          .sort((first, second) =>
            first.label.localeCompare(second.label)
          )
      );
    } catch (loadError) {
      if (await handleSessionExpiry(loadError)) {
        return;
      }

      setStaffOptionsError(getErrorMessage(loadError));
    } finally {
      setStaffOptionsLoading(false);
    }
  }, [handleSessionExpiry]);

  useEffect(() => {
    void loadStaffOptions();
  }, [loadStaffOptions]);

  useEffect(() => {
    void loadExportHistory();
  }, [loadExportHistory]);

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
      setExportPreview(null);
      setFiltersExpanded(false);
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
      setExportPreview(null);
      setFiltersExpanded(false);
    }
  }, [loadReports]);

  const previewExport = useCallback(async (): Promise<void> => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setPreviewing(true);
    try {
      const preview = await previewAdminClaimRegister(
        appliedFiltersRef.current,
        exportReportType,
        exportStatus,
        exportRole,
        exportStaffId
      );
      setExportPreview(preview);
      if (preview.rowCount === 0) {
        Alert.alert(
          "No Records to Export",
          preview.warnings[0] ??
            "No records match the currently applied export filters."
        );
      }
    } catch (previewError) {
      if (await handleSessionExpiry(previewError)) return;
      Alert.alert(
        "Unable to Preview Export",
        getErrorMessage(previewError)
      );
    } finally {
      exportInFlightRef.current = false;
      setPreviewing(false);
    }
  }, [
    exportReportType,
    exportRole,
    exportStaffId,
    exportStatus,
    handleSessionExpiry,
  ]);

  const exportReport = useCallback(async (): Promise<void> => {
    if (exportInFlightRef.current || !exportPreview) {
      return;
    }

    const deliveryMode = await chooseReportDelivery();
    if (!deliveryMode) return;
    exportInFlightRef.current = true;
    setExporting(true);
    let reportFile: File | null = null;

    try {
      const report = await downloadAdminClaimRegister(
        exportPreview.snapshotId
      );

      try {
        reportFile = new File(Paths.cache, report.fileName);
        reportFile.create({ overwrite: true });
        reportFile.write(report.content);
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

      await deliverReportFile(deliveryMode, {
        dialogTitle: "Share Organization Report",
        file: reportFile,
        fileName: report.fileName,
        mimeType: "text/csv",
      });
      await loadExportHistory();

      Alert.alert(
        "Report Exported",
        report.rowCount === 0
          ? `${report.fileName} was generated with column headers. No records matched the applied filters.`
          : exportReportType === "consolidated_claims"
            ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist and doctor claim rows totaling ${formatReportAmount(exportPreview.totalAmount)}.`
            : exportReportType === "organization_attendance"
              ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist and doctor workdays totaling ${Number(exportPreview.summary.total_work_minutes ?? 0).toLocaleString("en-IN")} worked minutes.`
              : exportReportType === "organization_expenses"
                ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist travel and doctor expense rows totaling ${formatReportAmount(exportPreview.totalAmount)}.`
                : exportReportType === "organization_clinical_activity"
                  ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} clinical activity rows totaling ${Number(exportPreview.summary.total_clinical_minutes ?? 0).toLocaleString("en-IN")} clinical minutes.`
                  : exportReportType === "organization_performance"
                    ? `${report.fileName} summarizes ${report.rowCount.toLocaleString("en-IN")} staff member${report.rowCount === 1 ? "" : "s"}, ${Number(exportPreview.summary.total_workdays ?? 0).toLocaleString("en-IN")} workdays, and ${Number(exportPreview.summary.completed_clinical_activities ?? 0).toLocaleString("en-IN")} completed activities.`
                    : `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} operational exceptions, including ${Number(exportPreview.summary.overdue_exceptions ?? 0).toLocaleString("en-IN")} overdue.`
      );
    } catch (exportError) {
      deleteFileSafely(reportFile);
      clearExpiredPreview(exportError);

      if (await handleSessionExpiry(exportError)) {
        return;
      }

      Alert.alert(
        "Unable to Export Report",
        getExportErrorMessage(exportError, "CSV")
      );
    } finally {
      deleteFileSafely(reportFile);
      exportInFlightRef.current = false;
      setExporting(false);
    }
  }, [clearExpiredPreview, exportPreview, exportReportType, handleSessionExpiry, loadExportHistory]);

  const exportPdfReport = useCallback(async (): Promise<void> => {
    if (exportInFlightRef.current || !exportPreview) {
      return;
    }

    const deliveryMode = await chooseReportDelivery();
    if (!deliveryMode) return;
    exportInFlightRef.current = true;
    setPdfExporting(true);
    let reportFile: File | null = null;

    try {
      const report = await downloadAdminClaimRegister(
        exportPreview.snapshotId,
        "pdf"
      );

      try {
        reportFile = new File(Paths.cache, report.fileName);
        reportFile.create({ overwrite: true });
        reportFile.write(report.content);
        validateGeneratedFile(reportFile, "PDF");
      } catch (fileError) {
        deleteFileSafely(reportFile);
        throw new ReportExportError(
          getStorageErrorMessage(fileError)
        );
      }

      await deliverReportFile(deliveryMode, {
        dialogTitle: "Share Organization Report",
        file: reportFile,
        fileName: report.fileName,
        mimeType: report.mimeType,
      });
      await loadExportHistory();

      Alert.alert(
        deliveryMode === "save" ? "Report Saved" : "Report Shared",
        report.rowCount === 0
          ? `${report.fileName} was generated with an empty table because no records matched the applied filters.`
          : exportReportType === "consolidated_claims"
            ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist and doctor claim rows totaling ${formatReportAmount(exportPreview.totalAmount)}.`
            : exportReportType === "organization_attendance"
              ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist and doctor workdays totaling ${Number(exportPreview.summary.total_work_minutes ?? 0).toLocaleString("en-IN")} worked minutes.`
              : exportReportType === "organization_expenses"
                ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist travel and doctor expense rows totaling ${formatReportAmount(exportPreview.totalAmount)}.`
                : exportReportType === "organization_clinical_activity"
                  ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} clinical activity rows totaling ${Number(exportPreview.summary.total_clinical_minutes ?? 0).toLocaleString("en-IN")} clinical minutes.`
                  : exportReportType === "organization_performance"
                    ? `${report.fileName} summarizes ${report.rowCount.toLocaleString("en-IN")} staff member${report.rowCount === 1 ? "" : "s"}, ${Number(exportPreview.summary.total_workdays ?? 0).toLocaleString("en-IN")} workdays, and ${Number(exportPreview.summary.completed_clinical_activities ?? 0).toLocaleString("en-IN")} completed activities.`
                    : `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} operational exceptions, including ${Number(exportPreview.summary.overdue_exceptions ?? 0).toLocaleString("en-IN")} overdue.`
      );
    } catch (exportError) {
      deleteFileSafely(reportFile);
      clearExpiredPreview(exportError);

      if (await handleSessionExpiry(exportError)) {
        return;
      }

      Alert.alert(
        "Unable to Export PDF",
        getExportErrorMessage(exportError, "PDF")
      );
    } finally {
      deleteFileSafely(reportFile);
      exportInFlightRef.current = false;
      setPdfExporting(false);
    }
  }, [clearExpiredPreview, exportPreview, exportReportType, handleSessionExpiry, loadExportHistory]);

  const exportExcelReport = useCallback(async (): Promise<void> => {
    if (exportInFlightRef.current || !exportPreview) {
      return;
    }

    const deliveryMode = await chooseReportDelivery();
    if (!deliveryMode) return;
    exportInFlightRef.current = true;
    setExcelExporting(true);
    let reportFile: File | null = null;

    try {
      const report = await downloadAdminClaimRegister(
        exportPreview.snapshotId,
        "xlsx"
      );

      try {
        reportFile = new File(Paths.cache, report.fileName);
        reportFile.create({ overwrite: true });
        reportFile.write(report.content);
        validateGeneratedFile(reportFile, "Excel");
      } catch (fileError) {
        deleteFileSafely(reportFile);
        throw new ReportExportError(getStorageErrorMessage(fileError));
      }

      await deliverReportFile(deliveryMode, {
        dialogTitle: "Share Organization Report",
        file: reportFile,
        fileName: report.fileName,
        mimeType: report.mimeType,
      });
      await loadExportHistory();
      Alert.alert(
        deliveryMode === "save" ? "Report Saved" : "Report Shared",
        exportReportType === "consolidated_claims"
          ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist and doctor claim rows totaling ${formatReportAmount(exportPreview.totalAmount)}.`
          : exportReportType === "organization_attendance"
            ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist and doctor workdays totaling ${Number(exportPreview.summary.total_work_minutes ?? 0).toLocaleString("en-IN")} worked minutes.`
            : exportReportType === "organization_expenses"
              ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} therapist travel and doctor expense rows totaling ${formatReportAmount(exportPreview.totalAmount)}.`
              : exportReportType === "organization_clinical_activity"
                ? `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} clinical activity rows totaling ${Number(exportPreview.summary.total_clinical_minutes ?? 0).toLocaleString("en-IN")} clinical minutes.`
                : exportReportType === "organization_performance"
                  ? `${report.fileName} summarizes ${report.rowCount.toLocaleString("en-IN")} staff member${report.rowCount === 1 ? "" : "s"}, ${Number(exportPreview.summary.total_workdays ?? 0).toLocaleString("en-IN")} workdays, and ${Number(exportPreview.summary.completed_clinical_activities ?? 0).toLocaleString("en-IN")} completed activities.`
                  : `${report.fileName} contains ${report.rowCount.toLocaleString("en-IN")} operational exceptions, including ${Number(exportPreview.summary.overdue_exceptions ?? 0).toLocaleString("en-IN")} overdue.`
      );
    } catch (exportError) {
      deleteFileSafely(reportFile);
      clearExpiredPreview(exportError);
      if (await handleSessionExpiry(exportError)) {
        return;
      }
      Alert.alert(
        "Unable to Export Excel",
        getExportErrorMessage(exportError, "Excel")
      );
    } finally {
      deleteFileSafely(reportFile);
      exportInFlightRef.current = false;
      setExcelExporting(false);
    }
  }, [clearExpiredPreview, exportPreview, exportReportType, handleSessionExpiry, loadExportHistory]);

  const shareHistoricalExport = useCallback(
    async (item: AdminReportExportHistoryItem): Promise<void> => {
      if (exportInFlightRef.current) return;
      const deliveryMode = await chooseReportDelivery();
      if (!deliveryMode) return;
      exportInFlightRef.current = true;
      setHistorySharing(item.id);
      let reportFile: File | null = null;
      try {
        const report = await downloadAdminClaimRegister(
          item.snapshot_id,
          item.format
        );
        reportFile = new File(Paths.cache, report.fileName);
        reportFile.create({ overwrite: true });
        reportFile.write(report.content);
        const label = item.format === "xlsx" ? "Excel" : item.format.toUpperCase();
        validateGeneratedFile(reportFile, label as "CSV" | "PDF" | "Excel");
        await deliverReportFile(deliveryMode, {
          dialogTitle: "Share Organization Report Again",
          file: reportFile,
          fileName: report.fileName,
          mimeType: report.mimeType,
        });
        await loadExportHistory();
      } catch (shareError) {
        deleteFileSafely(reportFile);
        if (await handleSessionExpiry(shareError)) return;
        Alert.alert(
          `Unable to ${deliveryMode === "save" ? "Save" : "Share"} Report`,
          getErrorMessage(shareError)
        );
        await loadExportHistory();
      } finally {
        deleteFileSafely(reportFile);
        exportInFlightRef.current = false;
        setHistorySharing(null);
      }
    },
    [handleSessionExpiry, loadExportHistory]
  );

  const filtersActive = hasFilters(appliedFilters);
  const filterBusy =
    applying ||
    excelExporting ||
    exporting ||
    loading ||
    pdfExporting ||
    previewing ||
    refreshing ||
    historySharing !== null;
  const exportDisabled = filterBusy || Boolean(error) || !summary;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={() =>
              void (async () => {
                setExportPreview(null);
                await loadReports(
                  appliedFiltersRef.current,
                  "refresh"
                );
              })()
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

        <TouchableOpacity
          accessibilityHint="Opens privacy-safe operational change history"
          accessibilityLabel="View operational audit log"
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => router.push("/(admin)/audit-log")}
          style={styles.auditLogButton}
        >
          <View style={styles.auditLogIcon}>
            <Ionicons color={colors.blueDark} name="shield-checkmark-outline" size={21} />
          </View>
          <View style={styles.auditLogText}>
            <Text style={styles.auditLogTitle}>Operational Audit Log</Text>
            <Text style={styles.auditLogSubtitle}>Review who changed critical records and when</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityHint="Opens the assignable cross-domain exception queue"
          accessibilityLabel="View operational follow-ups"
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => router.push("/(admin)/follow-ups" as never)}
          style={styles.auditLogButton}
        >
          <View style={styles.auditLogIcon}>
            <Ionicons color={colors.blueDark} name="checkmark-done-outline" size={21} />
          </View>
          <View style={styles.auditLogText}>
            <Text style={styles.auditLogTitle}>Operational Follow-ups</Text>
            <Text style={styles.auditLogSubtitle}>Assign, track, and resolve cross-domain exceptions</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityHint="Opens the travel expense report for therapists and doctors"
          accessibilityLabel="View travel expense report"
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => router.push("/(admin)/travel-expense-report" as never)}
          style={styles.auditLogButton}
        >
          <View style={styles.auditLogIcon}>
            <Ionicons color={colors.blueDark} name="car-outline" size={21} />
          </View>
          <View style={styles.auditLogText}>
            <Text style={styles.auditLogTitle}>Travel Expense Report</Text>
            <Text style={styles.auditLogSubtitle}>Generate travel expense reports by person or for everyone</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={20} />
        </TouchableOpacity>

        <LocationExceptionReview />
        <EarlyWorkdayReview />
        <ManualTravelReview />
        <ManualDoctorExpenseReview />

        <View style={styles.filterSection}>
          <TouchableOpacity
            accessibilityLabel={
              filtersExpanded
                ? "Collapse report filters"
                : "Expand report filters"
            }
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersExpanded }}
            activeOpacity={0.78}
            onPress={() =>
              setFiltersExpanded((current) => !current)
            }
            style={styles.filterHeader}
          >
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
            <Ionicons
              color={colors.textMuted}
              name={filtersExpanded ? "chevron-up" : "chevron-down"}
              size={20}
            />
          </TouchableOpacity>

          {filtersExpanded ? (
            <View style={styles.filterBody}>
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

              {staffOptionsLoading ? (
                <FilterFieldSkeleton />
              ) : staffOptionsError ? (
                <View style={styles.filterInlineError}>
                  <View style={styles.filterInlineErrorText}>
                    <Ionicons
                      color={colors.danger}
                      name="alert-circle-outline"
                      size={18}
                    />
                    <Text style={styles.filterInlineErrorMessage}>
                      {staffOptionsError}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityLabel="Retry loading therapists"
                    accessibilityRole="button"
                    activeOpacity={0.82}
                    onPress={() => void loadStaffOptions()}
                    style={styles.inlineRetryButton}
                  >
                    <Ionicons
                      color={PRIMARY}
                      name="refresh"
                      size={17}
                    />
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
                  const nextStatus = option.id;
                  if (!isReportClaimStatus(nextStatus)) {
                    return;
                  }
                  setDraftFilters((current) => ({
                    ...current,
                    status: nextStatus,
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
                  <Text style={styles.filterErrorText}>
                    {filterError}
                  </Text>
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
                  <Ionicons
                    color={PRIMARY}
                    name="refresh"
                    size={18}
                  />
                  <Text style={styles.resetButtonText}>
                    Reset Filters
                  </Text>
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
                    <ActivityIndicator
                      color={colors.surface}
                      size="small"
                    />
                  ) : (
                    <Ionicons
                      color={colors.surface}
                      name="funnel"
                      size={18}
                    />
                  )}
                  <Text style={styles.applyButtonText}>
                    {applying ? "Applying..." : "Apply Filters"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        {loading ? (
          <ReportDashboardSkeleton />
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
            <ReportDashboard
              filtersActive={filtersActive}
              onClearFilters={() => void resetFilters()}
              summary={summary}
            />
            {appConfig.features.reportExports ? (
              <>
                <View style={styles.exportSelectorPanel}>
                  <Text style={styles.exportSelectorTitle}>Export report</Text>
                  <Text style={styles.exportSelectorLabel}>Report type</Text>
                  <View style={styles.exportSelectorOptions}>
                    {(["consolidated_claims", "organization_attendance", "organization_expenses", "organization_clinical_activity", "organization_performance", "organization_exceptions"] as const).map((value) => (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ selected: exportReportType === value }}
                        disabled={filterBusy}
                        key={value}
                        onPress={() => {
                          setExportReportType(value);
                          setExportStatus("all");
                          setExportPreview(null);
                        }}
                        style={[
                          styles.exportSelectorChip,
                          exportReportType === value && styles.exportSelectorChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.exportSelectorChipText,
                            exportReportType === value && styles.exportSelectorChipTextSelected,
                          ]}
                        >
                          {value === "consolidated_claims"
                            ? "Claims"
                            : value === "organization_attendance"
                              ? "Attendance"
                              : value === "organization_expenses"
                                ? "Travel & expenses"
                                : value === "organization_clinical_activity"
                                  ? "Clinical activity"
                                  : value === "organization_performance"
                                    ? "Performance"
                                    : "Exceptions"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.exportSelectorLabel}>Staff role</Text>
                  <View style={styles.exportSelectorOptions}>
                    {(["all", "therapist", "doctor"] as const).map((value) => {
                      return (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityState={{ selected: exportRole === value }}
                          disabled={filterBusy}
                          key={value}
                          onPress={() => {
                            setExportRole(value);
                            setExportStaffId(null);
                            setExportPreview(null);
                          }}
                          style={[
                            styles.exportSelectorChip,
                            exportRole === value && styles.exportSelectorChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.exportSelectorChipText,
                              exportRole === value && styles.exportSelectorChipTextSelected,
                            ]}
                          >
                            {value === "all"
                              ? "Doctors and therapists"
                              : value === "therapist"
                                ? "Therapists"
                                : "Doctors"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {exportRole !== "all" ? (
                    <SearchableSelect
                      accessibilityLabel={`Select ${exportRole} export filter`}
                      emptyMessage={`No ${exportRole}s found.`}
                      icon={exportRole === "doctor" ? "medkit-outline" : "person-outline"}
                      label={exportRole === "doctor" ? "Doctor" : "Therapist"}
                      onSelect={(option) => {
                        setExportStaffId(
                          option.id === "all"
                            ? null
                            : typeof option.id === "number"
                              ? option.id
                              : Number(option.id)
                        );
                        setExportPreview(null);
                      }}
                      options={[
                        {
                          id: "all",
                          label: exportRole === "doctor" ? "All doctors" : "All therapists",
                        },
                        ...(exportRole === "doctor" ? doctorOptions : therapistOptions),
                      ]}
                      placeholder={exportRole === "doctor" ? "All doctors" : "All therapists"}
                      searchPlaceholder={`Search ${exportRole}s`}
                      selectedId={exportStaffId ?? "all"}
                      title={exportRole === "doctor" ? "Select Doctor" : "Select Therapist"}
                    />
                  ) : null}
                  <Text style={styles.exportSelectorLabel}>Status</Text>
                  <View style={styles.exportSelectorOptions}>
                    {(exportReportType === "consolidated_claims"
                      ? claimExportStatuses
                      : exportReportType === "organization_attendance"
                        ? attendanceExportStatuses
                        : exportReportType === "organization_expenses"
                          ? expenseExportStatuses
                          : exportReportType === "organization_clinical_activity"
                            ? clinicalExportStatuses
                            : exportReportType === "organization_performance"
                              ? (["all"] as const)
                              : exceptionExportStatuses
                    ).map((value) => (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ selected: exportStatus === value }}
                        disabled={filterBusy}
                        key={value}
                        onPress={() => {
                          setExportStatus(value);
                          setExportPreview(null);
                        }}
                        style={[
                          styles.exportSelectorChip,
                          exportStatus === value && styles.exportSelectorChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.exportSelectorChipText,
                            exportStatus === value && styles.exportSelectorChipTextSelected,
                          ]}
                        >
                          {value === "ended_early"
                            ? "Ended early"
                            : value === "completed"
                              ? "Completed normally"
                              : value[0].toUpperCase() + value.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <ReportExportPanel
                  csvExporting={exporting}
                  disabled={exportDisabled}
                  excelExporting={excelExporting}
                  onExportCsv={() => void exportReport()}
                  onExportExcel={() => void exportExcelReport()}
                  onExportPdf={() => void exportPdfReport()}
                  onPreview={() => void previewExport()}
                  pdfExporting={pdfExporting}
                  preview={exportPreview}
                  previewing={previewing}
                  reportType={exportReportType}
                />
                <View style={styles.exportHistoryPanel}>
                  {operationsHealth ? (
                    <View
                      accessibilityLiveRegion="polite"
                      style={[
                        styles.operationsHealth,
                        operationsHealth.status === "healthy"
                          ? styles.operationsHealthy
                          : styles.operationsDegraded,
                      ]}
                    >
                      <Text style={styles.operationsHealthTitle}>
                        Export operations: {operationsHealth.status}
                      </Text>
                      <Text style={styles.operationsHealthText}>
                        {operationsHealth.queued_jobs} queued Â· {operationsHealth.processing_jobs} processing Â· {operationsHealth.stale_processing_jobs} stale Â· {operationsHealth.failed_jobs_last_24h} failed in 24h Â· {operationsHealth.expired_artifacts_pending_cleanup} awaiting cleanup Â· storage {operationsHealth.storage_backend.toUpperCase()} {operationsHealth.external_storage_configured ? "configured" : "needs configuration"}.
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.exportHistoryTitle}>
                    Recent organization exports
                  </Text>
                  {historyLoading ? (
                    <ActivityIndicator
                      color={colors.primary}
                      style={styles.exportHistoryLoading}
                    />
                  ) : exportHistory.length === 0 ? (
                    <Text style={styles.exportHistoryEmpty}>
                      Generated organization reports will appear here.
                    </Text>
                  ) : (
                    exportHistory.map((item) => {
                      const expired =
                        new Date(item.snapshot_expires_at) <= new Date();
                      return (
                        <View key={item.id} style={styles.exportHistoryItem}>
                          <View style={styles.exportHistoryContent}>
                              <Text style={styles.exportHistoryItemTitle}>
                                {item.report_type === "organization_attendance" ? "Attendance" : item.report_type === "organization_expenses" ? "Travel & expenses" : item.report_type === "organization_clinical_activity" ? "Clinical activity" : item.report_type === "organization_performance" ? "Performance" : item.report_type === "organization_exceptions" ? "Exceptions" : "Claims"} · {item.format.toUpperCase()} · {item.row_count} row
                                {item.row_count === 1 ? "" : "s"}
                                {item.report_type === "consolidated_claims" || item.report_type === "organization_expenses" || item.report_type === "organization_performance" ? ` · ${formatReportAmount(item.total_amount)}` : ""}
                            </Text>
                            <Text style={styles.exportHistoryMeta}>
                              {item.requester_name} · {new Date(item.last_downloaded_at).toLocaleString("en-IN")} · {item.download_count} download
                              {item.download_count === 1 ? "" : "s"}
                            </Text>
                            <Text style={styles.exportHistoryChecksum}>
                              SHA-256 {item.checksum_sha256.slice(0, 12)}…
                            </Text>
                          </View>
                          <TouchableOpacity
                            accessibilityLabel={expired ? "Report expired" : `Share ${item.format.toUpperCase()} report again`}
                            accessibilityRole="button"
                            disabled={expired || historySharing !== null}
                            onPress={() => void shareHistoricalExport(item)}
                            style={[
                              styles.exportHistoryButton,
                              (expired || historySharing) && styles.disabledButton,
                            ]}
                          >
                            {historySharing === item.id ? (
                              <ActivityIndicator color={colors.primary} size="small" />
                            ) : (
                              <Text style={styles.exportHistoryButtonText}>
                                {expired ? "Expired" : "Save / Share"}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                  {exportFailures.length > 0 ? (
                    <View style={styles.exportFailurePanel}>
                      <Text style={styles.exportFailureTitle}>
                        Recent export issues
                      </Text>
                      {exportFailures.slice(0, 5).map((item) => (
                        <Text key={item.id} style={styles.exportFailureText}>
                          {item.requester_name} · {item.event_type.replaceAll("_", " ")} · {(item.error_code ?? "unknown error").replaceAll("_", " ")} · {new Date(item.occurred_at).toLocaleString("en-IN")}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
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
  auditLogButton: {
    alignItems: "center",
    backgroundColor: colors.blueSurface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: spacing.xl,
    minHeight: 64,
    padding: spacing.lg,
  },
  auditLogIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  auditLogText: {
    flex: 1,
    marginHorizontal: spacing.lg,
  },
  auditLogTitle: {
    color: colors.blueDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  auditLogSubtitle: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
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
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
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
  filterBody: {
    marginTop: spacing.xlPlus,
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
  disabledButton: {
    opacity: 0.6,
  },
  exportSelectorPanel: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.xl,
  },
  exportSelectorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  exportSelectorLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginTop: spacing.lg,
  },
  exportSelectorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  exportSelectorChip: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exportSelectorChipSelected: {
    backgroundColor: colors.primary,
  },
  exportSelectorChipText: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
  },
  exportSelectorChipTextSelected: {
    color: colors.surface,
    fontWeight: typography.weight.bold,
  },
  exportHistoryPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.xl,
  },
  exportHistoryTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  operationsHealth: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  operationsHealthy: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  operationsDegraded: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
  operationsHealthTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    textTransform: "capitalize",
  },
  operationsHealthText: {
    color: colors.textMuted,
    fontSize: typography.size.caption,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  exportHistoryLoading: { alignSelf: "flex-start", marginTop: spacing.lg },
  exportHistoryEmpty: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.lg,
  },
  exportHistoryItem: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  exportHistoryContent: { flex: 1 },
  exportHistoryItemTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  exportHistoryMeta: {
    color: colors.textMuted,
    fontSize: typography.size.tiny,
    marginTop: spacing.xs,
  },
  exportHistoryChecksum: {
    color: colors.textSubtle,
    fontFamily: "monospace",
    fontSize: typography.size.micro,
    marginTop: spacing.xs,
  },
  exportHistoryButton: {
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exportHistoryButtonText: {
    color: colors.primaryDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  exportFailurePanel: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBright,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  exportFailureTitle: {
    color: colors.warningDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  exportFailureText: {
    color: colors.warningDark,
    fontSize: typography.size.tiny,
    lineHeight: typography.lineHeight.small,
    marginTop: spacing.sm,
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
