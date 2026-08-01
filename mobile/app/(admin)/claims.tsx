import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AdminClaimReviewCard,
  ClaimSearchBar,
  ClaimStatusFilters,
  ClaimSummaryGrid,
} from "../../src/components/claims/AdminClaimReviewUi";
import {
  DateTimeField,
  SearchableSelect,
  type SelectOption,
} from "../../src/components/schedule/ScheduleFormControls";
import { ClaimsSkeleton } from "../../src/components/skeletons/ScreenSkeletons";
import {
  AdminClaimServiceError,
  adminClaimSortOptions,
  approveAdminClaim,
  createEmptyAdminClaimFilters,
  getAdminClaimReview,
  rejectAdminClaim,
} from "../../src/services/adminClaimService";
import {
  getTherapists,
  TherapistServiceError,
} from "../../src/services/therapistService";
import type {
  AdminClaimReviewFilters,
  AdminClaimReviewItem,
  AdminClaimReviewSummary,
  AdminClaimSort,
  AdminClaimStatus,
} from "../../src/types/adminClaimReview";
import { formatScheduleDate } from "../../src/utils/scheduleForm";
import { clearAuthSession } from "../../src/utils/storage";

const PRIMARY = colors.primary;
const TABLET_BREAKPOINT = 760;
const PAGE_SIZE = 20;

type ClaimAction = "approve" | "reject";
type LoadMode = "initial" | "refresh" | "filter" | "append" | "action";

interface ActiveAction {
  claimId: number;
  type: ClaimAction;
}

interface AdvancedFilterForm {
  fromDate: Date | null;
  maximumAmount: number | null;
  maximumDistance: number | null;
  minimumAmount: number | null;
  minimumDistance: number | null;
  sort: AdminClaimSort;
  therapistId: number | null;
  therapistName: string | null;
  toDate: Date | null;
}

const emptySummary: AdminClaimReviewSummary = {
  averageClaimAmount: 0,
  averageDistance: 0,
  highValueClaims: 0,
  pendingAmount: 0,
  pendingClaims: 0,
  todaysClaims: 0,
};

const createAdvancedFilterForm = (): AdvancedFilterForm => ({
  fromDate: null,
  maximumAmount: null,
  maximumDistance: null,
  minimumAmount: null,
  minimumDistance: null,
  sort: "newest",
  therapistId: null,
  therapistName: null,
  toDate: null,
});

const parseOptionalNumber = (value: string): number | null => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "Unable to manage claims.";

const isAdminClaimSort = (
  value: SelectOption["id"]
): value is AdminClaimSort =>
  value === "newest" ||
  value === "oldest" ||
  value === "highest_amount" ||
  value === "lowest_amount" ||
  value === "longest_distance" ||
  value === "therapist_name";

const getActiveAdvancedFilterCount = (
  filters: AdminClaimReviewFilters
): number =>
  [
    filters.therapistId !== null,
    filters.fromDate !== null,
    filters.toDate !== null,
    filters.minimumAmount !== null,
    filters.maximumAmount !== null,
    filters.minimumDistance !== null,
    filters.maximumDistance !== null,
    filters.sort !== "newest",
  ].filter(Boolean).length;

const keyExtractor = (item: AdminClaimReviewItem): string =>
  String(item.id);

const ListSeparator = () => <View style={styles.separator} />;

