import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  DoctorPressableCard,
  DoctorScreenHeader,
} from "../../../src/components/doctor/DoctorWorkflowUi";

const workAreas: {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: Href;
  step: string;
}[] = [
  {
    description: "Review assigned calls and record each patient's decision.",
    icon: "call-outline",
    label: "Consultations",
    route: "/(doctor)/(tabs)/consultations",
    step: "1",
  },
  {
    description: "Open scheduled visits, start care, and complete clinical notes.",
    icon: "calendar-outline",
    label: "Visits",
    route: "/(doctor)/(tabs)/visits",
    step: "2",
  },
  {
    description: "Create treatment plans and respond to requested corrections.",
    icon: "medkit-outline",
    label: "Treatment plans",
    route: "/(doctor)/(tabs)/treatment-plans",
    step: "3",
  },
];

export default function DoctorWorkScreen() {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DoctorScreenHeader
        subtitle="Clinical tasks in the order they usually happen"
        title="Work"
      />

      <View style={styles.guide}>
        <Ionicons color={colors.primary} name="git-branch-outline" size={22} />
        <Text style={styles.guideText}>
          Consultation decisions create the visits that lead to treatment plans.
          Use this workspace to follow that flow without searching across tabs.
        </Text>
      </View>

      <View style={styles.cards}>
        {workAreas.map((area) => (
          <DoctorPressableCard
            accessibilityLabel={`Open ${area.label}`}
            key={area.label}
            style={styles.card}
            onPress={() => router.push(area.route)}
          >
            <View style={styles.stepBadge}>
              <Text style={styles.stepText}>{area.step}</Text>
            </View>
            <View style={styles.iconBox}>
              <Ionicons color={colors.primary} name={area.icon} size={24} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{area.label}</Text>
              <Text style={styles.cardDescription}>{area.description}</Text>
            </View>
            <Ionicons
              color={colors.textSubtle}
              name="chevron-forward"
              size={22}
            />
          </DoctorPressableCard>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.card,
    borderWidth: 1,
    elevation: shadows.elevation.card,
    flexDirection: "row",
    gap: spacing.lg,
    minHeight: 112,
    padding: spacing.xl,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  cardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.body,
  },
  cards: {
    gap: spacing.lg,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.bold,
  },
  content: {
    gap: spacing.xl,
    padding: spacing.xl,
    paddingBottom: spacing.screen,
  },
  guide: {
    alignItems: "flex-start",
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  guideText: {
    color: colors.primaryDeep,
    flex: 1,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.lg,
    height: spacing.s48,
    justifyContent: "center",
    width: spacing.s48,
  },
  stepBadge: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: spacing.xxlPlus,
    justifyContent: "center",
    width: spacing.xxlPlus,
  },
  stepText: {
    color: colors.white,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
});
