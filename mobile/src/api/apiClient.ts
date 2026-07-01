import { create, isAxiosError } from "axios";

import { appConfig } from "../config/env";
import { handleApiError } from "../services/errorHandler";
import {
  notifySessionExpired,
} from "../services/sessionService";
import { getToken } from "../utils/storage";

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
