import type { AxiosInstance, AxiosRequestConfig } from "axios";

interface ExportJobState {
  id: string;
  status: "completed" | "expired" | "failed" | "processing" | "queued";
  download_url: string | null;
}

type ReadyExportJob = ExportJobState & {
  status: "completed";
  download_url: string;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const waitForReportExportJob = async <T extends ExportJobState>(
  api: AxiosInstance,
  initialJob: T,
  config?: AxiosRequestConfig,
  attempts = 30,
  intervalMs = 1000
): Promise<ReadyExportJob> => {
  let job = initialJob;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (job.status === "completed" && job.download_url) {
      return job as ReadyExportJob;
    }
    if (job.status === "expired") {
      throw new Error("This report has expired. Preview it again to continue.");
    }
    if (job.status === "failed") {
      throw new Error("Report generation failed. Retry or preview a smaller range.");
    }
    if (job.status !== "queued" && job.status !== "processing") {
      throw new Error("Report generation returned an unsupported status.");
    }
    if (attempt === attempts) break;
    await wait(intervalMs);
    const response = await api.get<T>(`/reports/exports/${job.id}`, config);
    job = response.data;
  }
  throw new Error("The report is still processing. Retry this export shortly; the same job will be reused.");
};
