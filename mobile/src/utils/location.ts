import * as Location from "expo-location";

const LOCATION_TIMEOUT_MS = 15_000;

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type LocationErrorCode =
  | "PERMISSION_DENIED"
  | "GPS_UNAVAILABLE"
  | "LOCATION_TIMEOUT"
  | "LOCATION_UNAVAILABLE";

export class LocationError extends Error {
  constructor(
    public readonly code: LocationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LocationError";
  }
}

const withTimeout = <T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new LocationError(
          "LOCATION_TIMEOUT",
          "Location request timed out. Move to an open area and try again."
        )
      );
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });

export const requestLocationPermission = async (): Promise<void> => {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== Location.PermissionStatus.GRANTED) {
      throw new LocationError(
        "PERMISSION_DENIED",
        permission.canAskAgain
          ? "Location permission is required to capture your current position."
          : "Location permission is disabled. Enable it in device settings to continue."
      );
    }
  } catch (error) {
    if (error instanceof LocationError) {
      throw error;
    }

    throw new LocationError(
      "PERMISSION_DENIED",
      "Unable to request location permission. Please try again."
    );
  }
};

export const getCurrentLocation = async (): Promise<Coordinates> => {
  let servicesEnabled: boolean;

  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
  } catch {
    throw new LocationError(
      "GPS_UNAVAILABLE",
      "Unable to check location services. Please verify that GPS is enabled."
    );
  }

  if (!servicesEnabled) {
    throw new LocationError(
      "GPS_UNAVAILABLE",
      "Location services are disabled. Enable GPS and try again."
    );
  }

  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      LOCATION_TIMEOUT_MS
    );

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch (error) {
    if (error instanceof LocationError) {
      throw error;
    }

    throw new LocationError(
      "LOCATION_UNAVAILABLE",
      "Current location is unavailable. Check GPS signal and try again."
    );
  }
};
