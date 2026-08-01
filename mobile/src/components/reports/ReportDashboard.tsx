import { Ionicons } from "@expo/vector-icons";
import { memo, useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type DimensionValue,
} from "react-native";

import { colors, radius, shadows, spacing, typography } from "../../theme";
import type {
  AdminReportSummary,
  ReportActivity,
  ReportInsight,
} from "../../types/adminReport";
import SkeletonPlaceholder from "../skeletons/SkeletonPlaceholder";
import {
  ClaimStatusDonut,
  TherapistPerformanceChart,
  TreatmentTrendChart,
  TravelTrendChart,
} from "./ReportCharts";

const TABLET_BREAKPOINT = 760;
const PRIMARY = colors.primary;

interface ReportDashboardProps {
  filtersActive: boolean;
  onClearFilters: () => void;
  summary: AdminReportSummary;
}

interface ReportExportPanelProps {
  csvExporting: boolean;
  disabled: boolean;
  onExportCsv: () => void;
  onExportPdf: () => void;
  pdfExporting: boolean;
}

interface KpiDefinition {
  backgroundColor: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  period: string;
  value: string;
}

const formatNumber = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
  }).format(value);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const formatActivityDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));

const formatStatus = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getActivityIcon = (
  activityType: ReportActivity["activityType"]
): keyof typeof Ionicons.glyphMap => {
  if (activityType === "claim") {
    return "receipt-outline";
  }
  if (activityType === "travel") {
    return "navigate-outline";
  }
  return "medkit-outline";
};

const getActivityColor = (
  activityType: ReportActivity["activityType"]
) => {
  if (activityType === "claim") {
    return {
      backgroundColor: colors.purpleSurface,
      color: colors.purple,
    };
  }
  if (activityType === "travel") {
    return {
      backgroundColor: colors.tealSurface,
      color: colors.teal,
    };
  }
  return {
    backgroundColor: colors.blueSurface,
    color: colors.blueDark,
  };
};

const getStatusStyle = (status: string) => {
  const normalized = status.toLocaleLowerCase();

  if (
    normalized === "approved" ||
    normalized === "completed" ||
    normalized === "submitted"
  ) {
    return {
      backgroundColor: colors.greenSurface,
      color: colors.greenDark,
    };
  }
  if (
    normalized === "rejected" ||
    normalized === "cancelled"
  ) {
    return {
      backgroundColor: colors.dangerSurfaceStrong,
      color: colors.dangerDark,
    };
  }
  return {
    backgroundColor: colors.warningSurface,
    color: colors.warningDark,
  };
};

const SectionHeading = ({
  caption,
  title,
}: {
  caption?: string;
  title: string;
}) => (
  <View style={styles.sectionHeading}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
  </View>
);

const KpiCard = memo(
  ({
    item,
    width,
  }: {
    item: KpiDefinition;
    width: DimensionValue;
  }) => (
    <View
      accessibilityLabel={`${item.label}: ${item.value}. ${item.period}`}
      accessible
      style={[styles.kpiCard, { width }]}
    >
      <View
        style={[
          styles.kpiIcon,
          { backgroundColor: item.backgroundColor },
        ]}
      >
        <Ionicons color={item.color} name={item.icon} size={20} />
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.kpiValue}>
        {item.value}
      </Text>
      <Text numberOfLines={2} style={styles.kpiLabel}>
        {item.label}
      </Text>
      <Text numberOfLines={1} style={styles.kpiPeriod}>
        {item.period}
      </Text>
    </View>
  )
);

KpiCard.displayName = "KpiCard";

const ChartCard = ({
  children,
  subtitle,
  title,
  width,
}: {
  children: ReactNode;
  subtitle: string;
  title: string;
  width: DimensionValue;
}) => (
  <View style={[styles.chartCard, { width }]}>
    <Text style={styles.chartTitle}>{title}</Text>
    <Text style={styles.chartSubtitle}>{subtitle}</Text>
    <View style={styles.chartContent}>{children}</View>
  </View>
);

