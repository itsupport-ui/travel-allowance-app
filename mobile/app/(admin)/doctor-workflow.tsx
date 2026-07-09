import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const workflowActions: {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
  title: string;
}[] = [
  {
    description: "Schedule calls, confirm decisions, and create visits.",
    icon: "call-outline",
    route: "/doctor-workflow-consultations" as Href,
    title: "Consultations",
  },
  {
    description: "Approve treatment plans and generate therapist schedules.",
    icon: "medkit-outline",
    route: "/doctor-workflow-treatment-plans" as Href,
    title: "Treatment Plans",
  },
  {
    description: "Review doctor expense claims and proof files.",
    icon: "receipt-outline",
    route: "/doctor-workflow-claims" as Href,
    title: "Doctor Claims",
  },
];

export default function AdminDoctorWorkflowScreen() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Administration</Text>
        <Text style={styles.title}>Doctor Workflow</Text>
        <Text style={styles.subtitle}>
          Manage doctor consultations, treatment plan approvals, and doctor
          expense claims.
        </Text>

        <View style={styles.workflowList}>
          {workflowActions.map((action) => (
            <TouchableOpacity
              accessibilityHint={action.description}
              accessibilityRole="button"
              activeOpacity={0.84}
              key={action.title}
              style={styles.workflowCard}
              onPress={() => router.push(action.route)}
            >
              <View style={styles.workflowIcon}>
                <Ionicons
                  color={colors.primary}
                  name={action.icon}
                  size={23}
                />
              </View>
              <View style={styles.workflowText}>
                <Text style={styles.workflowTitle}>{action.title}</Text>
                <Text style={styles.workflowDescription}>
                  {action.description}
                </Text>
              </View>
              <Ionicons
                color={colors.textSubtle}
                name="chevron-forward"
                size={20}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xlPlus,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size27,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s5,
  },
  workflowList: {
    gap: spacing.lgPlus,
    marginTop: spacing.xxxl,
  },
  workflowCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    minHeight: 92,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  workflowIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  workflowText: {
    flex: 1,
  },
  workflowTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  workflowDescription: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
});
