import type { Href } from "expo-router";

import type { UserRole } from "../types/auth";

export type AuthenticatedRoute = Href;

export const getHomeRoute = (role: UserRole): AuthenticatedRoute => {
  if (role === "admin") {
    return "/(admin)" as Href;
  }

  if (role === "doctor") {
    return "/(doctor)/(tabs)" as Href;
  }

  return "/therapist" as Href;
};
