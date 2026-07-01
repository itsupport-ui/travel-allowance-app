import type { UserRole } from "../types/auth";

export type AuthenticatedRoute = "/(admin)" | "/(tabs)";

export const getHomeRoute = (role: UserRole): AuthenticatedRoute =>
  role === "admin" ? "/(admin)" : "/(tabs)";
