import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AdminScheduleServiceError,
  getAdminScheduleData,
} from "../../src/services/adminScheduleService";
import type {
  AdminScheduleData,
  AdminScheduleView,
} from "../../src/types/adminSchedule";
import type { Schedule } from "../../src/types/schedule";
import type { TherapistResponse } from "../../src/types/therapist";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;

interface ViewDefinition {
  key: AdminScheduleView;
  label: string;
}

interface BadgeColors {
  backgroundColor: string;
  textColor: string;
}

const views: ViewDefinition[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "missed", label: "Missed" },
];

const getSingleParam = (
  value: string | string[] | undefined
): string | undefined => (Array.isArray(value) ? value[0] : value);

const parseTherapistId = (
  value: string | string[] | undefined
): number | null => {
  const parsed = Number(getSingleParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getLocalDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidDateKey = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

const formatDate = (
  value: string | null | undefined
): string => {
  if (!value) {
    return "Date not set";
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Time not available";
  }

  const match = /^(\d{1,2}):(\d{2})/.exec(value);

  if (!match) {
    return value;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours > 23 ||
    minutes > 59
  ) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
};

const formatLabel = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Not available";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const getScheduleDateLabel = (schedule: Schedule): string => {
  if (schedule.schedule_type === "recurring") {
    return `${formatDate(schedule.start_date)} - ${formatDate(
      schedule.end_date
    )}`;
  }

  return formatDate(schedule.treatment_date);
};

const scheduleMatchesDate = (
  schedule: Schedule,
  dateKey: string
): boolean => {
  if (schedule.schedule_type === "recurring") {
    return Boolean(
      schedule.start_date &&
        schedule.end_date &&
        schedule.start_date <= dateKey &&
        schedule.end_date >= dateKey
    );
  }

  return schedule.treatment_date === dateKey;
};

const getStatusColors = (
  status: string | null | undefined
): BadgeColors => {
  switch (status?.toLocaleLowerCase()) {
    case "completed":
      return {
        backgroundColor: colors.greenSurface,
        textColor: colors.primaryDark,
      };
    case "missed":
      return {
        backgroundColor: colors.dangerSurfaceStrong,
        textColor: colors.danger,
      };
    case "scheduled":
      return {
        backgroundColor: colors.blueSurface,
        textColor: colors.blueDark,
      };
    case "cancelled":
      return {
        backgroundColor: colors.neutral100,
        textColor: colors.textMutedDark,
      };
    default:
      return {
        backgroundColor: colors.neutral100,
        textColor: colors.textMutedDark,
      };
  }
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load schedules.";
};

const StatusBadge = memo(function StatusBadge({
  status,
}: {
  status: string;
}) {
  const colors = getStatusColors(status);

  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: colors.backgroundColor },
      ]}
    >
      <Text style={[styles.statusBadgeText, { color: colors.textColor }]}>
        {formatLabel(status)}
      </Text>
    </View>
  );
});

