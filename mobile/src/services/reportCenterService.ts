import { File, Paths } from "expo-file-system";

import { api } from "../api/apiClient";
import {
  deliverReportFile,
  type ReportDeliveryMode,
} from "./reportFileDelivery";
import { waitForReportExportJob } from "./reportExportJob";

export type MyClaimsReportFormat = "pdf" | "xlsx" | "csv";
export type MyReportType =
  | "my_claims"
  | "my_attendance"
  | "my_expenses"
  | "my_clinical_activity"
  | "my_performance";
export type MyClaimsReportStatus =
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
  | "cancelled";

export interface MyClaimsReportFilters {
  fromDate?: string;
  status?: MyClaimsReportStatus;
  toDate?: string;
}

export interface ReportExportHistoryItem {
  id: string;
  snapshot_id: string;
  report_type:
    | "consolidated_claims"
    | "my_claims"
    | "organization_attendance"
    | "my_attendance"
    | "organization_expenses"
    | "my_expenses"
    | "organization_clinical_activity"
    | "my_clinical_activity"
    | "organization_performance"
    | "my_performance";
  scope: "organization" | "self";
  format: MyClaimsReportFormat;
  row_count: number;
  total_amount: number;
  summary: Record<string, number | string>;
  snapshot_expires_at: string;
  filename: string;
  size_bytes: number;
  checksum_sha256: string;
  download_count: number;
  last_downloaded_at: string;
}

export interface MyClaimsReportPreview {
  report_type: MyReportType;
  scope: "self";
  snapshot_at: string;
  snapshot_id: string;
  expires_at: string;
  timezone: "Asia/Kolkata";
  row_count: number;
  total_amount: number;
  summary: Record<string, number | string>;
  status_counts: Record<string, number>;
  supported_formats: MyClaimsReportFormat[];
  warnings: string[];
}

interface ReportExportJobResponse {
  id: string;
  status: "completed" | "expired" | "failed" | "processing" | "queued";
  download_url: string | null;
}

export const previewMyClaimsReport = async (
  filters: MyClaimsReportFilters = {},
  reportType: MyReportType = "my_claims"
): Promise<
  MyClaimsReportPreview
> => {
  const response = await api.post<MyClaimsReportPreview>(
    "/reports/preview",
    {
      report_type: reportType,
      from_date: filters.fromDate ?? null,
      status: filters.status ?? "all",
      to_date: filters.toDate ?? null,
    }
  );
  return response.data;
};

export const getMyReportExportHistory = async (): Promise<
  ReportExportHistoryItem[]
> => {
  const response = await api.get<ReportExportHistoryItem[]>(
    "/reports/exports/history",
    { params: { limit: 6, scope: "mine" } }
  );
  return response.data;
};

export const deliverMyClaimsReport = async (
  format: MyClaimsReportFormat,
  snapshotId: string,
  deliveryMode: ReportDeliveryMode
): Promise<{ fileName: string; rowCount: number; savedUri: string | null }> => {
  const job = await api.post<ReportExportJobResponse>(
    "/reports/exports",
    {
      format,
      idempotency_key: `${snapshotId}:${format}`,
      snapshot_id: snapshotId,
    }
  );
  const readyJob = await waitForReportExportJob(api, job.data);
  const response = await api.get<ArrayBuffer>(
    readyJob.download_url,
    { responseType: "arraybuffer" }
  );
  const disposition = String(
    response.headers["content-disposition"] ?? ""
  );
  const fileName =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
    `my-report.${format}`;
  const reportFile = new File(Paths.cache, fileName);
  reportFile.create({ overwrite: true });
  reportFile.write(new Uint8Array(response.data));
  if (!reportFile.exists || reportFile.size <= 0) {
    throw new Error("The report did not create a valid file.");
  }
  const mimeTypes: Record<MyClaimsReportFormat, string> = {
    csv: "text/csv",
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  try {
    const delivery = await deliverReportFile(deliveryMode, {
      dialogTitle: `Share ${format.toUpperCase()} report`,
      file: reportFile,
      fileName,
      mimeType: mimeTypes[format],
    });
    return {
      fileName,
      rowCount: Number(response.headers["x-report-row-count"] ?? 0),
      savedUri: delivery.savedUri,
    };
  } finally {
    if (reportFile.exists) reportFile.delete();
  }
};