const InsightCard = memo(({ insight }: { insight: ReportInsight }) => {
  const isChangeAvailable = insight.changePercent !== null;
  const directionColor =
    insight.direction === "up"
      ? colors.greenDark
      : insight.direction === "down"
        ? colors.danger
        : colors.textMuted;
  const directionIcon =
    insight.direction === "up"
      ? "trending-up"
      : insight.direction === "down"
        ? "trending-down"
        : "remove";

  return (
    <View
      accessibilityLabel={`${insight.title}: ${insight.value}. ${insight.detail}`}
      accessible
      style={styles.insightCard}
    >
      <View style={styles.insightTopRow}>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        {isChangeAvailable ? (
          <View style={styles.changeBadge}>
            <Ionicons
              color={directionColor}
              name={directionIcon}
              size={15}
            />
            <Text style={[styles.changeText, { color: directionColor }]}>
              {Math.abs(insight.changePercent ?? 0)}%
            </Text>
          </View>
        ) : null}
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.insightValue}>
        {insight.value}
      </Text>
      <Text style={styles.insightDetail}>{insight.detail}</Text>
    </View>
  );
});

InsightCard.displayName = "InsightCard";

export const ReportExportPanel = memo(
  ({
    csvExporting,
    disabled,
    onExportCsv,
    onExportPdf,
    pdfExporting,
  }: ReportExportPanelProps) => (
    <View style={styles.exportPanel}>
      <View style={styles.exportHeading}>
        <View style={styles.exportHeadingIcon}>
          <Ionicons
            color={colors.primaryDark}
            name="download-outline"
            size={21}
          />
        </View>
        <View style={styles.exportHeadingText}>
          <Text style={styles.exportTitle}>Export report</Text>
          <Text style={styles.exportSubtitle}>
            Uses the currently applied filters
          </Text>
        </View>
      </View>
      <View style={styles.exportActions}>
        <TouchableOpacity
          accessibilityLabel="Export filtered report as CSV"
          accessibilityRole="button"
          accessibilityState={{ busy: csvExporting, disabled }}
          activeOpacity={0.82}
          disabled={disabled}
          onPress={onExportCsv}
          style={[
            styles.exportButton,
            disabled ? styles.disabledControl : null,
          ]}
        >
          {csvExporting ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons
              color={colors.surface}
              name="grid-outline"
              size={18}
            />
          )}
          <Text style={styles.exportButtonText}>
            {csvExporting ? "Preparing..." : "CSV"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Export filtered report as PDF"
          accessibilityRole="button"
          accessibilityState={{ busy: pdfExporting, disabled }}
          activeOpacity={0.82}
          disabled={disabled}
          onPress={onExportPdf}
          style={[
            styles.exportButton,
            styles.pdfButton,
            disabled ? styles.disabledControl : null,
          ]}
        >
          {pdfExporting ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons
              color={colors.surface}
              name="document-text-outline"
              size={18}
            />
          )}
          <Text style={styles.exportButtonText}>
            {pdfExporting ? "Preparing..." : "PDF"}
          </Text>
        </TouchableOpacity>
        <View
          accessibilityLabel="Excel export is planned"
          accessibilityState={{ disabled: true }}
          style={[styles.futureExport, styles.disabledControl]}
        >
          <Ionicons
            color={colors.textMuted}
            name="apps-outline"
            size={18}
          />
          <Text style={styles.futureExportText}>Excel</Text>
          <Text style={styles.futureLabel}>Soon</Text>
        </View>
        <View
          accessibilityLabel="Print export is planned"
          accessibilityState={{ disabled: true }}
          style={[styles.futureExport, styles.disabledControl]}
        >
          <Ionicons
            color={colors.textMuted}
            name="print-outline"
            size={18}
          />
          <Text style={styles.futureExportText}>Print</Text>
          <Text style={styles.futureLabel}>Soon</Text>
        </View>
      </View>
    </View>
  )
);

ReportExportPanel.displayName = "ReportExportPanel";