const ScheduleCard = memo(function ScheduleCard({
  schedule,
}: {
  schedule: Schedule;
}) {
  const editable = schedule.status === "scheduled";

  return (
  <TouchableOpacity
    accessibilityHint={
      editable ? "Opens the schedule editing form" : undefined
    }
    accessibilityLabel={`${schedule.patient_name}, ${
      schedule.treatment_name
    }, ${formatLabel(schedule.status)}`}
    accessibilityRole={editable ? "button" : undefined}
    activeOpacity={editable ? 0.82 : 1}
    disabled={!editable}
    onPress={() =>
      router.push({
        pathname: "/(admin)/schedule-edit",
        params: {
          id: String(schedule.id),
        },
      })
    }
    style={styles.card}
  >
    <View style={styles.cardHeader}>
      <View style={styles.patientIcon}>
        <Ionicons color={PRIMARY} name="person-outline" size={21} />
      </View>
      <View style={styles.patientContent}>
        <Text numberOfLines={1} style={styles.patientName}>
          {schedule.patient_name}
        </Text>
        <Text numberOfLines={1} style={styles.treatmentName}>
          {schedule.treatment_name}
        </Text>
      </View>
      <StatusBadge status={schedule.status} />
    </View>

    <View style={styles.cardDivider} />

    <View style={styles.detailRow}>
      <Ionicons color={colors.textMuted} name="medical-outline" size={17} />
      <Text numberOfLines={1} style={styles.detailText}>
        {schedule.doctor_name ?? "Doctor not assigned"}
      </Text>
    </View>
    <View style={styles.detailRow}>
      <Ionicons color={colors.textMuted} name="person-circle-outline" size={17} />
      <Text numberOfLines={1} style={styles.detailText}>
        {schedule.therapist_name ?? "Therapist not assigned"}
      </Text>
    </View>
    <View style={styles.detailRow}>
      <Ionicons color={colors.textMuted} name="calendar-outline" size={17} />
      <Text numberOfLines={1} style={styles.detailText}>
        {getScheduleDateLabel(schedule)}
      </Text>
    </View>
    <View style={styles.detailRow}>
      <Ionicons color={colors.textMuted} name="time-outline" size={17} />
      <Text style={styles.detailText}>
        {formatTime(schedule.in_time)} - {formatTime(schedule.out_time)}
      </Text>
    </View>

    <View style={styles.cardFooter}>
      <Text style={styles.scheduleType}>
        {formatLabel(schedule.schedule_type)}
      </Text>
      <View
        style={[
          styles.priorityBadge,
          schedule.priority.toLocaleLowerCase() === "high"
            ? styles.highPriorityBadge
            : null,
        ]}
      >
        <Text
          style={[
            styles.priorityText,
            schedule.priority.toLocaleLowerCase() === "high"
              ? styles.highPriorityText
              : null,
          ]}
        >
          {formatLabel(schedule.priority)} priority
        </Text>
      </View>
    </View>
    {editable ? (
      <View style={styles.editAction}>
        <Ionicons color={PRIMARY} name="create-outline" size={17} />
        <Text style={styles.editActionText}>Edit schedule</Text>
        <Ionicons color={PRIMARY} name="chevron-forward" size={17} />
      </View>
    ) : null}
  </TouchableOpacity>
  );
});

const scheduleKeyExtractor = (item: Schedule): string => String(item.id);

const renderScheduleItem: ListRenderItem<Schedule> = ({ item }) => (
  <ScheduleCard schedule={item} />
);

const ListSeparator = () => <View style={styles.separator} />;
const ModalListSeparator = () => <View style={styles.modalSeparator} />;
const EMPTY_THERAPISTS: TherapistResponse[] = [];

