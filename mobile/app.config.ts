import type { ConfigContext, ExpoConfig } from "expo/config";

const readBoolean = (value: string | undefined): boolean =>
  value === "true";

const isPlaceholderHost = (hostname: string): boolean =>
  hostname.endsWith(".example");

export default ({ config }: ConfigContext): ExpoConfig => {
  if (!config.name || !config.slug) {
    throw new Error("Expo app name and slug must be configured.");
  }

  const environment = process.env.EXPO_PUBLIC_APP_ENV;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const pushNotificationsEnabled = readBoolean(
    process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS
  );
  const easProjectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    (typeof config.extra?.eas === "object" &&
    config.extra.eas !== null &&
    "projectId" in config.extra.eas &&
    typeof config.extra.eas.projectId === "string"
      ? config.extra.eas.projectId
      : null);
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_FILE?.trim() ||
    config.android?.googleServicesFile;

  if (environment === "production") {
    if (!apiUrl) {
      throw new Error(
        "EXPO_PUBLIC_API_URL is required for production builds."
      );
    }

    const parsedApiUrl = new URL(apiUrl);

    if (
      parsedApiUrl.protocol !== "https:" ||
      isPlaceholderHost(parsedApiUrl.hostname)
    ) {
      throw new Error(
        "Configure EXPO_PUBLIC_API_URL with the deployed HTTPS API before building for production."
      );
    }

    if (pushNotificationsEnabled && !easProjectId) {
      throw new Error(
        "EXPO_PUBLIC_EAS_PROJECT_ID is required when production push notifications are enabled."
      );
    }

    if (pushNotificationsEnabled && !googleServicesFile) {
      throw new Error(
        "GOOGLE_SERVICES_FILE is required for Android push notifications in production."
      );
    }
  }

  return {
    ...config,
    name: config.name,
    slug: config.slug,
    android: {
      ...config.android,
      ...(googleServicesFile
        ? { googleServicesFile }
        : {}),
    },
  };
};
