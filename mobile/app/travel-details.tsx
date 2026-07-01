import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TravelSkeleton } from "../src/components/skeletons/ScreenSkeletons";
import { queryKeys } from "../src/query/queryKeys";
import { getApiErrorMessage } from "../src/services/errorHandler";
import {
  downloadTravelInvoice,
  getTravelById,
} from "../src/services/travelService";

const PRIMARY = colors.primary;

const parseTravelId = (
  value: string | string[] | undefined
): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue || !/^\d+$/.test(rawValue)) {
    return null;
  }

  const id = Number(rawValue);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const formatDate = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Date not available";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatLabel = (
  value: string | null | undefined
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Not available";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatAmount = (value: number): string =>
  `INR ${value.toFixed(2)}`;

const formatDistance = (value: number): string =>
  `${value.toFixed(value % 1 === 0 ? 0 : 1)} KM`;

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons color={PRIMARY} name={icon} size={19} />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function TravelDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const travelId = useMemo(
    () => parseTravelId(params.id),
    [params.id]
  );
  const travelQuery = useQuery({
    enabled: travelId !== null,
    queryKey:
      travelId === null
        ? ["travel", "detail", "invalid"]
        : queryKeys.travel.detail(travelId),
    queryFn: () => {
      if (travelId === null) {
        throw new Error("A valid travel ID is required.");
      }

      return getTravelById(travelId);
    },
  });
  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (travelId === null || !travelQuery.data?.invoice_file) {
        throw new Error("No invoice is attached to this travel entry.");
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("File sharing is unavailable on this device.");
      }

      const storedName =
        travelQuery.data.invoice_file.split(/[\\/]/).pop() ??
        `travel_${travelId}_invoice`;
      const invoice = await downloadTravelInvoice(
        travelId,
        storedName
      );

      try {
        await Sharing.shareAsync(invoice.uri, {
          dialogTitle: "Open Travel Invoice",
          mimeType: invoice.type || undefined,
        });
      } finally {
        try {
          if (invoice.exists) {
            invoice.delete();
          }
        } catch {
          // Temporary cleanup must not replace the sharing result.
        }
      }
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Open Invoice",
        getApiErrorMessage(
          error,
          "Unable to download this invoice."
        )
      );
    },
  });

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/travel");
    }
  };

  if (travelQuery.isPending && !travelQuery.data) {
    return <TravelSkeleton />;
  }

  const travel = travelQuery.data;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={styles.safeArea}
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.headerButton}
          onPress={handleBack}
        >
          <Ionicons
            color={colors.textStrong}
            name="arrow-back"
            size={23}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Travel Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      {travelId === null ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Invalid travel entry</Text>
          <Text style={styles.stateText}>
            A valid travel ID is required.
          </Text>
        </View>
      ) : travelQuery.error && !travel ? (
        <View style={styles.centerState}>
          <View style={styles.errorIcon}>
            <Ionicons
              color={colors.danger}
              name="alert-circle-outline"
              size={28}
            />
          </View>
          <Text style={styles.stateTitle}>Unable to load travel</Text>
          <Text style={styles.stateText}>
            {getApiErrorMessage(
              travelQuery.error,
              "Unable to load this travel entry."
            )}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => void travelQuery.refetch()}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : travel ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[PRIMARY]}
              refreshing={
                travelQuery.isRefetching && !travelQuery.isPending
              }
              tintColor={PRIMARY}
              onRefresh={() => void travelQuery.refetch()}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.overview}>
            <View>
              <Text style={styles.eyebrow}>Travel Date</Text>
              <Text style={styles.travelDate}>
                {formatDate(travel.travel_date)}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {formatLabel(travel.status)}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Route</Text>
          <View style={styles.card}>
            <DetailRow
              icon="radio-button-on-outline"
              label="From"
              value={travel.from_address}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="location-outline"
              label="To"
              value={travel.to_address}
            />
          </View>

          <Text style={styles.sectionTitle}>Travel Summary</Text>
          <View style={styles.card}>
            <DetailRow
              icon="person-outline"
              label="Patient"
              value={travel.patient_name ?? "Not recorded"}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="car-outline"
              label="Transport Mode"
              value={formatLabel(travel.transport_mode)}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="checkmark-circle-outline"
              label="Patient Visited"
              value={travel.patient_visited ? "Yes" : "No"}
            />
          </View>

          <Text style={styles.sectionTitle}>Distance and Fare</Text>
          <View style={styles.metricCard}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricValue}>
                {formatDistance(travel.total_km)}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Per KM Rate</Text>
              <Text style={styles.metricValue}>
                {formatAmount(travel.per_km_rate)}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Travel Fare</Text>
              <Text style={styles.totalValue}>
                {formatAmount(travel.travel_fare)}
              </Text>
            </View>
          </View>

          {travel.transport_mode.toLowerCase() !== "vehicle" ? (
            <>
              <Text style={styles.sectionTitle}>Invoice</Text>
              <View style={styles.card}>
                <DetailRow
                  icon="cash-outline"
                  label="Bill Amount"
                  value={formatAmount(travel.bill_amount ?? 0)}
                />

                {travel.invoice_file ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: invoiceMutation.isPending,
                    }}
                    disabled={invoiceMutation.isPending}
                    style={styles.invoiceButton}
                    onPress={() => invoiceMutation.mutate()}
                  >
                    {invoiceMutation.isPending ? (
                      <ActivityIndicator
                        color={PRIMARY}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        color={PRIMARY}
                        name="document-text-outline"
                        size={20}
                      />
                    )}
                    <Text style={styles.invoiceButtonText}>
                      {invoiceMutation.isPending
                        ? "Downloading..."
                        : "Open Invoice"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noInvoiceText}>
                    No invoice is attached.
                  </Text>
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Travel unavailable</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: spacing.xl,
  },
  headerButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  overview: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  travelDate: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  statusBadge: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  statusText: {
    color: PRIMARY,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xxl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
  },
  detailIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    lineHeight: typography.lineHeight.bodyLarge,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xxl,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  metricRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.semibold,
  },
  metricValue: {
    color: colors.textStrong,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
  totalValue: {
    color: PRIMARY,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  invoiceButton: {
    alignItems: "center",
    borderColor: PRIMARY,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 50,
  },
  invoiceButtonText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  noInvoiceText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    marginTop: spacing.lg,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.section,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 54,
  },
  stateTitle: {
    color: colors.textStrong,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
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
