import * as Linking from "expo-linking";
import { Alert } from "react-native";

export interface MapDestination {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const buildDirectionsUrl = ({
  address,
  latitude,
  longitude,
}: MapDestination): string | null => {
  let destination: string | null = null;

  if (isCoordinate(latitude) && isCoordinate(longitude)) {
    destination = `${latitude},${longitude}`;
  } else if (address && address.trim()) {
    destination = address.trim();
  }

  if (!destination) {
    return null;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}&travelmode=driving`;
};

export const openInMaps = async (
  destination: MapDestination
): Promise<void> => {
  const url = buildDirectionsUrl(destination);

  if (!url) {
    Alert.alert("No address", "This visit has no address to navigate to.");
    return;
  }

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "Unable to open Maps",
      "Please install Google Maps or open the address in your browser."
    );
  }
};
