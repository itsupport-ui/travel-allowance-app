import { api } from "../api/apiClient";
import type { LoginResponse } from "../types/auth";

export const login = async (
  email: string,
  password: string
): Promise<LoginResponse> => {

  const body =
    `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;

  const response = await api.post<LoginResponse>(
    "/auth/login",
    body,
    {
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
};
