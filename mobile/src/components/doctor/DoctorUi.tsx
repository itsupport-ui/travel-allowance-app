import { colors, radius, spacing, typography } from "@/src/theme";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface DoctorStatusBadgeProps {
  active: boolean;
}

export const DoctorStatusBadge = ({
  active,
}: DoctorStatusBadgeProps) => (
  <View
    accessibilityLabel={`Doctor status: ${active ? "Active" : "Inactive"}`}
    accessible
    style={[
      styles.statusBadge,
      !active ? styles.inactiveBadge : null,
    ]}
  >
    <View
      style={[
        styles.statusDot,
        !active ? styles.inactiveDot : null,
      ]}
    />
    <Text
      style={[
        styles.statusText,
        !active ? styles.inactiveText : null,
      ]}
    >
      {active ? "Active" : "Inactive"}
    </Text>
  </View>
);

const SkeletonPulse = ({ children }: { children: ReactNode }) => {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 700,
          toValue: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 700,
          toValue: 0.45,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityLabel="Loading doctor information"
      accessibilityRole="progressbar"
      style={{ opacity }}
    >
      {children}
    </Animated.View>
  );
};

const SkeletonBlock = ({
  height,
  width,
}: {
  height: number;
  width: number | `${number}%`;
}) => (
  <View
    style={[
      styles.skeletonBlock,
      {
        height,
        width,
      },
    ]}
  />
);

export const DoctorDetailsSkeleton = () => (
  <SkeletonPulse>
    <View style={styles.detailsSkeleton}>
      <View style={styles.skeletonRow}>
        <SkeletonBlock height={42} width={42} />
        <View style={styles.skeletonIdentity}>
          <SkeletonBlock height={11} width="38%" />
          <SkeletonBlock height={22} width="55%" />
        </View>
      </View>
      <View style={styles.profileSkeleton}>
        <SkeletonBlock height={72} width={72} />
        <SkeletonBlock height={22} width="48%" />
        <SkeletonBlock height={13} width="36%" />
        <SkeletonBlock height={28} width={72} />
      </View>
      <SkeletonBlock height={18} width="54%" />
      <View style={styles.detailsCardSkeleton}>
        <SkeletonBlock height={42} width="100%" />
        <SkeletonBlock height={42} width="100%" />
        <SkeletonBlock height={42} width="100%" />
      </View>
      <SkeletonBlock height={18} width="46%" />
      <View style={styles.detailsCardSkeleton}>
        <SkeletonBlock height={42} width="100%" />
        <SkeletonBlock height={42} width="100%" />
      </View>
    </View>
  </SkeletonPulse>
);

const styles = StyleSheet.create({
  statusBadge: {
    alignItems: "center",
    backgroundColor: colors.greenSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.s5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inactiveBadge: {
    backgroundColor: colors.neutral100,
  },
  statusDot: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    height: 7,
    width: 7,
  },
  inactiveDot: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    color: colors.primaryDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
  },
  inactiveText: {
    color: colors.textMutedDark,
  },
  skeletonBlock: {
    backgroundColor: colors.border,
    borderRadius: radius.md,
  },
  skeletonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
  },
  skeletonIdentity: {
    flex: 1,
    gap: spacing.md,
  },
  detailsSkeleton: {
    padding: spacing.xxl,
    paddingTop: spacing.section,
  },
  profileSkeleton: {
    alignItems: "center",
    gap: spacing.mdPlus,
    paddingBottom: spacing.s26,
    paddingTop: spacing.s34,
  },
  detailsCardSkeleton: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.lgPlus,
    marginBottom: spacing.xxxl,
    marginTop: spacing.mdPlus,
    padding: spacing.s15,
  },
});