export default function AdminSchedulesScreen() {
  const params = useLocalSearchParams<{
    therapistId?: string | string[];
  }>();
  const [scheduleData, setScheduleData] =
    useState<AdminScheduleData | null>(null);
  const [activeView, setActiveView] =
    useState<AdminScheduleView>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedTherapistId, setSelectedTherapistId] =
    useState<number | null>(() => parseTherapistId(params.therapistId));
  const [therapistModalVisible, setTherapistModalVisible] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const routeTherapistId = parseTherapistId(params.therapistId);

    if (routeTherapistId) {
      setSelectedTherapistId(routeTherapistId);
    }
  }, [params.therapistId]);

  const loadSchedules = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await getAdminScheduleData();
        setScheduleData(data);
      } catch (loadError) {
        if (
          loadError instanceof AdminScheduleServiceError &&
          loadError.status === 401
        ) {
          await clearAuthSession();
          router.replace("/(auth)/login");
          return;
        }

        setError(getErrorMessage(loadError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      void loadSchedules();
    }, [loadSchedules])
  );

  const dateFilterError =
    dateFilter.length > 0 && !isValidDateKey(dateFilter)
      ? "Use YYYY-MM-DD format."
      : null;

  const filteredSchedules = useMemo(() => {
    const activeSchedules = scheduleData?.[activeView] ?? [];
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    const validDateFilter = isValidDateKey(dateFilter)
      ? dateFilter
      : null;

    return activeSchedules.filter((schedule) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          schedule.patient_name,
          schedule.treatment_name,
          schedule.doctor_name ?? "",
          schedule.therapist_name ?? "",
          schedule.patient_address,
        ].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch)
        );
      const matchesTherapist =
        selectedTherapistId === null ||
        schedule.therapist_id === selectedTherapistId;
      const matchesDate =
        !validDateFilter ||
        scheduleMatchesDate(schedule, validDateFilter);

      return matchesSearch && matchesTherapist && matchesDate;
    });
  }, [
    activeView,
    dateFilter,
    searchQuery,
    scheduleData,
    selectedTherapistId,
  ]);

  const selectedTherapist = scheduleData?.therapists.find(
    (therapist) => therapist.id === selectedTherapistId
  );
  const hasFilters =
    searchQuery.length > 0 ||
    dateFilter.length > 0 ||
    selectedTherapistId !== null;

  const handleRefresh = useCallback(() => {
    void loadSchedules(true);
  }, [loadSchedules]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDateFilter("");
    setSelectedTherapistId(null);
    router.setParams({ therapistId: undefined });
  }, []);

  const closeTherapistModal = useCallback(() => {
    setTherapistModalVisible(false);
  }, []);

  const selectTherapist = useCallback(
    (therapistId: number | null) => {
      setSelectedTherapistId(therapistId);
      setTherapistModalVisible(false);
      router.setParams({
        therapistId:
          therapistId === null ? undefined : String(therapistId),
      });
    },
    []
  );

  const getViewCount = useCallback(
    (view: AdminScheduleView): number =>
      scheduleData?.[view].length ?? 0,
    [scheduleData]
  );

  const listHeader = (
    <>
      <Text style={styles.eyebrow}>Administration</Text>
      <Text style={styles.title}>Schedules</Text>
      <Text style={styles.subtitle}>
        Clinical schedules across the therapist team
      </Text>

      <ScrollView
        contentContainerStyle={styles.segmentContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.segmentScroll}
      >
        {views.map((view) => {
          const selected = activeView === view.key;

          return (
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              activeOpacity={0.82}
              key={view.key}
              onPress={() => setActiveView(view.key)}
              style={[
                styles.segment,
                selected ? styles.selectedSegment : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  selected ? styles.selectedSegmentLabel : null,
                ]}
              >
                {view.label}
              </Text>
              <View
                style={[
                  styles.segmentCount,
                  selected ? styles.selectedSegmentCount : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentCountText,
                    selected ? styles.selectedSegmentCountText : null,
                  ]}
                >
                  {getViewCount(view.key)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchContainer}>
        <Ionicons color={colors.textMuted} name="search-outline" size={20} />
        <TextInput
          accessibilityLabel="Search schedules"
          autoCorrect={false}
          onChangeText={setSearchQuery}
          placeholder="Search patient, treatment or clinician"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity
            accessibilityLabel="Clear schedule search"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setSearchQuery("")}
          >
            <Ionicons color={colors.textMuted} name="close-circle" size={20} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => setTherapistModalVisible(true)}
          style={styles.therapistFilter}
        >
          <Ionicons color={PRIMARY} name="people-outline" size={18} />
          <Text numberOfLines={1} style={styles.therapistFilterText}>
            {selectedTherapist?.username ??
              (selectedTherapistId
                ? `Therapist #${selectedTherapistId}`
                : "All therapists")}
          </Text>
          <Ionicons color={colors.textMuted} name="chevron-down" size={17} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel="Filter schedules for today"
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => setDateFilter(getLocalDateKey())}
          style={styles.todayButton}
        >
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.dateContainer,
          dateFilterError ? styles.invalidDateContainer : null,
        ]}
      >
        <Ionicons color={colors.textMuted} name="calendar-outline" size={19} />
        <TextInput
          accessibilityLabel="Filter by date"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          onChangeText={(value) =>
            setDateFilter(value.replace(/[^\d-]/g, ""))
          }
          placeholder="Filter date: YYYY-MM-DD"
          placeholderTextColor={colors.textSubtle}
          style={styles.dateInput}
          value={dateFilter}
        />
        {dateFilter ? (
          <TouchableOpacity
            accessibilityLabel="Clear date filter"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setDateFilter("")}
          >
            <Ionicons color={colors.textMuted} name="close-circle" size={20} />
          </TouchableOpacity>
        ) : null}
      </View>
      {dateFilterError ? (
        <Text style={styles.dateError}>{dateFilterError}</Text>
      ) : null}

      <View style={styles.resultsHeader}>
        <Text style={styles.sectionTitle}>
          {views.find((view) => view.key === activeView)?.label}
        </Text>
        <View style={styles.resultsActions}>
          {hasFilters ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={clearFilters}
            >
              <Text style={styles.clearFiltersText}>Clear filters</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.resultsCount}>
            {filteredSchedules.length}
          </Text>
        </View>
      </View>
    </>
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={PRIMARY} size="large" />
          <Text style={styles.loadingText}>Loading schedules...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[
          styles.content,
          filteredSchedules.length === 0 && styles.emptyContent,
        ]}
        data={error ? [] : filteredSchedules}
        initialNumToRender={5}
        ItemSeparatorComponent={ListSeparator}
        keyExtractor={scheduleKeyExtractor}
        keyboardShouldPersistTaps="handled"
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
              <Text style={styles.errorTitle}>Schedules unavailable</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.82}
                onPress={() => void loadSchedules()}
                style={styles.retryButton}
              >
                <Ionicons color={colors.surface} name="refresh" size={18} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons color={colors.textSubtle} name="calendar-outline" size={38} />
              <Text style={styles.emptyTitle}>
                No {activeView} schedules
              </Text>
              <Text style={styles.emptyMessage}>
                {hasFilters
                  ? "No schedules match the selected filters."
                  : "Schedules in this category will appear here."}
              </Text>
            </View>
          )
        }
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        maxToRenderPerBatch={5}
        removeClippedSubviews
        renderItem={renderScheduleItem}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />

      <TouchableOpacity
        accessibilityHint="Opens the create schedule form"
        accessibilityLabel="Create schedule"
        accessibilityRole="button"
        activeOpacity={0.86}
        onPress={() => router.push("/(admin)/schedule-create")}
        style={styles.floatingButton}
      >
        <Ionicons color={colors.surface} name="add" size={22} />
        <Text style={styles.floatingButtonText}>Create Schedule</Text>
      </TouchableOpacity>

      <TherapistFilterModal
        onClose={closeTherapistModal}
        onSelect={selectTherapist}
        selectedTherapistId={selectedTherapistId}
        therapists={scheduleData?.therapists ?? EMPTY_THERAPISTS}
        visible={therapistModalVisible}
      />
    </SafeAreaView>
  );
}

