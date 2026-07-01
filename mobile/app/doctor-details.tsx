import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorDetailsSkeleton,
  DoctorStatusBadge,
} from "../src/components/doctor/DoctorUi";
import {
  DoctorServiceError,
  getDoctorById,
} from "../src/services/doctorService";
import type { Doctor } from "../src/types/doctor";
import { clearAuthSession } from "../src/utils/storage";

const PRIMARY = colors.primary;

const getSingleParam = (
  value: string | string[] | undefined
): string | undefined => (Array.isArray(value) ? value[0] : value);

const parseDoctorId = (
  value: string | string[] | undefined
): number | null => {
  const parsed = Number(getSingleParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load doctor details.";
};

export default function DoctorDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDoctor = useCallback(async (): Promise<void> => {
    const doctorId = parseDoctorId(params.id);

    if (!doctorId) {
      setDoctor(null);
      setError("A valid doctor ID is required.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getDoctorById(doctorId);
      setDoctor(data);
    } catch (loadError) {
      if (
        loadError instanceof DoctorServiceError &&
        loadError.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return;
      }

      setDoctor(null);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useFocusEffect(
    useCallback(() => {
      void loadDoctor();
    }, [loadDoctor])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <DoctorDetailsSkeleton />
      </SafeAreaView>
    );
  }

  if (error || !doctor) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorPage}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons color={colors.textSecondary} name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={27}
              />
            </View>
            <Text style={styles.errorTitle}>Doctor unavailable</Text>
            <Text
              accessibilityLiveRegion="polite"
              style={styles.errorMessage}
            >
              {error ?? "Doctor details are not available."}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => void loadDoctor()}
              style={styles.retryButton}
            >
              <Ionicons color={colors.surface} name="refresh" size={18} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            activeOpacity={0.82}
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons color={colors.textSecondary} name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.eyebrow}>Doctor Management</Text>
            <Text style={styles.title}>Doctor Details</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel={`Edit ${doctor.name}`}
            accessibilityRole="button"
            activeOpacity={0.82}
            hitSlop={8}
            onPress={() =>
              router.push({
                pathname: "/(admin)/doctor-edit",
                params: { id: String(doctor.id) },
              })
            }
            style={styles.editButton}
          >
            <Ionicons color={PRIMARY} name="create-outline" size={20} />
          </TouchableOpacity>
        </View>

        <View
          accessibilityLabel={`${doctor.name}, ${
            doctor.specialization ?? "specialization not provided"
          }`}
          accessible
          style={styles.identity}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {doctor.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.doctorName}>{doctor.name}</Text>
          <Text style={styles.specialization}>
            {doctor.specialization ?? "Specialization not provided"}
          </Text>
          <View style={styles.identityStatus}>
            <DoctorStatusBadge active={doctor.active} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Professional Information</Text>
        <View style={styles.detailsCard}>
          <DetailRow
            icon="medical-outline"
            label="Specialization"
            value={doctor.specialization ?? "Not available"}
          />
          {doctor.registration_number ? (
            <DetailRow
              icon="document-text-outline"
              label="Registration Number"
              value={doctor.registration_number}
            />
          ) : null}
          <DetailRow
            icon="shield-checkmark-outline"
            last
            label="Status"
            value={doctor.active ? "Active" : "Inactive"}
          />
        </View>

        <Text style={styles.sectionTitle}>Contact Information</Text>
        <View style={styles.detailsCard}>
          <DetailRow
            icon="call-outline"
            label="Phone"
            value={doctor.phone ?? "Not available"}
          />
          <DetailRow
            icon="mail-outline"
            last
            label="Email"
            value={doctor.email ?? "Not available"}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface DetailRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
  value: string;
}

const DetailRow = ({ icon, label, last = false, value }: DetailRowProps) => (
  <View
    accessibilityLabel={`${label}: ${value}`}
    accessible
    style={[
      styles.detailRow,
      last ? styles.lastDetailRow : null,
    ]}
  >
    <View style={styles.detailIcon}>
      <Ionicons color={PRIMARY} name={icon} size={20} />
    </View>
    <View style={styles.detailContent}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.s36,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  editButton: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  identity: {
    alignItems: "center",
    paddingBottom: spacing.md,
    paddingTop: spacing.s30,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.displayLarge,
    fontWeight: typography.weight.extrabold,
  },
  doctorName: {
    color: colors.textPrimary,
    fontSize: typography.size.size23,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lgPlus,
    textAlign: "center",
  },
  specialization: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.s5,
    textAlign: "center",
  },
  identityStatus: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.mdPlus,
    marginTop: spacing.xxxl,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.s15,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: spacing.xl,
  },
  lastDetailRow: {
    marginBottom: spacing.none,
  },
  detailIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    marginRight: spacing.lg,
    width: 40,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
    marginTop: spacing.s3,
  },
  errorPage: {
    flex: 1,
    padding: spacing.xxl,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.screen,
    padding: spacing.xxxl,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.s15,
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xlPlus,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
});
