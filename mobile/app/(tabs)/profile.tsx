import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { queryKeys } from "../../src/query/queryKeys";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import { getCurrentUser } from "../../src/services/userService";
import { deactivatePushToken } from "../../src/services/notificationService";
import { removeToken } from "../../src/utils/storage";

const PRIMARY = colors.primary;

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: queryKeys.auth.user,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
  });

  const handleLogout = async () => {
    try {
      await deactivatePushToken();
    } catch (error) {
      if (__DEV__) {
        console.warn("Unable to deactivate push token during logout.", error);
      }
    }
    await removeToken();
    queryClient.clear();
    router.replace("/(auth)/login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      {userQuery.isPending && !userQuery.data ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      ) : userQuery.error && !userQuery.data ? (
        <View style={styles.centerState}>
          <Ionicons
            color={colors.danger}
            name="alert-circle-outline"
            size={28}
          />
          <Text style={styles.stateTitle}>Unable to load profile</Text>
          <Text style={styles.stateText}>
            {getApiErrorMessage(
              userQuery.error,
              "Unable to load your profile."
            )}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => void userQuery.refetch()}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : userQuery.data ? (
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userQuery.data.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{userQuery.data.username}</Text>
          <Text style={styles.email}>{userQuery.data.email}</Text>

          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>
                {userQuery.data.role}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.85}
        style={styles.logoutButton}
        onPress={() => void handleLogout()}
      >
        <Ionicons
          color={colors.danger}
          name="log-out-outline"
          size={20}
        />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: spacing.xxxl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.rounded,
    height: 76,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 76,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.headingLarge,
    fontWeight: typography.weight.extrabold,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
  },
  email: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.xs,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xl,
    width: "100%",
  },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  roleBadge: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  roleText: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    textTransform: "capitalize",
  },
  logoutButton: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: "auto",
    minHeight: 54,
  },
  logoutText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.section,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.md,
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  retryButton: {
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 44,
  },
  retryText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
