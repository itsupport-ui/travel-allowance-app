import { Alert } from "react-native";
import { isAxiosError } from "axios";

import { clearAuthSession } from "../utils/storage";

export type ApiErrorKind =
  | "authentication"
  | "authorization"
  | "conflict"
  | "network"
  | "not_found"
  | "request"
  | "server"
  | "timeout"
  | "unknown"
  | "validation";

interface ValidationIssue {
  loc?: unknown;
  msg?: unknown;
}

interface ErrorResponseBody {
  detail?: unknown;
  error?: unknown;
  message?: unknown;
}

interface StatusBearingError {
  status?: unknown;
}

export interface ApiErrorDetails {
  code?: string;
  kind: ApiErrorKind;
  message: string;
  status?: number;
  validationErrors?: string[];
}

export interface ApiErrorLogEntry {
  code?: string;
  kind: ApiErrorKind;
  message: string;
  operation?: string;
  status?: number;
  technicalMessage?: string;
  timestamp: string;
}

export type ApiErrorLogger = (entry: ApiErrorLogEntry) => void;

export interface HandleApiErrorOptions {
  fallbackMessage?: string;
  onSessionExpired?: () => void | Promise<void>;
  operation?: string;
  showAlert?: boolean;
  title?: string;
}

const DEFAULT_MESSAGE =
  "Something went wrong. Please try again.";

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: "The request could not be completed. Please check your information.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to perform this action.",
  404: "The requested information could not be found.",
  409: "This request conflicts with an existing record.",
  422: "Some information is invalid. Please review the highlighted fields.",
  500: "The server encountered an error. Please try again later.",
};

const ALERT_TITLES: Readonly<Record<ApiErrorKind, string>> = {
  authentication: "Session Expired",
  authorization: "Access Denied",
  conflict: "Unable to Continue",
  network: "Connection Problem",
  not_found: "Not Found",
  request: "Unable to Complete Request",
  server: "Server Unavailable",
  timeout: "Request Timed Out",
  unknown: "Something Went Wrong",
  validation: "Check Your Information",
};

let logger: ApiErrorLogger = (entry) => {
  console.error("[API Error]", entry);
};

let sessionCleanupPromise: Promise<void> | null = null;

export class ApiError extends Error {
  readonly code?: string;
  readonly isAuthError: boolean;
  readonly isNetworkError: boolean;
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly validationErrors: string[];

  constructor({
    code,
    kind,
    message,
    status,
    validationErrors = [],
  }: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.kind = kind;
    this.status = status;
    this.validationErrors = validationErrors;
    this.isAuthError = kind === "authentication";
    this.isNetworkError = kind === "network" || kind === "timeout";
  }
}

