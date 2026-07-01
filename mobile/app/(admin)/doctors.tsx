import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorUi";
import { DoctorListSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import {
  DoctorServiceError,
  getDoctors,
} from "../../src/services/doctorService";
import type { Doctor } from "../../src/types/doctor";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

type LoadMode = "initial" | "refresh" | "silent";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load doctors.";
};

const sortDoctors = (doctors: Doctor[]): Doctor[] =>
  [...doctors].sort((first, second) =>
    first.name.localeCompare(second.name)
  );

interface DoctorCardProps {
  doctor: Doctor;
}

const DoctorCard = memo(function DoctorCard({
  doctor,
}: DoctorCardProps) {
  return (
    <TouchableOpacity
      accessibilityHint="Opens doctor details"
      accessibilityLabel={`${doctor.name}, ${
        doctor.specialization ?? "specialization not provided"
      }, ${doctor.active ? "active" : "inactive"}`}
      accessibilityRole="button"
      activeOpacity={0.82}
      onPress={() =>
        router.push({
          pathname: "/doctor-details",
          params: {
            id: String(doctor.id),
          },
        })
      }
      style={styles.doctorCard}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {doctor.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.doctorName}>
            {doctor.name}
          </Text>
          {doctor.specialization ? (
            <Text numberOfLines={1} style={styles.specialization}>
              {doctor.specialization}
            </Text>
          ) : null}
        </View>
        <DoctorStatusBadge active={doctor.active} />
      </View>

      {doctor.phone || doctor.email ? (
        <>
          <View style={styles.divider} />
          {doctor.phone ? (
            <View style={styles.contactRow}>
              <Ionicons color={colors.textMuted} name="call-outline" size={17} />
              <Text numberOfLines={1} style={styles.contactText}>
                {doctor.phone}
              </Text>
            </View>
          ) : null}
          {doctor.email ? (
            <View style={styles.contactRow}>
              <Ionicons color={colors.textMuted} name="mail-outline" size={17} />
              <Text numberOfLines={1} style={styles.contactText}>
                {doctor.email}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.cardAction}>
        <Text style={styles.cardActionText}>View details</Text>
        <Ionicons color={PRIMARY} name="chevron-forward" size={18} />
      </View>
    </TouchableOpacity>
  );
});

const keyExtractor = (item: Doctor): string => String(item.id);

const renderDoctorItem: ListRenderItem<Doctor> = ({ item }) => (
  <DoctorCard doctor={item} />
);

const ListSeparator = () => <View style={styles.separator} />;

export default function AdminDoctorsScreen() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedSuccessfully = useRef(false);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        requestError instanceof DoctorServiceError &&
        requestError.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }

      return false;
    },
    []
  );

  const loadDoctors = useCallback(
    async (mode: LoadMode = "initial"): Promise<void> => {
      if (mode === "initial") {
        setLoading(true);
      } else if (mode === "refresh") {
        setRefreshing(true);
      }

      setError(null);

      try {
        const data = await getDoctors();
        setDoctors(sortDoctors(data));
        loadedSuccessfully.current = true;
      } catch (loadError) {
        if (await handleSessionExpiry(loadError)) {
          return;
        }

        const message = getErrorMessage(loadError);

        if (mode === "initial") {
          setError(message);
        } else {
          Alert.alert("Unable to Refresh Doctors", message);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleSessionExpiry]
  );

  useFocusEffect(
    useCallback(() => {
      void loadDoctors(
        loadedSuccessfully.current ? "silent" : "initial"
      );
    }, [loadDoctors])
  );

  const filteredDoctors = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return doctors;
    }

    return doctors.filter((doctor) =>
      doctor.name.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [doctors, searchQuery]);

  const listHeader = (
    <>
      <View style={styles.pageHeader}>
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
        <View style={styles.pageHeaderContent}>
          <Text style={styles.eyebrow}>Administration</Text>
          <Text style={styles.title}>Doctors</Text>
          <Text style={styles.subtitle}>
            Clinical doctor directory
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons color={colors.textMuted} name="search-outline" size={20} />
        <TextInput
          accessibilityHint="Results update as you type"
          accessibilityLabel="Search doctors by name"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchQuery}
          placeholder="Search by doctor name"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity
            accessibilityLabel="Clear doctor search"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setSearchQuery("")}
          >
            <Ionicons color={colors.textMuted} name="close-circle" size={20} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.sectionTitle}>Doctor Directory</Text>
        <Text style={styles.resultCount}>{filteredDoctors.length}</Text>
      </View>
    </>
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <DoctorListSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[
          styles.content,
          filteredDoctors.length === 0 && styles.emptyContent,
        ]}
        data={error ? [] : filteredDoctors}
        initialNumToRender={8}
        ItemSeparatorComponent={ListSeparator}
        keyboardShouldPersistTaps="handled"
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          error ? (
            <View style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <Ionicons
                  color={colors.danger}
                  name="alert-circle-outline"
                  size={26}
                />
              </View>
              <Text style={styles.errorTitle}>Doctors unavailable</Text>
              <Text
                accessibilityLiveRegion="polite"
                style={styles.errorMessage}
              >
                {error}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.82}
                onPress={() => void loadDoctors()}
                style={styles.retryButton}
              >
                <Ionicons color={colors.surface} name="refresh" size={18} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons color={colors.textSubtle} name="medical-outline" size={40} />
              <Text style={styles.emptyTitle}>
                {searchQuery
                  ? "No matching doctors"
                  : "No doctors available"}
              </Text>
              <Text style={styles.emptyMessage}>
                {searchQuery
                  ? "No doctor names match your search."
                  : "No doctor records have been created."}
              </Text>
            </View>
          )
        }
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={() => void loadDoctors("refresh")}
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        maxToRenderPerBatch={8}
        removeClippedSubviews
        renderItem={renderDoctorItem}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />

      <TouchableOpacity
        accessibilityHint="Opens the create doctor form"
        accessibilityLabel="Add doctor"
        accessibilityRole="button"
        activeOpacity={0.86}
        onPress={() => router.push("/(admin)/doctor-create")}
        style={styles.floatingButton}
      >
        <Ionicons color={colors.surface} name="add" size={22} />
        <Text style={styles.floatingButtonText}>Add Doctor</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.s110,
  },
  emptyContent: {
    flexGrow: 1,
  },
  pageHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xlPlus,
  },
  pageHeaderContent: {
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
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.size25,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.s3,
  },
  searchContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.xxlPlus,
    minHeight: 50,
    paddingHorizontal: spacing.lgPlus,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingVertical: spacing.lg,
  },
  resultsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    marginTop: spacing.xxxl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  resultCount: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    minWidth: 31,
    overflow: "hidden",
    paddingHorizontal: spacing.s9,
    paddingVertical: spacing.s5,
    textAlign: "center",
  },
  doctorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.mediumSoft,
    shadowRadius: shadows.radius.cardSoft,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.size19,
    fontWeight: typography.weight.extrabold,
  },
  identity: {
    flex: 1,
    marginHorizontal: spacing.lg,
  },
  doctorName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  specialization: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  divider: {
    backgroundColor: colors.neutral150,
    height: 1,
    marginVertical: spacing.s13,
  },
  contactRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  contactText: {
    color: colors.textMutedDark,
    flex: 1,
    fontSize: typography.size.smallLarge,
  },
  cardAction: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.md,
  },
  cardActionText: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  separator: {
    height: 12,
  },
  floatingButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    bottom: 18,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.xlPlus,
    position: "absolute",
    right: 20,
    elevation: shadows.elevation.high,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y3,
    shadowOpacity: shadows.opacity.heavy,
    shadowRadius: shadows.radius.card,
  },
  floatingButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 280,
    paddingHorizontal: spacing.xxxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lgPlus,
  },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.section,
    padding: spacing.xxxl,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 46,
    justifyContent: "center",
    width: 46,
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
