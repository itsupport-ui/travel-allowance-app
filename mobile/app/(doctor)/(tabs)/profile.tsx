import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DoctorErrorState,
  DoctorLoadingState,
  DoctorScreenHeader,
} from "../../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../../src/query/queryKeys";
import { getApiErrorMessage } from "../../../src/services/errorHandler";
import { deactivatePushToken } from "../../../src/services/notificationService";
import { getCurrentUser } from "../../../src/services/userService";
import { removeToken } from "../../../src/utils/storage";

export default function DoctorProfileScreen() {
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryFn: getCurrentUser,
    queryKey: queryKeys.auth.user,
    staleTime: 5 * 60 * 1000,
  });

  const logout = async () => {
    try {
      await deactivatePushToken();
    } catch {
      // Logout must continue when push cleanup is unavailable.
    }

    await removeToken();
    queryClient.clear();
    router.replace("/(auth)/login");
  };

  const confirmLogout = () => {
    Alert.alert("Log Out", "Do you want to end this session?", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => void logout(),
        style: "destructive",
        text: "Log Out",
      },
    ]);
  };

  if (userQuery.isPending && !userQuery.data) {
    return <DoctorLoadingState label="Loading profile..." />;
  }

  if (userQuery.error && !userQuery.data) {
    return (
      <DoctorErrorState
        message={getApiErrorMessage(
          userQuery.error,
          "Unable to load your profile."
        )}
        onRetry={() => void userQuery.refetch()}
        title="Profile unavailable"
      />
    );
  }

  const user = userQuery.data;
  const initial = (user?.username ?? "D").charAt(0).toUpperCase();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.container}
    >
      <DoctorScreenHeader
        subtitle="View account details and manage your session."
        title="Profile"
      />

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user?.username ?? "Doctor"}</Text>
        <Text style={styles.email}>{user?.email ?? "Email not available"}</Text>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role ?? "doctor"}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.85}
        style={styles.logoutButton}
        onPress={confirmLogout}
      >
        <Ionicons
          color={colors.danger}
          name="log-out-outline"
          size={21}
        />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
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
    color: colors.primary,
    fontSize: typography.size.headingLarge,
    fontWeight: typography.weight.extrabold,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  email: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.xs,
    textAlign: "center",
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
  infoLabel: {
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
    color: colors.primary,
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
    marginTop: spacing.xxxl,
    minHeight: 54,
  },
  logoutText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
});