interface TherapistFilterModalProps {
  onClose: () => void;
  onSelect: (therapistId: number | null) => void;
  selectedTherapistId: number | null;
  therapists: TherapistResponse[];
  visible: boolean;
}

interface TherapistOptionProps {
  onSelect: (therapistId: number | null) => void;
  selected: boolean;
  therapist: TherapistResponse;
}

const TherapistOption = memo(function TherapistOption({
  onSelect,
  selected,
  therapist,
}: TherapistOptionProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.82}
      onPress={() => onSelect(therapist.id)}
      style={styles.therapistOption}
    >
      <View style={styles.optionAvatar}>
        <Text style={styles.optionAvatarText}>
          {therapist.username.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.optionIdentity}>
        <Text numberOfLines={1} style={styles.optionName}>
          {therapist.username}
        </Text>
        <Text numberOfLines={1} style={styles.optionEmail}>
          {therapist.email}
        </Text>
      </View>
      {selected ? (
        <Ionicons color={PRIMARY} name="checkmark-circle" size={22} />
      ) : null}
    </TouchableOpacity>
  );
});

const therapistKeyExtractor = (item: TherapistResponse): string =>
  String(item.id);

const TherapistFilterModal = memo(function TherapistFilterModal({
  onClose,
  onSelect,
  selectedTherapistId,
  therapists,
  visible,
}: TherapistFilterModalProps) {
  const renderTherapistItem = useCallback<
    ListRenderItem<TherapistResponse>
  >(
    ({ item }) => (
      <TherapistOption
        onSelect={onSelect}
        selected={selectedTherapistId === item.id}
        therapist={item}
      />
    ),
    [onSelect, selectedTherapistId]
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>Filter by therapist</Text>
            <Text style={styles.modalSubtitle}>
              Select one therapist or view the full team
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Close therapist filter"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.modalCloseButton}
          >
            <Ionicons color={colors.textSecondary} name="close" size={22} />
          </TouchableOpacity>
        </View>

        <FlatList
          contentContainerStyle={styles.modalList}
          data={therapists}
          initialNumToRender={10}
          ItemSeparatorComponent={ModalListSeparator}
          keyExtractor={therapistKeyExtractor}
          ListHeaderComponent={
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => onSelect(null)}
              style={styles.therapistOption}
            >
              <View style={styles.optionIcon}>
                <Ionicons color={PRIMARY} name="people-outline" size={19} />
              </View>
              <Text style={styles.optionName}>All therapists</Text>
              {selectedTherapistId === null ? (
                <Ionicons color={PRIMARY} name="checkmark-circle" size={22} />
              ) : null}
            </TouchableOpacity>
          }
          maxToRenderPerBatch={10}
          removeClippedSubviews
          renderItem={renderTherapistItem}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
      </SafeAreaView>
    </Modal>
  );
});

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
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.s13,
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
  segmentScroll: {
    marginHorizontal: -20,
    marginTop: spacing.xxlPlus,
  },
  segmentContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  segment: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.s7,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 108,
    paddingHorizontal: spacing.lg,
  },
  selectedSegment: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  segmentLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  selectedSegmentLabel: {
    color: colors.surface,
  },
  segmentCount: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 22,
    minWidth: 24,
    paddingHorizontal: spacing.s5,
  },
  selectedSegmentCount: {
    backgroundColor: colors.surface,
  },
  segmentCountText: {
    color: colors.textMutedDark,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
  },
  selectedSegmentCountText: {
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
    marginTop: spacing.xlPlus,
    minHeight: 50,
    paddingHorizontal: spacing.lgPlus,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingVertical: spacing.lg,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.mdPlus,
  },
  therapistFilter: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  therapistFilterText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  todayButton: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.s15,
  },
  todayButtonText: {
    color: PRIMARY,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  dateContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.s9,
    marginTop: spacing.mdPlus,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  invalidDateContainer: {
    borderColor: colors.dangerBright,
  },
  dateInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    paddingVertical: spacing.mdPlus,
  },
  dateError: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
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
  resultsActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.mdPlus,
  },
  clearFiltersText: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  resultsCount: {
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
  patientIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  patientContent: {
    flex: 1,
    marginLeft: spacing.s11,
    marginRight: spacing.md,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  treatmentName: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.s3,
  },
  statusBadge: {
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusBadgeText: {
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
  },
  cardDivider: {
    backgroundColor: colors.neutral150,
    height: 1,
    marginVertical: spacing.lgPlus,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.s9,
  },
  detailText: {
    color: colors.textMutedDark,
    flex: 1,
    fontSize: typography.size.smallLarge,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.s5,
  },
  scheduleType: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
  },
  priorityBadge: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.s5,
  },
  highPriorityBadge: {
    backgroundColor: colors.warningSurface,
  },
  priorityText: {
    color: colors.textMutedDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
  },
  editAction: {
    alignItems: "center",
    borderTopColor: colors.neutral150,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
    marginTop: spacing.s13,
    paddingTop: spacing.s11,
  },
  editActionText: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  highPriorityText: {
    color: colors.warning,
  },
  separator: {
    height: 12,
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
    minHeight: 260,
    paddingHorizontal: spacing.xxxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lgPlus,
    textTransform: "capitalize",
  },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.s7,
    textAlign: "center",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.xxl,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
  },
  modalSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  modalCloseButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modalList: {
    padding: spacing.xxl,
  },
  modalSeparator: {
    height: 10,
  },
  therapistOption: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 62,
    padding: spacing.lg,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    marginRight: spacing.s11,
    width: 38,
  },
  optionAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    marginRight: spacing.s11,
    width: 38,
  },
  optionAvatarText: {
    color: PRIMARY,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  optionIdentity: {
    flex: 1,
    marginRight: spacing.md,
  },
  optionName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  optionEmail: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.s3,
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
});
