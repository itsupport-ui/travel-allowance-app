import {
  create,
  isAxiosError,
  type AxiosRequestConfig,
} from "axios";

import { appConfig } from "../config/env";
import { handleApiError } from "../services/errorHandler";
import {
  notifySessionExpired,
} from "../services/sessionService";
import { getToken } from "../utils/storage";

const API_DIAGNOSTICS_ENABLED = true;

const getRequestUrl = (
  config: AxiosRequestConfig | undefined
): string => {
  if (!config?.url) {
    return appConfig.apiUrl;
  }

  try {
    return new URL(config.url, config.baseURL ?? appConfig.apiUrl)
      .toString();
  } catch {
    return `${config.baseURL ?? appConfig.apiUrl}${config.url}`;
  }
};

const getSafeResponseBody = (data: unknown): unknown => {
  if (typeof data === "string") {
    return data.slice(0, 240);
  }

  if (!data || typeof data !== "object") {
    return undefined;
  }

  const body = data as Record<string, unknown>;
  return {
    code: body.code,
    detail: body.detail,
    error: body.error,
    message: body.message,
  };
};

if (API_DIAGNOSTICS_ENABLED) {
  console.info("[API Config]", {
    apiUrl: appConfig.apiUrl,
    environment: appConfig.environment,
    timeoutMs: appConfig.apiTimeoutMs,
  });
}

export const api = create({
  baseURL: appConfig.apiUrl,
  timeout: appConfig.apiTimeoutMs,
});

api.interceptors.request.use(async (request) => {
  if (
    request.url === "/auth/login" ||
    request.headers.has("Authorization")
  ) {
    return request;
  }

  const token = await getToken();

  if (token) {
    request.headers.set("Authorization", `Bearer ${token}`);
  }

  return request;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (API_DIAGNOSTICS_ENABLED && isAxiosError(error)) {
      console.warn("[API Failure]", {
        code: error.code,
        data: getSafeResponseBody(error.response?.data),
        method: error.config?.method?.toUpperCase(),
        status: error.response?.status,
        url: getRequestUrl(error.config),
      });
    }

    const isLoginRequest =
      isAxiosError(error) &&
      error.config?.url === "/auth/login";

    if (isLoginRequest) {
      return Promise.reject(error);
    }

    const apiError = await handleApiError(error, {
      operation: isAxiosError(error)
        ? `${error.config?.method?.toUpperCase() ?? "HTTP"} request`
        : "HTTP request",
      showAlert: false,
    });

    if (apiError.isAuthError) {
      notifySessionExpired();
    }

    return Promise.reject(apiError);
  }
);