export default function AdminClaimsScreen() {
  const { width } = useWindowDimensions();
  const [claims, setClaims] = useState<AdminClaimReviewItem[]>([]);
  const [summary, setSummary] =
    useState<AdminClaimReviewSummary>(emptySummary);
  const [filters, setFilters] = useState<AdminClaimReviewFilters>(
    createEmptyAdminClaimFilters
  );
  const [advancedFilters, setAdvancedFilters] =
    useState<AdvancedFilterForm>(createAdvancedFilterForm);
  const [searchText, setSearchText] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [therapistOptions, setTherapistOptions] = useState<
    SelectOption[]
  >([]);
  const [therapistsLoading, setTherapistsLoading] = useState(true);
  const [therapistError, setTherapistError] = useState<string | null>(
    null
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] =
    useState<ActiveAction | null>(null);
  const filtersRef = useRef(filters);
  const requestIdRef = useRef(0);
  const actionInFlightRef = useRef(false);

  const handleSessionExpiry = useCallback(
    async (requestError: unknown): Promise<boolean> => {
      if (
        (requestError instanceof AdminClaimServiceError ||
          requestError instanceof TherapistServiceError) &&
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

  const loadClaims = useCallback(
    async (
      nextFilters: AdminClaimReviewFilters,
      nextPage: number,
      mode: LoadMode
    ): Promise<boolean> => {
      const requestId = ++requestIdRef.current;

      if (mode === "initial") {
        setLoading(true);
      } else if (mode === "refresh") {
        setRefreshing(true);
      } else if (mode === "append") {
        setLoadingMore(true);
      } else if (mode === "filter") {
        setFiltering(true);
      }

      if (mode !== "append") {
        setError(null);
      }

      try {
        const response = await getAdminClaimReview(
          nextFilters,
          nextPage,
          PAGE_SIZE
        );

        if (requestId !== requestIdRef.current) {
          return false;
        }

        setClaims((current) =>
          mode === "append"
            ? [
                ...current,
                ...response.items.filter(
                  (item) =>
                    !current.some(
                      (existing) => existing.id === item.id
                    )
                ),
              ]
            : response.items
        );
        setSummary(response.summary);
        setPage(response.page);
        setTotalPages(response.totalPages);
        setTotal(response.total);
        setError(null);
        return true;
      } catch (loadError) {
        if (requestId !== requestIdRef.current) {
          return false;
        }
        if (await handleSessionExpiry(loadError)) {
          return false;
        }

        const message = getErrorMessage(loadError);
        if (mode === "append" || mode === "refresh") {
          Alert.alert("Unable to Refresh Claims", message);
        } else {
          setError(message);
        }
        return false;
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setFiltering(false);
          setLoadingMore(false);
        }
      }
    },
    [handleSessionExpiry]
  );

  useFocusEffect(
    useCallback(() => {
      void loadClaims(filtersRef.current, 1, "initial");
    }, [loadClaims])
  );

  const loadTherapists = useCallback(async (): Promise<void> => {
    setTherapistsLoading(true);
    setTherapistError(null);

    try {
      const therapists = await getTherapists();
      setTherapistOptions(
        [
          { id: "all", label: "All Therapists" },
          ...therapists.map((therapist) => ({
            description: therapist.email,
            id: therapist.id,
            label: therapist.username,
          })),
        ]
      );
    } catch (loadError) {
      if (await handleSessionExpiry(loadError)) {
        return;
      }
      setTherapistError(getErrorMessage(loadError));
    } finally {
      setTherapistsLoading(false);
    }
  }, [handleSessionExpiry]);

  useEffect(() => {
    void loadTherapists();
  }, [loadTherapists]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const normalizedSearch = searchText.trim();
      if (normalizedSearch === filtersRef.current.search) {
        return;
      }

      const nextFilters = {
        ...filtersRef.current,
        search: normalizedSearch,
      };
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      void loadClaims(nextFilters, 1, "filter");
    }, 350);

    return () => clearTimeout(timeout);
  }, [loadClaims, searchText]);

  const applyStatus = useCallback(
    (status: AdminClaimStatus) => {
      const nextFilters = {
        ...filtersRef.current,
        status,
      };
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      void loadClaims(nextFilters, 1, "filter");
    },
    [loadClaims]
  );

  const applyAdvancedFilters = useCallback(() => {
    if (
      advancedFilters.fromDate &&
      advancedFilters.toDate &&
      advancedFilters.toDate < advancedFilters.fromDate
    ) {
      setFilterError("To date cannot be before from date.");
      return;
    }
    if (
      advancedFilters.minimumAmount !== null &&
      advancedFilters.maximumAmount !== null &&
      advancedFilters.minimumAmount > advancedFilters.maximumAmount
    ) {
      setFilterError(
        "Maximum amount cannot be below minimum amount."
      );
      return;
    }
    if (
      advancedFilters.minimumDistance !== null &&
      advancedFilters.maximumDistance !== null &&
      advancedFilters.minimumDistance >
        advancedFilters.maximumDistance
    ) {
      setFilterError(
        "Maximum distance cannot be below minimum distance."
      );
      return;
    }

    const nextFilters: AdminClaimReviewFilters = {
      ...filtersRef.current,
      fromDate: advancedFilters.fromDate
        ? formatScheduleDate(advancedFilters.fromDate)
        : null,
      maximumAmount: advancedFilters.maximumAmount,
      maximumDistance: advancedFilters.maximumDistance,
      minimumAmount: advancedFilters.minimumAmount,
      minimumDistance: advancedFilters.minimumDistance,
      sort: advancedFilters.sort,
      therapistId: advancedFilters.therapistId,
      therapistName: advancedFilters.therapistName,
      toDate: advancedFilters.toDate
        ? formatScheduleDate(advancedFilters.toDate)
        : null,
    };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    setFilterError(null);
    setFiltersExpanded(false);
    void loadClaims(nextFilters, 1, "filter");
  }, [advancedFilters, loadClaims]);

  const resetFilters = useCallback(() => {
    const emptyFilters = createEmptyAdminClaimFilters();
    filtersRef.current = emptyFilters;
    setFilters(emptyFilters);
    setAdvancedFilters(createAdvancedFilterForm());
    setSearchText("");
    setFilterError(null);
    setFiltersExpanded(false);
    void loadClaims(emptyFilters, 1, "filter");
  }, [loadClaims]);

  const performAction = useCallback(
    async (
      claim: AdminClaimReviewItem,
      action: ClaimAction
    ): Promise<void> => {
      if (actionInFlightRef.current) {
        return;
      }

      actionInFlightRef.current = true;
      setActiveAction({ claimId: claim.id, type: action });

      try {
        if (action === "approve") {
          await approveAdminClaim(claim.id);
        } else {
          await rejectAdminClaim(claim.id);
        }

        await loadClaims(filtersRef.current, 1, "action");
        Alert.alert(
          action === "approve" ? "Claim Approved" : "Claim Rejected",
          `Claim #${claim.id} from ${claim.therapistName} was ${
            action === "approve" ? "approved" : "rejected"
          }.`
        );
      } catch (actionError) {
        if (await handleSessionExpiry(actionError)) {
          return;
        }
        Alert.alert(
          action === "approve"
            ? "Unable to Approve Claim"
            : "Unable to Reject Claim",
          getErrorMessage(actionError)
        );
      } finally {
        actionInFlightRef.current = false;
        setActiveAction(null);
      }
    },
    [handleSessionExpiry, loadClaims]
  );

  const confirmAction = useCallback(
    (claim: AdminClaimReviewItem, action: ClaimAction) => {
      const approving = action === "approve";
      Alert.alert(
        approving ? "Approve Claim?" : "Reject Claim?",
        `${approving ? "Approve" : "Reject"} claim #${claim.id} for ${claim.therapistName}?`,
        [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => void performAction(claim, action),
            style: approving ? "default" : "destructive",
            text: approving ? "Approve" : "Reject",
          },
        ]
      );
    },
    [performAction]
  );

  const viewDetails = useCallback((claim: AdminClaimReviewItem) => {
    router.push({
      pathname: "/(admin)/claim-details",
      params: { id: String(claim.id) },
    });
  }, []);

  const renderClaim = useCallback<
    ListRenderItem<AdminClaimReviewItem>
  >(
    ({ item }) => (
      <AdminClaimReviewCard
        actionDisabled={activeAction !== null}
        approving={
          activeAction?.claimId === item.id &&
          activeAction.type === "approve"
        }
        claim={item}
        onAction={confirmAction}
        onViewDetails={viewDetails}
        rejecting={
          activeAction?.claimId === item.id &&
          activeAction.type === "reject"
        }
      />
    ),
    [activeAction, confirmAction, viewDetails]
  );

  const loadNextPage = useCallback(() => {
    if (
      !loadingMore &&
      !loading &&
      !filtering &&
      page < totalPages
    ) {
      void loadClaims(filtersRef.current, page + 1, "append");
    }
  }, [
    filtering,
    loadClaims,
    loading,
    loadingMore,
    page,
    totalPages,
  ]);

  const advancedFilterCount =
    getActiveAdvancedFilterCount(filters);
  const summaryCardWidth =
    width >= TABLET_BREAKPOINT ? "23.5%" : "48%";
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const sortOptions: SelectOption[] = adminClaimSortOptions.map(
    (option) => ({
      id: option.value,
      label: option.label,
    })
  );
  const activeSortLabel =
    adminClaimSortOptions.find(
      (option) => option.value === filters.sort
    )?.label ?? "Newest";

  const listHeader = (
    <>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>Administration</Text>
          <Text style={styles.title}>Claims</Text>
          <Text style={styles.subtitle}>
            Review and process therapist travel claims
          </Text>
        </View>
        <Text style={styles.today}>{todayLabel}</Text>
      </View>

      <ClaimSummaryGrid
        cardWidth={summaryCardWidth}
        summary={summary}
      />

      <ClaimSearchBar
        onChangeText={setSearchText}
        value={searchText}
      />
      <ClaimStatusFilters
        onChange={applyStatus}
        value={filters.status}
      />

      <TouchableOpacity
        accessibilityLabel={
          filtersExpanded
            ? "Collapse advanced claim filters"
            : "Expand advanced claim filters"
        }
        accessibilityRole="button"
        accessibilityState={{ expanded: filtersExpanded }}
        activeOpacity={0.82}
        onPress={() =>
          setFiltersExpanded((current) => !current)
        }
        style={styles.filterToggle}
      >
        <Ionicons color={PRIMARY} name="options-outline" size={19} />
        <Text style={styles.filterToggleText}>Filters and sorting</Text>
        <Text numberOfLines={1} style={styles.sortSummary}>
          {activeSortLabel}
        </Text>
        {advancedFilterCount ? (
          <View style={styles.filterCount}>
            <Text style={styles.filterCountText}>
              {advancedFilterCount}
            </Text>
          </View>
        ) : null}
        <Ionicons
          color={colors.textMuted}
          name={filtersExpanded ? "chevron-up" : "chevron-down"}
          size={18}
        />
      </TouchableOpacity>

      {filtersExpanded ? (
        <View style={styles.advancedPanel}>
          <DateTimeField
            label="From Date"
            mode="date"
            onChange={(value) => {
              setAdvancedFilters((current) => ({
                ...current,
                fromDate: value,
              }));
              setFilterError(null);
            }}
            placeholder="Any start date"
            value={advancedFilters.fromDate}
          />
          <DateTimeField
            label="To Date"
            minimumDate={advancedFilters.fromDate ?? undefined}
            mode="date"
            onChange={(value) => {
              setAdvancedFilters((current) => ({
                ...current,
                toDate: value,
              }));
              setFilterError(null);
            }}
            placeholder="Any end date"
            value={advancedFilters.toDate}
          />

          {therapistsLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={PRIMARY} size="small" />
              <Text style={styles.inlineLoadingText}>
                Loading therapists...
              </Text>
            </View>
          ) : therapistError ? (
            <TouchableOpacity
              accessibilityLabel="Retry loading therapists"
              accessibilityRole="button"
              onPress={() => void loadTherapists()}
              style={styles.inlineError}
            >
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={18}
              />
              <Text style={styles.inlineErrorText}>
                {therapistError} Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : (
            <SearchableSelect
              accessibilityLabel="Select therapist claim filter"
              emptyMessage="No therapists found."
              icon="person-outline"
              label="Therapist"
              onSelect={(option) => {
                if (option.id === "all") {
                  setAdvancedFilters((current) => ({
                    ...current,
                    therapistId: null,
                    therapistName: null,
                  }));
                  return;
                }
                const therapistId =
                  typeof option.id === "number"
                    ? option.id
                    : Number(option.id);
                if (!Number.isSafeInteger(therapistId)) {
                  return;
                }
                setAdvancedFilters((current) => ({
                  ...current,
                  therapistId,
                  therapistName: option.label,
                }));
              }}
              options={therapistOptions}
              placeholder="All therapists"
              searchPlaceholder="Search therapists"
              selectedId={advancedFilters.therapistId}
              title="Select Therapist"
            />
          )}

          <View style={styles.rangeRow}>
            <View style={styles.rangeField}>
              <Text style={styles.inputLabel}>Min Amount</Text>
              <TextInput
                accessibilityLabel="Minimum claim amount"
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setAdvancedFilters((current) => ({
                    ...current,
                    minimumAmount: parseOptionalNumber(value),
                  }))
                }
                placeholder="0"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                value={
                  advancedFilters.minimumAmount?.toString() ?? ""
                }
              />
            </View>
            <View style={styles.rangeField}>
              <Text style={styles.inputLabel}>Max Amount</Text>
              <TextInput
                accessibilityLabel="Maximum claim amount"
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setAdvancedFilters((current) => ({
                    ...current,
                    maximumAmount: parseOptionalNumber(value),
                  }))
                }
                placeholder="Any"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                value={
                  advancedFilters.maximumAmount?.toString() ?? ""
                }
              />
            </View>
          </View>

          <View style={styles.rangeRow}>
            <View style={styles.rangeField}>
              <Text style={styles.inputLabel}>Min Distance</Text>
              <TextInput
                accessibilityLabel="Minimum claim distance"
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setAdvancedFilters((current) => ({
                    ...current,
                    minimumDistance: parseOptionalNumber(value),
                  }))
                }
                placeholder="0 km"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                value={
                  advancedFilters.minimumDistance?.toString() ?? ""
                }
              />
            </View>
            <View style={styles.rangeField}>
              <Text style={styles.inputLabel}>Max Distance</Text>
              <TextInput
                accessibilityLabel="Maximum claim distance"
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setAdvancedFilters((current) => ({
                    ...current,
                    maximumDistance: parseOptionalNumber(value),
                  }))
                }
                placeholder="Any"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                value={
                  advancedFilters.maximumDistance?.toString() ?? ""
                }
              />
            </View>
          </View>

          <SearchableSelect
            accessibilityLabel="Select claim sort order"
            emptyMessage="No sort options found."
            icon="swap-vertical-outline"
            label="Sort By"
            onSelect={(option) => {
              if (!isAdminClaimSort(option.id)) {
                return;
              }
              const nextSort = option.id;
              setAdvancedFilters((current) => ({
                ...current,
                sort: nextSort,
              }));
            }}
            options={sortOptions}
            placeholder="Newest"
            searchPlaceholder="Search sort options"
            selectedId={advancedFilters.sort}
            title="Sort Claims"
          />

          {filterError ? (
            <View style={styles.filterError}>
              <Ionicons
                color={colors.danger}
                name="alert-circle-outline"
                size={17}
              />
              <Text style={styles.filterErrorText}>{filterError}</Text>
            </View>
          ) : null}

          <View style={styles.filterActions}>
            <TouchableOpacity
              accessibilityLabel="Reset all claim filters"
              accessibilityRole="button"
              activeOpacity={0.82}
              disabled={filtering}
              onPress={resetFilters}
              style={styles.resetButton}
            >
              <Ionicons color={PRIMARY} name="refresh" size={18} />
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Apply claim filters"
              accessibilityRole="button"
              accessibilityState={{ busy: filtering }}
              activeOpacity={0.82}
              disabled={filtering}
              onPress={applyAdvancedFilters}
              style={styles.applyButton}
            >
              {filtering ? (
                <ActivityIndicator
                  color={colors.surface}
                  size="small"
                />
              ) : (
                <Ionicons
                  color={colors.surface}
                  name="funnel"
                  size={18}
                />
              )}
              <Text style={styles.applyButtonText}>
                {filtering ? "Applying..." : "Apply"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.listTitleRow}>
        <View>
          <Text style={styles.listTitle}>Claims for review</Text>
          <Text style={styles.listSubtitle}>
            {total} {total === 1 ? "claim" : "claims"} matched
          </Text>
        </View>
        {filtering && !loading ? (
          <ActivityIndicator color={PRIMARY} size="small" />
        ) : null}
      </View>
    </>
  );

  if (loading && claims.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ClaimsSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[
          styles.content,
          claims.length === 0 ? styles.emptyContent : null,
        ]}
        data={error ? [] : claims}
        initialNumToRender={5}
        ItemSeparatorComponent={ListSeparator}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          error ? (
            <View style={styles.stateCard}>
              <View style={styles.errorIcon}>
                <Ionicons
                  color={colors.danger}
                  name="alert-circle-outline"
                  size={27}
                />
              </View>
              <Text style={styles.stateTitle}>Claims unavailable</Text>
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity
                accessibilityLabel="Retry loading claims"
                accessibilityRole="button"
                onPress={() =>
                  void loadClaims(
                    filtersRef.current,
                    1,
                    "initial"
                  )
                }
                style={styles.retryButton}
              >
                <Ionicons
                  color={colors.surface}
                  name="refresh"
                  size={18}
                />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  color={colors.greenDark}
                  name="checkmark-done-outline"
                  size={28}
                />
              </View>
              <Text style={styles.stateTitle}>
                {filters.status === "pending"
                  ? "No pending claims"
                  : "No matching claims"}
              </Text>
              <Text style={styles.stateText}>
                {filters.status === "pending"
                  ? "All submitted claims have been reviewed. New therapist claims will appear here automatically."
                  : "Adjust the search or filters to view more claims."}
              </Text>
              {getActiveAdvancedFilterCount(filters) ||
              filters.search ||
              filters.status !== "pending" ? (
                <TouchableOpacity
                  accessibilityLabel="Reset claim filters"
                  accessibilityRole="button"
                  onPress={resetFilters}
                  style={styles.emptyResetButton}
                >
                  <Text style={styles.emptyResetText}>Reset filters</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color={PRIMARY} size="small" />
              <Text style={styles.footerLoadingText}>
                Loading more claims...
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={listHeader}
        maxToRenderPerBatch={6}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            colors={[PRIMARY]}
            onRefresh={() =>
              void loadClaims(
                filtersRef.current,
                1,
                "refresh"
              )
            }
            refreshing={refreshing}
            tintColor={PRIMARY}
          />
        }
        removeClippedSubviews
        renderItem={renderClaim}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: spacing.sectionLg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  heading: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xlPlus,
  },
  headingText: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
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
  today: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
    maxWidth: 94,
    textAlign: "right",
  },
  filterToggle: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  filterToggleText: {
    color: colors.textSecondary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  sortSummary: {
    color: colors.textMuted,
    flex: 1,
    fontSize: typography.size.small,
    textAlign: "right",
  },
  filterCount: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 24,
    justifyContent: "center",
    minWidth: 24,
  },
  filterCountText: {
    color: colors.primaryDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
  },
  advancedPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.xl,
    elevation: shadows.elevation.low,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y1,
    shadowOpacity: shadows.opacity.subtle,
    shadowRadius: shadows.radius.s5,
  },
  inlineLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
    minHeight: 48,
  },
  inlineLoadingText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
  },
  inlineError: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
    minHeight: 48,
    padding: spacing.lg,
  },
  inlineErrorText: {
    color: colors.dangerDark,
    flex: 1,
    fontSize: typography.size.small,
  },
  rangeRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  rangeField: {
    flex: 1,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  filterError: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.mdPlus,
  },
  filterErrorText: {
    color: colors.dangerDark,
    flex: 1,
    fontSize: typography.size.small,
  },
  filterActions: {
    flexDirection: "row",
    gap: spacing.mdPlus,
    marginTop: spacing.xs,
  },
  resetButton: {
    alignItems: "center",
    borderColor: PRIMARY,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 48,
  },
  resetButtonText: {
    color: PRIMARY,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  applyButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 48,
  },
  applyButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  listTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    marginTop: spacing.section,
  },
  listTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  listSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  separator: {
    height: spacing.lg,
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 260,
    padding: spacing.section,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.greenSurface,
    borderRadius: radius.control,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xl,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.md,
    maxWidth: 360,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 46,
    paddingHorizontal: spacing.xl,
  },
  retryText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  emptyResetButton: {
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 44,
  },
  emptyResetText: {
    color: PRIMARY,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  footerLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 72,
  },
  footerLoadingText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
  },
});
