import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TherapistListSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import {
  DoctorServiceError,
  getManagedDoctors,
} from "../../src/services/doctorService";
import {
  getTherapistManagementList,
  TherapistServiceError,
} from "../../src/services/therapistService";
import type { Doctor } from "../../src/types/doctor";
import type { TherapistListItem } from "../../src/types/therapist";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;
type LoadMode = "initial" | "refresh" | "silent";
type DirectoryTab = "therapists" | "doctors";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Unable to load directory records.";
};

interface DirectoryRecord {
  active: boolean;
  detail: string;
  email: string | null;
  id: number;
  kind: DirectoryTab;
  name: string;
  phone: string | null;
  todayScheduleCount: number | null;
}

interface StaffCardProps {
  item: DirectoryRecord;
}

const StaffCard = memo(function StaffCard({ item }: StaffCardProps) {
  const isTherapist = item.kind === "therapists";
  const handleEdit = (event: GestureResponderEvent): void => {
    event.stopPropagation();
    router.push({
      pathname: isTherapist
        ? "/(admin)/therapist-edit"
        : "/(admin)/doctor-edit",
      params: { id: String(item.id) },
    });
  };
  
  return (
    <TouchableOpacity
      accessibilityHint={
        isTherapist
          ? `View schedules assigned to ${item.name}`
          : `View details for ${item.name}`
      }
      accessibilityLabel={
        isTherapist
          ? `${item.name}, ${item.todayScheduleCount ?? 0} schedules today`
          : `${item.name}, ${item.detail}`
      }
      accessibilityRole="button"
      activeOpacity={0.82}
      onPress={() => {
        if (isTherapist) {
          router.push({
            pathname: "/(admin)/schedules",
            params: { therapistId: String(item.id) },
          });
          return;
        }

        router.push({
          pathname: "/doctor-details",
          params: { id: String(item.id) },
        });
      }}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, !isTherapist && styles.doctorAvatar]}>
          <Text style={[styles.avatarText, !isTherapist && styles.doctorAvatarText]}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.email}>
            {item.email ?? item.detail}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityLabel={`Edit ${item.name}`}
          accessibilityRole="button"
          activeOpacity={0.8}
          hitSlop={8}
          onPress={handleEdit}
          style={[
            styles.editButton,
            !isTherapist && styles.doctorEditButton,
          ]}
        >
          <Ionicons
            color={isTherapist ? PRIMARY : colors.blueDark}
            name="create-outline"
            size={19}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.cardFooter}>
        <View style={[styles.statusBadge, !item.active && styles.inactiveStatusBadge]}>
          <View style={[styles.statusDot, !item.active && styles.inactiveStatusDot]} />
          <Text style={[styles.statusText, !item.active && styles.inactiveStatusText]}>
            {item.active ? "Active" : "Inactive"}
          </Text>
        </View>

        <View style={styles.scheduleCount}>
          <Ionicons
            color={isTherapist ? PRIMARY : colors.blueDark}
            name={isTherapist ? "calendar-outline" : "medical-outline"}
            size={17}
          />
          {isTherapist ? (
            <>
              <Text style={styles.scheduleCountValue}>
                {item.todayScheduleCount ?? 0}
              </Text>
              <Text style={styles.scheduleCountLabel}>
                {item.todayScheduleCount === 1
                  ? "schedule today"
                  : "schedules today"}
              </Text>
            </>
          ) : (
            <Text numberOfLines={1} style={styles.scheduleCountLabel}>
              {item.phone ?? item.detail}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const keyExtractor = (item: DirectoryRecord): string =>
  `${item.kind}-${item.id}`;
const ListSeparator = () => <View style={styles.separator} />;

export default function AdminDirectoryScreen() {
  const [activeTab, setActiveTab] = useState<DirectoryTab>("therapists");
  const [therapists, setTherapists] = useState<TherapistListItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedSuccessfully = useRef(false);

  const handleSessionExpiry = useCallback(async (requestError: unknown): Promise<boolean> => {
    if (
      (requestError instanceof TherapistServiceError ||
        requestError instanceof DoctorServiceError) &&
      requestError.status === 401
    ) {
      await clearAuthSession();
      router.replace("/(auth)/login");
      return true;
    }
    return false;
  }, []);

  const loadDirectoryData = useCallback(async (mode: LoadMode = "initial"): Promise<void> => {
    if (mode === "initial") setLoading(true);
    else if (mode === "refresh") setRefreshing(true);
    setError(null);

    try {
      const [therapistData, doctorData] = await Promise.all([
        getTherapistManagementList(),
        getManagedDoctors(),
      ]);
      setTherapists(therapistData);
      setDoctors(
        [...doctorData].sort((first, second) =>
          first.name.localeCompare(second.name)
        )
      );
      loadedSuccessfully.current = true;
    } catch (loadError) {
      if (await handleSessionExpiry(loadError)) return;
      const message = getErrorMessage(loadError);

      if (mode === "initial") setError(message);
      else Alert.alert("Unable to Refresh Directory", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleSessionExpiry]);

  useFocusEffect(
    useCallback(() => {
      void loadDirectoryData(loadedSuccessfully.current ? "silent" : "initial");
    }, [loadDirectoryData])
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    const records: DirectoryRecord[] =
      activeTab === "therapists"
        ? therapists.map((therapist) => ({
            active: therapist.is_active,
            detail: "Therapist",
            email: therapist.email,
            id: therapist.id,
            kind: "therapists",
            name: therapist.username,
            phone: null,
            todayScheduleCount: therapist.todayScheduleCount,
          }))
        : doctors.map((doctor) => ({
            active: doctor.active,
            detail:
              doctor.specialization ?? "Specialization not provided",
            email: doctor.email ?? null,
            id: doctor.id,
            kind: "doctors",
            name: doctor.name,
            phone: doctor.phone,
            todayScheduleCount: null,
          }));

    if (!normalizedQuery) {
      return records;
    }

    return records.filter((item) =>
      [
        item.name,
        item.email ?? "",
        item.detail,
        item.phone ?? "",
      ].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery)
      )
    );
  }, [activeTab, doctors, searchQuery, therapists]);

  const handleRefresh = useCallback(() => {
    void loadDirectoryData("refresh");
  }, [loadDirectoryData]);

  const handleCreateAction = useCallback(() => {
    if (activeTab === "therapists") {
      router.push("/(admin)/therapist-create");
    } else {
      router.push("/(admin)/doctor-create");
    }
  }, [activeTab]);

  const renderStaffItem: ListRenderItem<DirectoryRecord> = useCallback(
    ({ item }) => <StaffCard item={item} />,
    []
  );

  const listHeader = (
    <>
      <Text style={styles.eyebrow}>Administration</Text>
      <Text style={styles.title}>Medical Directory</Text>
      <Text style={styles.subtitle}>
        Manage medical staffing rosters, system availability parameters, and active patient workload metrics.
      </Text>

      {/* Modern Segmented Control Switcher */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setActiveTab("therapists"); setSearchQuery(""); }}
          style={[styles.segmentButton, activeTab === "therapists" && styles.activeSegment]}
        >
          <Ionicons 
            name={activeTab === "therapists" ? "people" : "people-outline"} 
            size={16} 
            color={activeTab === "therapists" ? PRIMARY : colors.textMuted} 
          />
          <Text style={[styles.segmentText, activeTab === "therapists" && styles.activeSegmentText]}>
            Therapists
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setActiveTab("doctors"); setSearchQuery(""); }}
          style={[styles.segmentButton, activeTab === "doctors" && styles.activeSegment]}
        >
          <Ionicons 
            name={activeTab === "doctors" ? "medical" : "medical-outline"} 
            size={15} 
            color={activeTab === "doctors" ? colors.blueDark : colors.textMuted} 
          />
          <Text style={[styles.segmentText, activeTab === "doctors" && styles.activeSegmentText, activeTab === "doctors" && { color: colors.blueDark }]}>
            Doctors
          </Text>
        </TouchableOpacity>
      </View>

      {/* Unified Contextual Search Field Container */}
      <View style={styles.searchContainer}>
        <Ionicons color={colors.textMuted} name="search-outline" size={20} />
        <TextInput
          accessibilityLabel="Search directory"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchQuery}
          placeholder={
            activeTab === "therapists"
              ? "Search therapists by name or email"
              : "Search doctors by name or specialty"
          }
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity hitSlop={8} onPress={() => setSearchQuery("")}>
            <Ionicons color={colors.textMuted} name="close-circle" size={20} />
          </TouchableOpacity>
        )}
      </View>

      {!loading && !error && (
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>
            {activeTab === "therapists" ? "Therapist Staff" : "Physicians & Doctors"}
          </Text>
          <Text style={[styles.resultCount, activeTab === "doctors" && styles.doctorResultCount]}>
            {filteredRecords.length}
          </Text>
        </View>
      )}
    </>
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <TherapistListSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[
          styles.content,
          filteredRecords.length === 0 && styles.emptyContent,
        ]}
        data={error ? [] : filteredRecords}
        initialNumToRender={8}
        ItemSeparatorComponent={ListSeparator}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <Ionicons color={colors.danger} name="alert-circle-outline" size={26} />
              </View>
              <Text style={styles.errorTitle}>Records unavailable</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity onPress={() => void loadDirectoryData("initial")} style={styles.retryButton}>
                <Ionicons color={colors.surface} name="refresh" size={18} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons color={colors.textSubtle} name={activeTab === "therapists" ? "people-outline" : "medical-outline"} size={38} />
              <Text style={styles.emptyTitle}>
                {searchQuery ? "No matching records found" : "Directory workspace empty"}
              </Text>
              <Text style={styles.emptyMessage}>
                {searchQuery ? "Try verifying spelling or clear filtering criteria." : `No registered ${activeTab} records found.`}
              </Text>
            </View>
          )
        }
        maxToRenderPerBatch={8}
        removeClippedSubviews
        renderItem={renderStaffItem}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />

      <TouchableOpacity
        activeOpacity={0.86}
        onPress={handleCreateAction}
        style={[styles.floatingButton, activeTab === "doctors" && { backgroundColor: colors.blueDark }]}
      >
        <Ionicons color={colors.surface} name="add" size={22} />
        <Text style={styles.floatingButtonText}>
          {activeTab === "therapists" ? "Add Therapist" : "Add Doctor"}
        </Text>
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
  eyebrow: {
    color: PRIMARY,
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
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: colors.primarySurface,
    padding: 4,
    borderRadius: radius.control,
    marginTop: spacing.xxl,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.control - 2,
  },
  activeSegment: {
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  segmentText: {
    fontSize: typography.size.bodySmall,
    fontWeight: "600",
    color: colors.textMuted,
  },
  activeSegmentText: {
    color: PRIMARY,
  },
  searchContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.lgPlus,
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
  doctorResultCount: {
    backgroundColor: colors.blueSurface,
    color: colors.blueDark,
  },
  card: {
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
  doctorAvatar: {
    backgroundColor: colors.blueSurface,
  },
  avatarText: {
    color: PRIMARY,
    fontSize: typography.size.size19,
    fontWeight: typography.weight.extrabold,
  },
  doctorAvatarText: {
    color: colors.blueDark,
  },
  identity: {
    flex: 1,
    marginLeft: spacing.lg,
    marginRight: spacing.md,
  },
  editButton: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  doctorEditButton: {
    backgroundColor: colors.blueSurface,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  email: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  divider: {
    backgroundColor: colors.neutral150,
    height: 1,
    marginVertical: spacing.lgPlus,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusBadge: {
    alignItems: "center",
    backgroundColor: colors.greenSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.s9,
    paddingVertical: spacing.sm,
  },
  inactiveStatusBadge: {
    backgroundColor: colors.neutral100,
  },
  statusDot: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    height: 7,
    width: 7,
  },
  inactiveStatusDot: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    color: colors.primaryDark,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
  },
  inactiveStatusText: {
    color: colors.textMutedDark,
  },
  scheduleCount: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.s5,
  },
  scheduleCountValue: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  scheduleCountLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
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
});
