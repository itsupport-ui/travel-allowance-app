export type UserRole = "admin" | "therapist";

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export const isUserRole = (value: unknown): value is UserRole =>
  value === "admin" || value === "therapist";
