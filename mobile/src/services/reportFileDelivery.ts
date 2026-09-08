import { Directory, File } from "expo-file-system";
import * as Sharing from "expo-sharing";

export type ReportDeliveryMode = "save" | "share";

export interface ReportFileDeliveryOptions {
  dialogTitle: string;
  file: File;
  fileName: string;
  mimeType: string;
}

const safeFileName = (fileName: string): string => {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "report";
};

const assertValidFile = (file: File): void => {
  if (!file.exists || file.size <= 0) {
    throw new Error("The report did not create a valid file.");
  }
};

export const deliverReportFile = async (
  mode: ReportDeliveryMode,
  options: ReportFileDeliveryOptions
): Promise<{ savedUri: string | null }> => {
  assertValidFile(options.file);

  if (mode === "share") {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("File sharing is unavailable on this device.");
    }
    await Sharing.shareAsync(options.file.uri, {
      dialogTitle: options.dialogTitle,
      mimeType: options.mimeType,
    });
    return { savedUri: null };
  }

  const directory = await Directory.pickDirectoryAsync();
  const destination = new File(directory.uri, safeFileName(options.fileName));
  destination.create({ overwrite: true });
  destination.write(await options.file.bytes());
  assertValidFile(destination);
  return { savedUri: destination.uri };
};
