import { colors, radius, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import {
  AdminScheduleCard,
  ScheduleListSkeleton,
  ScheduleSearchBar,
  ScheduleSummaryGrid,
  ScheduleViewTabs,
} from "../../src/components/schedule/AdminScheduleUi";
import {
  SearchableSelect,
  type SelectOption,
} from "../../src/components/schedule/ScheduleFormControls";
import {
  AdminScheduleServiceError,
  cancelAdminSchedule,
  createEmptyAdminScheduleFilters,
  getAdminScheduleFormOptions,
  getAdminScheduleReview,
} from "../../src/services/adminScheduleService";
import type {
  AdminScheduleFilters,
  AdminScheduleFormOptions,
  AdminScheduleReviewItem,
  AdminScheduleSummary,
  AdminScheduleView,
} from "../../src/types/adminSchedule";
import { getLocalApiDate } from "../../src/utils/date";
import { clearAuthSession } from "../../src/utils/storage";

const EMPTY_SUMMARY: AdminScheduleSummary = {
  cancelled: 0,
  cancelledToday: 0,
  completed: 0,
  completedToday: 0,
  conflicts: 0,
  highPriorityToday: 0,
  inProgress: 0,
  today: 0,
  upcoming: 0,
};

const sortOptions: SelectOption[] = [
  { id: "time", label: "Appointment Time" },
  { id: "newest", label: "Recently Created" },
  { id: "priority", label: "High Priority First" },
  { id: "patient", label: "Patient Name" },
  { id: "therapist", label: "Therapist Name" },
];

const priorityOptions: SelectOption[] = [
  { id: "all", label: "All Priorities" },
  { id: "high", label: "High Priority" },
  { id: "normal", label: "Normal Priority" },
];

const isScheduleSort = (
  value: number | string
): value is AdminScheduleFilters["sort"] =>
  typeof value === "string" &&
  ["time", "newest", "priority", "patient", "therapist"].includes(
    value
  );

const isValidDateRange = (
  fromDate: string,
  toDate: string
): boolean => !fromDate || !toDate || fromDate <= toDate;

export default function AdminSchedulesScreen() {
  const { width } = useWindowDimensions();
  const [filters, setFilters] = useState<AdminScheduleFilters>(
    createEmptyAdminScheduleFilters
  );
  const [draftFilters, setDraftFilters] = useState(filters);
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<AdminScheduleReviewItem[]>([]);
  const [summary, setSummary] =
    useState<AdminScheduleSummary>(EMPTY_SUMMARY);
  const [options, setOptions] =
    useState<AdminScheduleFormOptions | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const signOutOnExpiry = useCallback(
    async (errorValue: unknown): Promise<boolean> => {
      if (
        errorValue instanceof AdminScheduleServiceError &&
        errorValue.status === 401
      ) {
        await clearAuthSession();
        router.replace("/(auth)/login");
        return true;
      }
      return false;
    },
    []
  );

  const loadOptions = useCallback(async (): Promise<void> => {
    try {
      setOptions(await getAdminScheduleFormOptions());
    } catch (loadError) {
      await signOutOnExpiry(loadError);
    }
  }, [signOutOnExpiry]);

  const loadSchedules = useCallback(
    async (
      nextPage = 1,
      mode: "replace" | "append" | "refresh" = "replace"
    ): Promise<void> => {
      const requestId = ++requestIdRef.current;
      if (mode === "append") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      if (mode !== "append") setError(null);

      try {
        const response = await getAdminScheduleReview(
          filters,
          nextPage
        );
        if (requestId !== requestIdRef.current) return;

        setItems((current) => {
          if (mode !== "append") return response.items;
          const existing = new Set(current.map((item) => item.id));
          return [
            ...current,
            ...response.items.filter((item) => !existing.has(item.id)),
          ];
        });
        setSummary(response.summary);
        setPage(response.page);
        setTotal(response.total);
        setTotalPages(response.totalPages);
      } catch (loadError) {
        if (requestId !== requestIdRef.current) return;
        if (await signOutOnExpiry(loadError)) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load schedules."
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [filters, signOutOnExpiry]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((current) => {
        const search = searchInput.trim();
        return current.search === search
          ? current
          : { ...current, search };
      });
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useFocusEffect(
    useCallback(() => {
      void loadSchedules();
    }, [loadSchedules])
  );

  const therapistOptions = useMemo<SelectOption[]>(
    () => [
      { id: "all", label: "All Therapists" },
      ...(options?.therapists.map((therapist) => ({
        description: `${therapist.todayAppointments} appointments today`,
        id: therapist.id,
        label: therapist.name,
      })) ?? []),
    ],
    [options]
  );
  const doctorOptions = useMemo<SelectOption[]>(
    () => [
      { id: "all", label: "All Doctors" },
      ...(options?.doctors.map((doctor) => ({
        description: doctor.specialization ?? undefined,
        id: doctor.id,
        label: doctor.name,
      })) ?? []),
    ],
    [options]
  );

  const activeFilterCount = [
    filters.therapistId,
    filters.doctorId,
    filters.priority,
    filters.fromDate,
    filters.toDate,
    filters.sort !== "time" ? filters.sort : null,
  ].filter(Boolean).length;
  const horizontalPadding = spacing.xxl;
  const availableWidth = width - horizontalPadding * 2;
  const summaryColumns = width >= 760 ? 4 : 2;
  const summaryCardWidth =
    (availableWidth - spacing.md * (summaryColumns - 1)) /
    summaryColumns;

  const selectView = useCallback((view: AdminScheduleView) => {
    setFilters((current) => ({ ...current, view }));
    setDraftFilters((current) => ({ ...current, view }));
  }, []);

  const applyFilters = useCallback(() => {
    if (
      !isValidDateRange(
        draftFilters.fromDate,
        draftFilters.toDate
      )
    ) {
      Alert.alert(
        "Invalid Date Range",
        "The end date must be on or after the start date."
      );
      return;
    }
    setFilters({ ...draftFilters, search: filters.search });
    setFiltersVisible(false);
  }, [draftFilters, filters.search]);

  const resetFilters = useCallback(() => {
    const reset = {
      ...createEmptyAdminScheduleFilters(),
      search: filters.search,
      view: filters.view,
    };
    setDraftFilters(reset);
    setFilters(reset);
    setFiltersVisible(false);
  }, [filters.search, filters.view]);

  const openDetails = useCallback((item: AdminScheduleReviewItem) => {
    router.push({
      pathname: "/(admin)/schedule-details",
      params: { id: String(item.id) },
    });
  }, []);

  const openEdit = useCallback((item: AdminScheduleReviewItem) => {
    router.push({
      pathname: "/(admin)/schedule-edit",
      params: { id: String(item.id) },
    });
  }, []);

  const openReschedule = useCallback(
    (item: AdminScheduleReviewItem) => {
      router.push({
        pathname: "/(admin)/schedule-edit",
        params: { id: String(item.id), reschedule: "1" },
      });
    },
    []
  );

  const confirmCancel = useCallback(
    (item: AdminScheduleReviewItem) => {
      Alert.alert(
        "Cancel Appointment?",
        `${item.patientName}'s appointment at ${item.startTime.slice(
          0,
          5
        )} will be cancelled.`,
        [
          { style: "cancel", text: "Keep Appointment" },
          {
            onPress: async () => {
              setActionId(item.id);
              try {
                await cancelAdminSchedule(item.id);
                await loadSchedules(1, "replace");
              } catch (cancelError) {
                if (await signOutOnExpiry(cancelError)) return;
                Alert.alert(
                  "Unable to Cancel",
                  cancelError instanceof Error
                    ? cancelError.message
                    : "Unable to cancel the appointment."
                );
              } finally {
                setActionId(null);
              }
            },
            style: "destructive",
            text: "Cancel Appointment",
          },
        ]
      );
    },
    [loadSchedules, signOutOnExpiry]
  );

  const renderItem = useCallback<
    ListRenderItem<AdminScheduleReviewItem>
  >(
    ({ item }) => (
      <AdminScheduleCard
        actionId={actionId}
        item={item}
        onCancel={confirmCancel}
        onEdit={openEdit}
        onReschedule={openReschedule}
        onView={openDetails}
      />
    ),
    [
      actionId,
      confirmCancel,
      openDetails,
      openEdit,
      openReschedule,
    ]
  );

  const listHeader = (
    <View style={styles.headerContent}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>Administration</Text>
          <Text style={styles.title}>Schedules</Text>
          <Text style={styles.subtitle}>
            Plan and monitor patient visits across the clinical team
          </Text>
          <Text style={styles.todayLabel}>{getLocalApiDate()}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Create schedule"
          accessibilityRole="button"
          activeOpacity={0.84}
          onPress={() => router.push("/(admin)/schedule-create")}
          style={styles.createButton}
        >
          <Ionicons color={colors.surface} name="add" size={20} />
          <Text style={styles.createButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      <ScheduleSummaryGrid
        cardWidth={summaryCardWidth}
        summary={summary}
      />

      <ScheduleViewTabs
        onChange={selectView}
        summary={summary}
        value={filters.view}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchGrow}>
          <ScheduleSearchBar
            onChangeText={setSearchInput}
            onClear={() => setSearchInput("")}
            value={searchInput}
          />
        </View>
        <TouchableOpacity
          accessibilityLabel={`Schedule filters${
            activeFilterCount
              ? `, ${activeFilterCount} active`
              : ""
          }`}
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => {
            setDraftFilters(filters);
            setFiltersVisible((current) => !current);
          }}
          style={[
            styles.filterButton,
            activeFilterCount ? styles.activeFilterButton : null,
          ]}
        >
          <Ionicons
            color={
              activeFilterCount ? colors.surface : colors.primary
            }
            name="options-outline"
            size={19}
          />
          {activeFilterCount ? (
            <Text style={styles.filterCount}>{activeFilterCount}</Text>
          ) : null}
        </TouchableOpacity>
      </View>

      {filtersVisible ? (
        <View style={styles.filterPanel}>
          <View style={styles.filterPanelHeader}>
            <View>
              <Text style={styles.filterTitle}>Schedule Filters</Text>
              <Text style={styles.filterSubtitle}>
                Narrow appointments without leaving the workflow
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close filters"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setFiltersVisible(false)}
            >
              <Ionicons
                color={colors.textMuted}
                name="close"
                size={22}
              />
            </TouchableOpacity>
          </View>
          <SearchableSelect
            accessibilityLabel="Filter by therapist"
            emptyMessage="No therapists found."
            icon="person-circle-outline"
            label="Therapist"
            onSelect={(option) =>
              setDraftFilters((current) => ({
                ...current,
                therapistId:
                  option.id === "all" ? null : Number(option.id),
              }))
            }
            options={therapistOptions}
            placeholder="All therapists"
            searchPlaceholder="Search therapists"
            selectedId={draftFilters.therapistId ?? "all"}
            title="Filter by Therapist"
          />
          <SearchableSelect
            accessibilityLabel="Filter by doctor"
            emptyMessage="No doctors found."
            icon="medical-outline"
            label="Doctor"
            onSelect={(option) =>
              setDraftFilters((current) => ({
                ...current,
                doctorId:
                  option.id === "all" ? null : Number(option.id),
              }))
            }
            options={doctorOptions}
            placeholder="All doctors"
            searchPlaceholder="Search doctors"
            selectedId={draftFilters.doctorId ?? "all"}
            title="Filter by Doctor"
          />
          <SearchableSelect
            accessibilityLabel="Filter by priority"
            emptyMessage="No priorities found."
            icon="alert-circle-outline"
            label="Priority"
            onSelect={(option) =>
              setDraftFilters((current) => ({
                ...current,
                priority:
                  option.id === "all"
                    ? null
                    : option.id === "high"
                      ? "high"
                      : "normal",
              }))
            }
            options={priorityOptions}
            placeholder="All priorities"
            searchPlaceholder="Search priorities"
            selectedId={draftFilters.priority ?? "all"}
            title="Filter by Priority"
          />
          <View style={styles.dateFields}>
            <View style={styles.dateField}>
              <AppDatePickerField
                allowClear
                label="From"
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    fromDate: value,
                  }))
                }
                placeholder="Start date"
                value={draftFilters.fromDate}
              />
            </View>
            <View style={styles.dateField}>
              <AppDatePickerField
                allowClear
                label="To"
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    toDate: value,
                  }))
                }
                placeholder="End date"
                value={draftFilters.toDate}
              />
            </View>
          </View>
          <SearchableSelect
            accessibilityLabel="Sort schedules"
            emptyMessage="No sort options found."
            icon="swap-vertical-outline"
            label="Sort"
            onSelect={(option) => {
              if (isScheduleSort(option.id)) {
                const sort = option.id;
                setDraftFilters((current) => ({
                  ...current,
                  sort,
                }));
              }
            }}
            options={sortOptions}
            placeholder="Appointment time"
            searchPlaceholder="Search sorting options"
            selectedId={draftFilters.sort}
            title="Sort Schedules"
          />
          <View style={styles.filterActions}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={resetFilters}
              style={styles.resetButton}
            >
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={applyFilters}
              style={styles.applyButton}
            >
              <Ionicons
                color={colors.surface}
                name="checkmark"
                size={18}
              />
              <Text style={styles.applyText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.resultsHeader}>
        <View>
          <Text style={styles.resultsTitle}>
            {filters.view.replace(/_/g, " ").replace(/\b\w/g, (c) =>
              c.toUpperCase()
            )}
          </Text>
          <Text style={styles.resultsSubtitle}>
            {total} {total === 1 ? "appointment" : "appointments"}
          </Text>
        </View>
        {summary.highPriorityToday ? (
          <View style={styles.prioritySummary}>
            <Ionicons
              color={colors.danger}
              name="alert-circle"
              size={15}
            />
            <Text style={styles.prioritySummaryText}>
              {summary.highPriorityToday} high priority today
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (loading && items.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.loadingPage}>
          <View style={styles.loadingHeader}>
            <View style={styles.loadingTitle} />
            <View style={styles.loadingSubtitle} />
          </View>
          <ScheduleListSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={error && items.length === 0 ? [] : items}
        initialNumToRender={6}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => String(item.id)}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons
                color={error ? colors.danger : colors.primary}
                name={
                  error ? "alert-circle-outline" : "calendar-outline"
                }
                size={34}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {error ? "Schedules unavailable" : "No appointments found"}
            </Text>
            <Text style={styles.emptyMessage}>
              {error ??
                "No appointments match this view and the active filters."}
            </Text>
            {error ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => void loadSchedules()}
                style={styles.retryButton}
              >
                <Ionicons
                  color={colors.surface}
                  name="refresh"
                  size={18}
                />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={colors.primary}
              style={styles.footerLoader}
            />
          ) : null
        }
        ListHeaderComponent={listHeader}
        maxToRenderPerBatch={8}
        onEndReached={() => {
          if (!loadingMore && page < totalPages) {
            void loadSchedules(page + 1, "append");
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void loadSchedules(1, "refresh")}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={50}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: {
    paddingBottom: spacing.screen,
    paddingHorizontal: spacing.xxl,
  },
  headerContent: { gap: spacing.xl, paddingVertical: spacing.xl },
  headingRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
  },
  headingText: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xxs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.body,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  todayLabel: {
    color: colors.textSubtle,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xs,
  },
  createButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  createButtonText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  searchGrow: { flex: 1 },
  filterButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  activeFilterButton: { backgroundColor: colors.primary },
  filterCount: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: typography.weight.extrabold,
    position: "absolute",
    right: 5,
    top: 3,
  },
  filterPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.xl,
  },
  filterPanelHeader: {
    alignItems: "flex-start",
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
  },
  filterTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  filterSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: 2,
  },
  dateFields: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  dateField: { flex: 1, flexBasis: 140 },
  filterActions: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "flex-end",
    marginTop: spacing.md,
  },
  resetButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  resetText: {
    color: colors.textSecondary,
    fontWeight: typography.weight.bold,
  },
  applyButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  applyText: {
    color: colors.surface,
    fontWeight: typography.weight.bold,
  },
  resultsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultsTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  resultsSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: 2,
  },
  prioritySummary: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  prioritySummaryText: {
    color: colors.danger,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  separator: { height: spacing.lg },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.screen,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 62,
    justifyContent: "center",
    width: 62,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: typography.size.body,
    lineHeight: 21,
    marginTop: spacing.sm,
    maxWidth: 360,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  retryText: {
    color: colors.surface,
    fontWeight: typography.weight.bold,
  },
  footerLoader: { marginVertical: spacing.xl },
  loadingPage: {
    flex: 1,
    gap: spacing.xxl,
    padding: spacing.xxl,
  },
  loadingHeader: { gap: spacing.sm, paddingVertical: spacing.lg },
  loadingTitle: {
    backgroundColor: colors.neutral150,
    borderRadius: radius.control,
    height: 28,
    width: 180,
  },
  loadingSubtitle: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 14,
    width: "72%",
  },
});
