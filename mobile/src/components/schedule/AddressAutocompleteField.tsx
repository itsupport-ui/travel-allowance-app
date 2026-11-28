import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  getAddressSuggestions,
  getPlaceLocation,
  type AddressSuggestion,
} from "../../services/mapsService";
import { openInMaps } from "../../utils/maps";
import { FormTextField } from "./ScheduleFormControls";

const newSessionToken = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export interface AddressValue {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface AddressAutocompleteFieldProps {
  error?: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (value: AddressValue) => void;
  value: string;
}

/**
 * Address box with Google-style suggestions while typing. Picking one stores
 * the exact map pin, which punch-in is checked against. Typing by hand clears
 * the pin and the server geocodes the text instead (often area-level only).
 */
export function AddressAutocompleteField({
  error,
  latitude,
  longitude,
  onChange,
  value,
}: AddressAutocompleteFieldProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [resolving, setResolving] = useState(false);
  const sessionToken = useRef(newSessionToken());

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      getAddressSuggestions(text, sessionToken.current)
        .then((items) => {
          if (!cancelled) setSuggestions(items);
        })
        .catch(() => {
          // Suggestions are a convenience; typing by hand still works.
          if (!cancelled) setSuggestions([]);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleType = (text: string) => {
    setQuery(text);
    if (text.trim().length < 3) setSuggestions([]);
    onChange({ address: text, latitude: null, longitude: null });
  };

  const pick = async (suggestion: AddressSuggestion) => {
    setSuggestions([]);
    setQuery("");
    setResolving(true);
    try {
      const place = await getPlaceLocation(
        suggestion.place_id,
        sessionToken.current
      );
      onChange({
        address: place.address || suggestion.description,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    } catch {
      onChange({
        address: suggestion.description,
        latitude: null,
        longitude: null,
      });
    } finally {
      setResolving(false);
      sessionToken.current = newSessionToken();
    }
  };

  const pinned = isNumber(latitude) && isNumber(longitude);

  return (
    <View>
      <FormTextField
        accessibilityLabel="Patient address"
        error={error}
        icon="location-outline"
        label="Patient Address"
        maxLength={500}
        multiline
        onChangeText={handleType}
        placeholder="Start typing, then pick the address from the list"
        required
        value={value}
      />

      {suggestions.length > 0 ? (
        <View style={styles.list}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              accessibilityRole="button"
              key={suggestion.place_id}
              onPress={() => void pick(suggestion)}
              style={styles.item}
            >
              <Ionicons
                color={colors.textMuted}
                name="location-outline"
                size={18}
              />
              <View style={styles.itemText}>
                <Text numberOfLines={1} style={styles.mainText}>
                  {suggestion.main_text || suggestion.description}
                </Text>
                {suggestion.secondary_text ? (
                  <Text numberOfLines={1} style={styles.secondaryText}>
                    {suggestion.secondary_text}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {resolving ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.statusText}>Getting the exact location...</Text>
        </View>
      ) : pinned ? (
        <View style={styles.statusRow}>
          <Ionicons color={colors.greenDark} name="checkmark-circle" size={17} />
          <Text style={[styles.statusText, styles.ok]}>Exact map pin set.</Text>
          <TouchableOpacity
            onPress={() =>
              void openInMaps({ address: value, latitude, longitude })
            }
          >
            <Text style={styles.link}>Check on map</Text>
          </TouchableOpacity>
        </View>
      ) : value.trim() ? (
        <View style={styles.statusRow}>
          <Ionicons color={colors.warning} name="alert-circle" size={17} />
          <Text style={[styles.statusText, styles.warn]}>
            No exact pin. Pick the address from the suggestions so punch-in
            works at the patient&apos;s door.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemText: {
    flex: 1,
  },
  link: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    textDecorationLine: "underline",
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
    overflow: "hidden",
  },
  mainText: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  ok: {
    color: colors.greenDark,
  },
  secondaryText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusText: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: typography.size.small,
  },
  warn: {
    color: colors.warning,
  },
});
