export type AppEnvironment = "development" | "production";
export type MapsProvider = "backend";

interface FeatureFlags {
  maps: boolean;
  pushNotifications: boolean;
  reportExports: boolean;
}

interface MapsConfiguration {
  provider: MapsProvider;
}

interface PublicAppConfiguration {
  apiTimeoutMs: number;
  apiUrl: string;
  easProjectId: string | null;
  environment: AppEnvironment;
  features: Readonly<FeatureFlags>;
  maps: Readonly<MapsConfiguration>;
}

const requireValue = (
  name: string,
  value: string | undefined
): string => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(
      `Missing ${name}. Configure it in the active Expo environment.`
    );
  }

  return normalizedValue;
};

const parseEnvironment = (
  value: string | undefined
): AppEnvironment => {
  if (value === "development" || value === "production") {
    return value;
  }

  throw new Error(
    "EXPO_PUBLIC_APP_ENV must be either development or production."
  );
};

const parseBoolean = (
  name: string,
  value: string | undefined
): boolean => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either true or false.`);
};

const parsePositiveInteger = (
  name: string,
  value: string | undefined
): number => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
};

const parseApiUrl = (value: string | undefined): string => {
  const apiUrl = requireValue("EXPO_PUBLIC_API_URL", value);

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS.");
  }

  if (
    process.env.EXPO_PUBLIC_APP_ENV === "production" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must use HTTPS in production."
    );
  }

  return apiUrl.replace(/\/+$/, "");
};

const parseMapsProvider = (
  value: string | undefined
): MapsProvider => {
  if (value === "backend") {
    return value;
  }

  throw new Error(
    "EXPO_PUBLIC_MAPS_PROVIDER must be backend. Google Maps secrets belong on the server."
  );
};

const environment = parseEnvironment(
  process.env.EXPO_PUBLIC_APP_ENV
);
const apiUrl = parseApiUrl(process.env.EXPO_PUBLIC_API_URL);

if (
  environment === "production" &&
  new URL(apiUrl).hostname.endsWith(".example")
) {
  throw new Error(
    "Replace the placeholder EXPO_PUBLIC_API_URL in .env.production before creating a production build."
  );
}

export const appConfig: Readonly<PublicAppConfiguration> = Object.freeze({
  apiTimeoutMs: parsePositiveInteger(
    "EXPO_PUBLIC_API_TIMEOUT_MS",
    process.env.EXPO_PUBLIC_API_TIMEOUT_MS
  ),
  apiUrl,
  easProjectId:
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || null,
  environment,
  features: Object.freeze({
    maps: parseBoolean(
      "EXPO_PUBLIC_ENABLE_MAPS",
      process.env.EXPO_PUBLIC_ENABLE_MAPS
    ),
    pushNotifications: parseBoolean(
      "EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS",
      process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS
    ),
    reportExports: parseBoolean(
      "EXPO_PUBLIC_ENABLE_REPORT_EXPORTS",
      process.env.EXPO_PUBLIC_ENABLE_REPORT_EXPORTS
    ),
  }),
  maps: Object.freeze({
    provider: parseMapsProvider(
      process.env.EXPO_PUBLIC_MAPS_PROVIDER
    ),
  }),
});