export const configureApiErrorLogger = (
  nextLogger: ApiErrorLogger
): void => {
  logger = nextLogger;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getStatus = (error: unknown): number | undefined => {
  if (isAxiosError(error)) {
    return error.response?.status;
  }

  if (isRecord(error) && "status" in error) {
    const status = (error as StatusBearingError).status;
    return typeof status === "number" ? status : undefined;
  }

  return undefined;
};

const getResponseBody = (error: unknown): ErrorResponseBody | undefined => {
  if (!isAxiosError(error) || !isRecord(error.response?.data)) {
    return undefined;
  }

  return error.response.data;
};

const getServiceErrorMessage = (error: unknown): string | null => {
  if (
    isAxiosError(error) ||
    !(error instanceof Error) ||
    !isRecord(error) ||
    !("status" in error)
  ) {
    return null;
  }

  return error.message.trim() || null;
};

const getBackendMessage = (
  body: ErrorResponseBody | undefined
): string | null => {
  const candidates = [body?.detail, body?.message, body?.error];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

const formatFieldName = (location: unknown): string | null => {
  if (!Array.isArray(location)) {
    return null;
  }

  const field = [...location]
    .reverse()
    .find(
      (part) =>
        typeof part === "string" &&
        !["body", "path", "query"].includes(part)
    );

  if (typeof field !== "string") {
    return null;
  }

  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const getValidationErrors = (
  body: ErrorResponseBody | undefined
): string[] => {
  if (!Array.isArray(body?.detail)) {
    return [];
  }

  return body.detail
    .filter(
      (issue): issue is ValidationIssue =>
        isRecord(issue) && typeof issue.msg === "string"
    )
    .map((issue) => {
      const message =
        typeof issue.msg === "string" ? issue.msg.trim() : "";
      const field = formatFieldName(issue.loc);
      return field ? `${field}: ${message}` : message;
    })
    .filter(Boolean)
    .slice(0, 3);
};

const getKindForStatus = (status: number | undefined): ApiErrorKind => {
  switch (status) {
    case 400:
      return "request";
    case 401:
      return "authentication";
    case 403:
      return "authorization";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation";
    default:
      return status !== undefined && status >= 500
        ? "server"
        : "unknown";
  }
};

const getSafeStatusMessage = (
  status: number | undefined,
  fallbackMessage: string
): string => {
  if (status === undefined) {
    return fallbackMessage;
  }

  if (status >= 500) {
    return STATUS_MESSAGES[500];
  }

  return STATUS_MESSAGES[status] ?? fallbackMessage;
};

const isTimeoutError = (error: unknown): boolean =>
  isAxiosError(error) &&
  (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT");

const isNetworkError = (error: unknown): boolean =>
  isAxiosError(error) && !error.response;

const getErrorCode = (error: unknown): string | undefined => {
  if (isAxiosError(error) && typeof error.code === "string") {
    return error.code;
  }

  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }

  return undefined;
};

export const normalizeApiError = (
  error: unknown,
  fallbackMessage = DEFAULT_MESSAGE
): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  const code = getErrorCode(error);

  if (isTimeoutError(error)) {
    return new ApiError({
      code,
      kind: "timeout",
      message:
        "The request took too long. Check your connection and try again.",
    });
  }

  if (isNetworkError(error)) {
    return new ApiError({
      code,
      kind: "network",
      message:
        "Unable to reach the server. Check your connection and try again.",
    });
  }

  const status = getStatus(error);
  const kind = getKindForStatus(status);
  const body = getResponseBody(error);
  const validationErrors = getValidationErrors(body);
  const backendMessage = getBackendMessage(body);
  const serviceMessage = getServiceErrorMessage(error);

  if (kind === "validation" && validationErrors.length > 0) {
    return new ApiError({
      code,
      kind,
      message: validationErrors.join("\n"),
      status,
      validationErrors,
    });
  }

  const shouldUseBackendMessage =
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![401, 403].includes(status);

  const responseMessage = backendMessage ?? serviceMessage;
  const message = shouldUseBackendMessage && responseMessage
    ? responseMessage
    : getSafeStatusMessage(status, fallbackMessage);

  if (status !== undefined) {
    return new ApiError({
      code,
      kind,
      message,
      status,
      validationErrors,
    });
  }

  if (serviceMessage) {
    return new ApiError({
      code,
      kind: "unknown",
      message: serviceMessage,
    });
  }

  if (error instanceof Error && error.message.trim()) {
    return new ApiError({
      code,
      kind: "unknown",
      message: fallbackMessage,
    });
  }

  return new ApiError({
    code,
    kind: "unknown",
    message: fallbackMessage,
  });
};

const logIfUnexpected = (
  error: ApiError,
  originalError: unknown,
  operation?: string
): void => {
  if (error.kind !== "server" && error.kind !== "unknown") {
    return;
  }

  logger({
    code: error.code,
    kind: error.kind,
    message: error.message,
    operation,
    status: error.status,
    technicalMessage:
      originalError instanceof Error
        ? originalError.message
        : undefined,
    timestamp: new Date().toISOString(),
  });
};

const clearExpiredSession = async (): Promise<void> => {
  if (!sessionCleanupPromise) {
    sessionCleanupPromise = clearAuthSession().finally(() => {
      sessionCleanupPromise = null;
    });
  }

  await sessionCleanupPromise;
};

export const getApiErrorMessage = (
  error: unknown,
  fallbackMessage = DEFAULT_MESSAGE
): string => normalizeApiError(error, fallbackMessage).message;

export const handleApiError = async (
  error: unknown,
  {
    fallbackMessage = DEFAULT_MESSAGE,
    onSessionExpired,
    operation,
    showAlert = true,
    title,
  }: HandleApiErrorOptions = {}
): Promise<ApiError> => {
  const apiError = normalizeApiError(error, fallbackMessage);

  logIfUnexpected(apiError, error, operation);

  if (apiError.isAuthError) {
    await clearExpiredSession();
    await onSessionExpired?.();
  }

  if (showAlert) {
    Alert.alert(
      title ?? ALERT_TITLES[apiError.kind],
      apiError.message
    );
  }

  return apiError;
};
