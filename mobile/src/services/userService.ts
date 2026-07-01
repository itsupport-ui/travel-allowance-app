import { api } from "../api/apiClient";
import type { AuthUser } from "../types/auth";
import { getToken } from "../utils/storage";

export const getCurrentUser = async (): Promise<AuthUser> => {
  const token = await getToken();

  if (!token) {
    throw new Error("Authentication token is missing. Please sign in again.");
  }

  const response = await api.get<AuthUser>("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};
