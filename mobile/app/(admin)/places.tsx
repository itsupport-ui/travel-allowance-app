import { colors, radius, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import {
  createPlace,
  getPlaces,
  setPlaceActive,
} from "../../src/services/doctorTaskService";
import { getApiErrorMessage } from "../../src/services/errorHandler";

const typeOptions = [
  { label: "Clinic", value: "clinic" },
  { label: "Other", value: "other" },
] as const;

const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(admin)/doctor-tasks" as Href);
  }
};

export default function AdminPlacesScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [placeType, setPlaceType] = useState<"clinic" | "other">("clinic");
  const [radiusText, setRadiusText] = useState("");

  const placesQuery = useQuery({
    queryFn: getPlaces,
    queryKey: ["admin", "places"],
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "places"] });

  const createMutation = useMutation({
    mutationFn: () => {
      const radius_m = radiusText.trim() ? Number(radiusText) : null;
      if (radius_m !== null && !(radius_m >= 25 && radius_m <= 5000)) {
        throw new Error("Radius must be between 25 and 5000 metres.");
      }
      return createPlace({
        address: address.trim(),
        name: name.trim(),
        place_type: placeType,
        radius_m,
      });
    },
    onError: (error) =>
      Alert.alert(
        "Unable to Save Place",
        getApiErrorMessage(error, "Unable to save this place.")
      ),
    onSuccess: async () => {
      setName("");
      setAddress("");
      setRadiusText("");
      await refresh();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: number) => setPlaceActive(id, false),
    onError: (error) =>
      Alert.alert(
        "Unable to Remove Place",
        getApiErrorMessage(error, "Unable to remove this place.")
      ),
    onSuccess: refresh,
  });

  const canSave = name.trim().length >= 2 && address.trim().length >= 3;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Places" />
      <FormScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.heading}>Add a place</Text>
          <DoctorField
            label="Name"
            placeholder="e.g. City Clinic, Adyar"
            required
            value={name}
            onChangeText={setName}
          />
          <DoctorField
            label="Address"
            multiline
            placeholder="The address is located on the map automatically"
            required
            value={address}
            onChangeText={setAddress}
          />
          <DoctorChoiceChips
            options={typeOptions}
            value={placeType}
            onChange={setPlaceType}
          />
          <DoctorField
            keyboardType="numeric"
            label="Allowed radius in metres (optional)"
            placeholder="Leave empty to use the standard radius"
            value={radiusText}
            onChangeText={setRadiusText}
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!canSave || createMutation.isPending}
            style={[
              styles.button,
              (!canSave || createMutation.isPending) && styles.disabled,
            ]}
            onPress={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Save place</Text>
            )}
          </TouchableOpacity>
        </View>

        {placesQuery.isPending ? (
          <DoctorLoadingState label="Loading places..." />
        ) : placesQuery.error ? (
          <DoctorErrorState
            message={getApiErrorMessage(
              placesQuery.error,
              "Unable to load places."
            )}
            onRetry={() => void placesQuery.refetch()}
          />
        ) : (placesQuery.data ?? []).length === 0 ? (
          <DoctorEmptyState
            description="Saved places appear here and in the task form."
            icon="location-outline"
            title="No places yet"
          />
        ) : (
          (placesQuery.data ?? []).map((place) => (
            <View key={place.id} style={styles.placeCard}>
              <View style={styles.placeText}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeMeta}>{place.address}</Text>
                <Text style={styles.placeMeta}>
                  Radius{" "}
                  {place.radius_m ? `${Math.round(place.radius_m)} m` : "standard"}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={archiveMutation.isPending}
                onPress={() =>
                  Alert.alert(
                    "Remove place?",
                    "Existing tasks keep this place. It will no longer be offered for new tasks.",
                    [
                      { style: "cancel", text: "Back" },
                      {
                        onPress: () => archiveMutation.mutate(place.id),
                        style: "destructive",
                        text: "Remove",
                      },
                    ]
                  )
                }
              >
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing.md, padding: spacing.xl, paddingBottom: spacing.sectionLg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: spacing.xl,
  },
  heading: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 48,
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabled: { opacity: 0.6 },
  placeCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.lg,
  },
  placeText: { flex: 1 },
  placeName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  placeMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  remove: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
});