export const ReportDashboard = memo(
  ({
    filtersActive,
    onClearFilters,
    summary,
  }: ReportDashboardProps) => {
    const { width } = useWindowDimensions();
    const tablet = width >= TABLET_BREAKPOINT;
    const kpiWidth: DimensionValue = tablet ? "23.5%" : "48%";
    const chartWidth: DimensionValue = tablet ? "48.8%" : "100%";
    const approvalRate = summary.totalClaims
      ? (summary.approvedClaims / summary.totalClaims) * 100
      : 0;

    const kpis = useMemo<KpiDefinition[]>(
      () => [
        {
          backgroundColor: colors.blueSurface,
          color: colors.blueDark,
          icon: "calendar-outline",
          label: "Today's Treatments",
          period: "Scheduled today",
          value: formatNumber(summary.todaysTreatments),
        },
        {
          backgroundColor: colors.greenSurface,
          color: colors.greenDark,
          icon: "checkmark-done-outline",
          label: "Completed Treatments",
          period: summary.periodLabel,
          value: formatNumber(summary.completedTreatments),
        },
        {
          backgroundColor: colors.tealSurface,
          color: colors.teal,
          icon: "people-outline",
          label: "Patient Visits",
          period: summary.periodLabel,
          value: formatNumber(summary.patientsVisited),
        },
        {
          backgroundColor: colors.purpleSurface,
          color: colors.purple,
          icon: "receipt-outline",
          label: "Total Claims",
          period: summary.periodLabel,
          value: formatNumber(summary.totalClaims),
        },
        {
          backgroundColor: colors.warningSurface,
          color: colors.warning,
          icon: "time-outline",
          label: "Pending Claims",
          period: "Awaiting review",
          value: formatNumber(summary.pendingClaims),
        },
        {
          backgroundColor: colors.primarySurface,
          color: colors.primaryDark,
          icon: "shield-checkmark-outline",
          label: "Approval Rate",
          period: "Filtered claims",
          value: `${formatNumber(approvalRate, 1)}%`,
        },
        {
          backgroundColor: colors.tealSurface,
          color: colors.teal,
          icon: "navigate-outline",
          label: "Total Distance",
          period: summary.periodLabel,
          value: `${formatNumber(summary.totalKm, 1)} km`,
        },
        {
          backgroundColor: colors.blueSurface,
          color: colors.blue,
          icon: "wallet-outline",
          label: "Travel Reimbursement",
          period: summary.periodLabel,
          value: formatCurrency(summary.totalTravelAmount),
        },
        {
          backgroundColor: colors.neutral175,
          color: colors.textSecondary,
          icon: "speedometer-outline",
          label: "Average KM / Therapist",
          period: "Therapists with travel",
          value: `${formatNumber(
            summary.averageKmPerTherapist,
            1
          )} km`,
        },
        {
          backgroundColor: colors.primarySurfaceBright,
          color: colors.emeraldDark,
          icon: "person-circle-outline",
          label: "Active Therapists",
          period: "Current workforce",
          value: formatNumber(summary.activeTherapists),
        },
        {
          backgroundColor: colors.purpleSurface,
          color: colors.indigo,
          icon: "trophy-outline",
          label: "Top Performer",
          period: "Treatments, then distance",
          value: summary.topPerformingTherapist ?? "No activity",
        },
        {
          backgroundColor: colors.dangerSurface,
          color: colors.danger,
          icon: "close-circle-outline",
          label: "Cancelled Treatments",
          period: summary.periodLabel,
          value: formatNumber(summary.cancelledTreatments),
        },
      ],
      [approvalRate, summary]
    );

    if (!summary.hasData) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons
              color={colors.textMuted}
              name="analytics-outline"
              size={30}
            />
          </View>
          <Text style={styles.emptyTitle}>No report activity found</Text>
          <Text style={styles.emptyText}>
            There are no treatments, travel entries, or claims for the
            current filters.
          </Text>
          {filtersActive ? (
            <TouchableOpacity
              accessibilityLabel="Clear report filters"
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={onClearFilters}
              style={styles.clearButton}
            >
              <Ionicons
                color={colors.surface}
                name="refresh"
                size={17}
              />
              <Text style={styles.clearButtonText}>Clear filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    return (
      <View>
        <View style={styles.summaryHeading}>
          <SectionHeading
            caption={`Generated ${formatActivityDate(summary.generatedAt)}`}
            title="Executive summary"
          />
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {filtersActive ? "Filtered" : "Current"}
            </Text>
          </View>
        </View>
        <View style={styles.kpiGrid}>
          {kpis.map((item) => (
            <KpiCard item={item} key={item.label} width={kpiWidth} />
          ))}
        </View>

        <SectionHeading
          caption={summary.trendPeriodLabel}
          title="Trends and performance"
        />
        <View style={styles.chartGrid}>
          <ChartCard
            subtitle="Completed treatments by day"
            title="Treatment completion"
            width={chartWidth}
          >
            <TreatmentTrendChart data={summary.trends} />
          </ChartCard>
          <ChartCard
            subtitle="Distance recorded by day"
            title="Travel activity"
            width={chartWidth}
          >
            <TravelTrendChart data={summary.trends} />
          </ChartCard>
          <ChartCard
            subtitle="Current filtered claim records"
            title="Claims by status"
            width={chartWidth}
          >
            <ClaimStatusDonut data={summary.claimsByStatus} />
          </ChartCard>
          <ChartCard
            subtitle="Completed treatments by therapist"
            title="Therapist performance"
            width={chartWidth}
          >
            <TherapistPerformanceChart
              data={summary.topTherapists}
            />
          </ChartCard>
        </View>

        <SectionHeading
          caption="Ranked by completed treatments, then distance"
          title="Top performers"
        />
        <View style={styles.listPanel}>
          {summary.topTherapists.length ? (
            summary.topTherapists.map((therapist, index) => (
              <View
                key={therapist.therapistId}
                style={[
                  styles.performerRow,
                  index < summary.topTherapists.length - 1
                    ? styles.rowDivider
                    : null,
                ]}
              >
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={styles.performerText}>
                  <Text numberOfLines={1} style={styles.performerName}>
                    {therapist.therapistName}
                  </Text>
                  <Text style={styles.performerMeta}>
                    {formatNumber(therapist.totalKm, 1)} km ·{" "}
                    {therapist.claimsSubmitted} claims
                  </Text>
                </View>
                <View style={styles.performerMetric}>
                  <Text style={styles.performerValue}>
                    {therapist.completedTreatments}
                  </Text>
                  <Text style={styles.performerLabel}>Treatments</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.listEmptyText}>
              No therapist activity in this period.
            </Text>
          )}
        </View>

        <SectionHeading
          caption="Claims, treatments, and travel updates"
          title="Recent activity"
        />
        <View style={styles.listPanel}>
          {summary.recentActivity.length ? (
            summary.recentActivity.map((activity, index) => {
              const iconStyle = getActivityColor(
                activity.activityType
              );
              const statusStyle = getStatusStyle(activity.status);
              return (
                <View
                  key={activity.id}
                  style={[
                    styles.activityRow,
                    index < summary.recentActivity.length - 1
                      ? styles.rowDivider
                      : null,
                  ]}
                >
                  <View
                    style={[
                      styles.activityIcon,
                      { backgroundColor: iconStyle.backgroundColor },
                    ]}
                  >
                    <Ionicons
                      color={iconStyle.color}
                      name={getActivityIcon(activity.activityType)}
                      size={18}
                    />
                  </View>
                  <View style={styles.activityText}>
                    <Text
                      numberOfLines={1}
                      style={styles.activityTitle}
                    >
                      {activity.description}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={styles.activityMeta}
                    >
                      {activity.therapistName} ·{" "}
                      {formatActivityDate(activity.occurredAt)}
                    </Text>
                  </View>
                  <View style={styles.activityRight}>
                    {activity.amount !== null ? (
                      <Text style={styles.activityAmount}>
                        {formatCurrency(activity.amount)}
                      </Text>
                    ) : null}
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusStyle.backgroundColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: statusStyle.color },
                        ]}
                      >
                        {formatStatus(activity.status)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.listEmptyText}>
              No recent activity in this period.
            </Text>
          )}
        </View>

        <SectionHeading
          caption="Calculated from the filtered operational data"
          title="Operational insights"
        />
        <View style={styles.insightGrid}>
          {summary.insights.map((insight) => (
            <InsightCard insight={insight} key={insight.key} />
          ))}
        </View>
      </View>
    );
  }
);

ReportDashboard.displayName = "ReportDashboard";

export const ReportDashboardSkeleton = () => (
  <View
    accessibilityLabel="Loading report analytics"
    accessibilityRole="progressbar"
    style={styles.skeleton}
  >
    <SkeletonPlaceholder
      backgroundColor={colors.neutral150}
      borderRadius={radius.md}
      highlightColor={colors.surface}
      speed={1100}
    >
      <SkeletonPlaceholder.Item>
        <SkeletonPlaceholder.Item
          height={20}
          marginBottom={spacing.xl}
          marginTop={spacing.section}
          width={168}
        />
        <SkeletonPlaceholder.Item
          flexDirection="row"
          flexWrap="wrap"
          justifyContent="space-between"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonPlaceholder.Item
              borderRadius={radius.control}
              height={142}
              key={index}
              marginBottom={spacing.lg}
              padding={spacing.xl}
              width="48%"
            >
              <SkeletonPlaceholder.Item height={34} width={34} />
              <SkeletonPlaceholder.Item
                height={24}
                marginTop={spacing.lg}
                width="56%"
              />
              <SkeletonPlaceholder.Item
                height={12}
                marginTop={spacing.md}
                width="82%"
              />
            </SkeletonPlaceholder.Item>
          ))}
        </SkeletonPlaceholder.Item>
        <SkeletonPlaceholder.Item
          height={20}
          marginBottom={spacing.xl}
          marginTop={spacing.xl}
          width={202}
        />
        <SkeletonPlaceholder.Item
          borderRadius={radius.control}
          height={260}
          marginBottom={spacing.lg}
          width="100%"
        />
        <SkeletonPlaceholder.Item
          borderRadius={radius.control}
          height={260}
          width="100%"
        />
      </SkeletonPlaceholder.Item>
    </SkeletonPlaceholder>
  </View>
);

