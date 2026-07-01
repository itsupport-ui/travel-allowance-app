import { QueryClient } from "@tanstack/react-query";

import { normalizeApiError } from "../services/errorHandler";

const shouldRetry = (
  failureCount: number,
  error: unknown
): boolean => {
  const apiError = normalizeApiError(error);

  if (
    apiError.isAuthError ||
    apiError.kind === "authorization" ||
    apiError.kind === "not_found" ||
    apiError.kind === "request" ||
    apiError.kind === "validation"
  ) {
    return false;
  }

  return failureCount < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      gcTime: 10 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: shouldRetry,
      staleTime: 30 * 1000,
    },
  },
});
