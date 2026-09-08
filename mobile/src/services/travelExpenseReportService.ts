import { File, Paths } from "expo-file-system";

import { api } from "../api/apiClient";
import type {
  TravelExpenseReportFilters,
  TravelExpenseReportFormat,
  TravelExpenseReportResponse,
} from "../types/travelExpenseReport";

const buildParams = (
  filters: TravelExpenseReportFilters
): Record<string, string | number | undefined> => ({
  person_type: filters.personType,
  person_id: filters.personId,
  month: filters.month,
  start_date: filters.startDate,
  end_date: filters.endDate,
});

export const getTravelExpenseReport = async (
  filters: TravelExpenseReportFilters
): Promise<TravelExpenseReportResponse> => {
  const response = await api.get<TravelExpenseReportResponse>(
    "/reports/travel-expense",
    { params: buildParams(filters) }
  );
  return response.data;
};

const FORMAT_URL_SEGMENT: Record<TravelExpenseReportFormat, string> = {
  csv: "csv",
  pdf: "pdf",
  xlsx: "excel",
};

const FORMAT_MIME_TYPE: Record<TravelExpenseReportFormat, string> = {
  csv: "text/csv",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface TravelExpenseReportDownload {
  file: File;
  fileName: string;
  mimeType: string;
}

export const downloadTravelExpenseReport = async (
  filters: TravelExpenseReportFilters,
  format: TravelExpenseReportFormat
): Promise<TravelExpenseReportDownload> => {
  const response = await api.get<ArrayBuffer>(
    `/reports/travel-expense/${FORMAT_URL_SEGMENT[format]}`,
    { params: buildParams(filters), responseType: "arraybuffer" }
  );
  const disposition = String(
    response.headers["content-disposition"] ?? ""
  );
  const fileName =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
    `travel-expense-report.${format}`;
  const mimeType = String(
    response.headers["content-type"] ?? FORMAT_MIME_TYPE[format]
  );
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(new Uint8Array(response.data));
  if (!file.exists || file.size <= 0) {
    throw new Error("The report did not create a valid file.");
  }
  return { file, fileName, mimeType };
};
