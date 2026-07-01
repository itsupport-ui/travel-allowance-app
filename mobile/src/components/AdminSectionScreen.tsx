import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface AdminSectionScreenProps {
  emptyTitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}

const PRIMARY = colors.primary;

export function AdminSectionScreen({
  emptyTitle,
  icon,
  title,
}: AdminSectionScreenProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Administration</Text>
        <Text style={styles.title}>{title}</Text>

        <View style={styles.emptyState}>
          <View style={styles.iconContainer}>
            <Ionicons color={PRIMARY} name={icon} size={28} />
          </View>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xlPlus,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xxxl,
    marginTop: spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 230,
    padding: spacing.section,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  iconContainer: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 56,
    justifyContent: "center",
    marginBottom: spacing.s15,
    width: 56,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.bold,
    textAlign: "center",
  },
});
