import {
  formatDateForApi,
  formatDateForDisplay,
} from "./date";

export const parsePositiveId = (
  value: string | string[] | undefined
): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue || !/^\d+$/.test(rawValue)) {
    return null;
  }

  const id = Number(rawValue);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const formatDoctorDate = (
  value: string | null | undefined
): string => {
  return formatDateForDisplay(value) || value || "Not available";
};

export const formatDoctorDateTime = (
  value: string | null | undefined
): string => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDateForDisplay(date)}, ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

export const formatDoctorCurrency = (
  value: number | null | undefined
): string =>
  new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(Number(value) || 0);

export const formatDoctorLabel = (
  value: string | null | undefined
): string => {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const getLocalIsoDate = (): string => {
  return formatDateForApi(new Date());
};

export const nullableDoctorText = (value: string): string | null =>
  value.trim() || null;