const styles = StyleSheet.create({
  sectionHeading: {
    marginBottom: spacing.lg,
    marginTop: spacing.section,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
  },
  sectionCaption: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.xs,
  },
  summaryHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  liveBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.s9,
    paddingVertical: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    height: 7,
    width: 7,
  },
  liveText: {
    color: colors.primaryDark,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  kpiCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 148,
    padding: spacing.lgPlus,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  kpiIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  kpiValue: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  kpiLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    lineHeight: typography.lineHeight.small,
    marginTop: spacing.s5,
  },
  kpiPeriod: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
  chartGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 282,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  chartTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  chartSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  chartContent: {
    marginTop: spacing.lg,
  },
  listPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.soft,
    shadowRadius: shadows.radius.cardSoft,
  },
  performerRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 78,
    paddingVertical: spacing.lg,
  },
  rowDivider: {
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
  },
  rankBadge: {
    alignItems: "center",
    backgroundColor: colors.neutral175,
    borderRadius: radius.control,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  rankText: {
    color: colors.textSecondary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  performerText: {
    flex: 1,
    marginLeft: spacing.lg,
    minWidth: 0,
  },
  performerName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  performerMeta: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xs,
  },
  performerMetric: {
    alignItems: "flex-end",
    marginLeft: spacing.md,
  },
  performerValue: {
    color: PRIMARY,
    fontSize: typography.size.title,
    fontWeight: typography.weight.extrabold,
  },
  performerLabel: {
    color: colors.textSubtle,
    fontSize: typography.size.caption,
    marginTop: spacing.xxs,
  },
  activityRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 84,
    paddingVertical: spacing.lg,
  },
  activityIcon: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  activityText: {
    flex: 1,
    marginLeft: spacing.lg,
    minWidth: 0,
  },
  activityTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  activityMeta: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xs,
  },
  activityRight: {
    alignItems: "flex-end",
    marginLeft: spacing.md,
    maxWidth: 108,
  },
  activityAmount: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xs,
  },
  statusBadge: {
    borderRadius: radius.control,
    maxWidth: 108,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusText: {
    fontSize: typography.size.tiny,
    fontWeight: typography.weight.extrabold,
  },
  listEmptyText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    paddingVertical: spacing.xxxl,
    textAlign: "center",
  },
  insightGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  insightCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 142,
    padding: spacing.xl,
  },
  insightTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  insightTitle: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    lineHeight: typography.lineHeight.small,
  },
  changeBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs,
    marginLeft: spacing.sm,
  },
  changeText: {
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
  },
  insightValue: {
    color: colors.textPrimary,
    fontSize: typography.size.titleLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  insightDetail: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    lineHeight: typography.lineHeight.small,
    marginTop: spacing.s5,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.section,
    padding: spacing.sectionLg,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.neutral175,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.md,
    maxWidth: 360,
    textAlign: "center",
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  clearButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  exportPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.section,
    padding: spacing.xl,
  },
  exportHeading: {
    alignItems: "center",
    flexDirection: "row",
  },
  exportHeadingIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  exportHeadingText: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  exportTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  exportSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  exportActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  exportButton: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 104,
    paddingHorizontal: spacing.xl,
  },
  pdfButton: {
    backgroundColor: colors.teal,
  },
  exportButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  futureExport: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 46,
    minWidth: 104,
    paddingHorizontal: spacing.lg,
  },
  futureExportText: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  futureLabel: {
    color: colors.textSubtle,
    fontSize: typography.size.micro,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  disabledControl: {
    opacity: 0.58,
  },
  skeleton: {
    marginTop: spacing.xl,
  },
});
