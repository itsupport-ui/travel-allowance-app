import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import { openInMaps, type MapDestination } from "../utils/maps";

export function NavigateButton(props: MapDestination) {
  return (
    <TouchableOpacity
      accessibilityLabel="Navigate to patient address"
      accessibilityRole="button"
      activeOpacity={0.8}
      onPress={() => void openInMaps(props)}
      style={styles.button}
    >
      <Ionicons color={colors.primary} name="navigate" size={18} />
      <Text style={styles.label}>Navigate</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.primary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
});
