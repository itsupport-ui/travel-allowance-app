import { AxiosError } from "axios";

import { api } from "../api/apiClient";
import { appConfig } from "../config/env";
import { getToken } from "../utils/storage";

interface ReverseGeocodeResponse {
  address: string;
}

export interface DistanceResponse {
  distance_km: number;
}

export class MapsServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapsServiceError";
  }
}

const ensureMapsEnabled = (): void => {
  if (!appConfig.features.maps) {
    throw new MapsServiceError(
      "Maps features are currently unavailable."
    );
  }
};

const getAuthHeaders = async () => {
  const token = await getToken();

  if (!token) {
    throw new Error("Authentication token is missing. Please log in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const getMapsError = (error: unknown, fallback: string): MapsServiceError => {
  if (error instanceof MapsServiceError) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return new MapsServiceError(
        "The distance request timed out. Please try again."
      );
    }

    if (!error.response) {
      return new MapsServiceError(
        "Maps services are unavailable while offline. Check your connection and try again."
      );
    }

    const body = error.response.data as { detail?: unknown } | undefined;

    if (typeof body?.detail === "string") {
      return new MapsServiceError(body.detail);
    }
  }

  if (error instanceof Error) {
    return new MapsServiceError(error.message);
  }

  return new MapsServiceError(fallback);
};

export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<string> => {
  ensureMapsEnabled();

  try {
    const response = await api.get<ReverseGeocodeResponse>(
      "/maps/reverse-geocode",
      {
        headers: await getAuthHeaders(),
        params: {
          latitude,
          longitude,
        },
        timeout: 10_000,
      }
    );

    const address = response.data.address?.trim();

    if (!address) {
      throw new MapsServiceError(
        "The current location could not be resolved to an address."
      );
    }

    return address;
  } catch (error) {
    throw getMapsError(
      error,
      "The current location could not be resolved to an address."
    );
  }
};

export const calculateDistance = async (
  fromLocation: string,
  toLocation: string
): Promise<DistanceResponse> => {
  ensureMapsEnabled();

  if (!fromLocation.trim() || !toLocation.trim()) {
    throw new MapsServiceError(
      "Both the starting address and destination are required."
    );
  }

  try {
    const response = await api.get<DistanceResponse>("/maps/distance", {
      headers: await getAuthHeaders(),
      params: {
        from_location: fromLocation.trim(),
        to_location: toLocation.trim(),
      },
      timeout: 10_000,
    });

    if (
      !Number.isFinite(response.data.distance_km) ||
      response.data.distance_km < 0
    ) {
      throw new MapsServiceError(
        "The distance service returned an invalid result."
      );
    }

    return response.data;
  } catch (error) {
    throw getMapsError(error, "Unable to calculate the route distance.");
  }
};
