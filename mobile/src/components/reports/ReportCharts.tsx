import { colors, spacing, typography } from "@/src/theme";
import { memo, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import type {
  ReportClaimStatusPoint,
  ReportTopTherapist,
  ReportTrendPoint,
} from "../../types/adminReport";

const CHART_HEIGHT = 190;
const CHART_MIN_WIDTH = 240;
const CHART_PADDING = {
  bottom: 30,
  left: 36,
  right: 12,
  top: 14,
};

const formatShortDate = (value: string): string =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));

const useChartWidth = () => {
  const [width, setWidth] = useState(CHART_MIN_WIDTH);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== width) {
      setWidth(nextWidth);
    }
  };

  return { onLayout, width };
};

const EmptyChart = ({ label }: { label: string }) => (
  <View
    accessibilityLabel={label}
    style={styles.emptyChart}
  >
    <Text style={styles.emptyChartText}>No data for this period</Text>
  </View>
);

export const TreatmentTrendChart = memo(
  ({ data }: { data: ReportTrendPoint[] }) => {
    const { onLayout, width } = useChartWidth();
    const values = useMemo(
      () => data.map((point) => point.completedTreatments),
      [data]
    );
    const maximum = Math.max(...values, 0);

    const path = useMemo(() => {
      if (data.length === 0) {
        return "";
      }

      const plotWidth =
        width - CHART_PADDING.left - CHART_PADDING.right;
      const plotHeight =
        CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
      const divisor = Math.max(data.length - 1, 1);
      const yMaximum = Math.max(maximum, 1);

      return data
        .map((point, index) => {
          const x =
            CHART_PADDING.left + (index / divisor) * plotWidth;
          const y =
            CHART_PADDING.top +
            plotHeight -
            (point.completedTreatments / yMaximum) * plotHeight;

          return `${index === 0 ? "M" : "L"} ${x} ${y}`;
        })
        .join(" ");
    }, [data, maximum, width]);

    if (maximum === 0) {
      return (
        <View onLayout={onLayout}>
          <EmptyChart label="No completed treatment trend data" />
        </View>
      );
    }

    const plotBottom = CHART_HEIGHT - CHART_PADDING.bottom;
    const labelIndexes = [
      0,
      Math.floor((data.length - 1) / 2),
      data.length - 1,
    ].filter((value, index, valuesList) => {
      return value >= 0 && valuesList.indexOf(value) === index;
    });

    return (
      <View
        accessibilityLabel={`Completed treatments trend, maximum ${maximum}`}
        accessible
        onLayout={onLayout}
      >
        <Svg height={CHART_HEIGHT} width={width}>
          {[0, 0.5, 1].map((ratio) => {
            const y =
              CHART_PADDING.top +
              ratio *
                (CHART_HEIGHT -
                  CHART_PADDING.top -
                  CHART_PADDING.bottom);
            return (
              <G key={ratio}>
                <Line
                  stroke={colors.borderMuted}
                  strokeWidth={1}
                  x1={CHART_PADDING.left}
                  x2={width - CHART_PADDING.right}
                  y1={y}
                  y2={y}
                />
                <SvgText
                  fill={colors.textSubtle}
                  fontSize={9}
                  textAnchor="end"
                  x={CHART_PADDING.left - 7}
                  y={y + 3}
                >
                  {Math.round(maximum * (1 - ratio))}
                </SvgText>
              </G>
            );
          })}
          <Path
            d={path}
            fill="none"
            stroke={colors.blue}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          {data.map((point, index) => {
            const plotWidth =
              width - CHART_PADDING.left - CHART_PADDING.right;
            const plotHeight =
              CHART_HEIGHT -
              CHART_PADDING.top -
              CHART_PADDING.bottom;
            const x =
              CHART_PADDING.left +
              (index / Math.max(data.length - 1, 1)) * plotWidth;
            const y =
              CHART_PADDING.top +
              plotHeight -
              (point.completedTreatments / Math.max(maximum, 1)) *
                plotHeight;

            return (
              <Circle
                cx={x}
                cy={y}
                fill={colors.surface}
                key={point.date}
                r={3.5}
                stroke={colors.blue}
                strokeWidth={2}
              />
            );
          })}
          {labelIndexes.map((index) => {
            const x =
              CHART_PADDING.left +
              (index / Math.max(data.length - 1, 1)) *
                (width - CHART_PADDING.left - CHART_PADDING.right);
            return (
              <SvgText
                fill={colors.textMuted}
                fontSize={9}
                key={data[index].date}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === data.length - 1
                      ? "end"
                      : "middle"
                }
                x={x}
                y={plotBottom + 20}
              >
                {formatShortDate(data[index].date)}
              </SvgText>
            );
          })}
        </Svg>
      </View>
    );
  }
);

TreatmentTrendChart.displayName = "TreatmentTrendChart";

export const TravelTrendChart = memo(
  ({ data }: { data: ReportTrendPoint[] }) => {
    const { onLayout, width } = useChartWidth();
    const maximum = Math.max(
      ...data.map((point) => point.totalKm),
      0
    );

    if (maximum === 0) {
      return (
        <View onLayout={onLayout}>
          <EmptyChart label="No travel distance trend data" />
        </View>
      );
    }

    const plotWidth =
      width - CHART_PADDING.left - CHART_PADDING.right;
    const plotHeight =
      CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const slotWidth = plotWidth / Math.max(data.length, 1);
    const barWidth = Math.max(4, Math.min(slotWidth * 0.58, 18));
    const labelIndexes = [
      0,
      Math.floor((data.length - 1) / 2),
      data.length - 1,
    ].filter(
      (value, index, valuesList) =>
        value >= 0 && valuesList.indexOf(value) === index
    );

    return (
      <View
        accessibilityLabel={`Travel distance trend, maximum ${maximum.toFixed(1)} kilometers`}
        accessible
        onLayout={onLayout}
      >
        <Svg height={CHART_HEIGHT} width={width}>
          {[0, 0.5, 1].map((ratio) => {
            const y = CHART_PADDING.top + ratio * plotHeight;
            return (
              <G key={ratio}>
                <Line
                  stroke={colors.borderMuted}
                  strokeWidth={1}
                  x1={CHART_PADDING.left}
                  x2={width - CHART_PADDING.right}
                  y1={y}
                  y2={y}
                />
                <SvgText
                  fill={colors.textSubtle}
                  fontSize={9}
                  textAnchor="end"
                  x={CHART_PADDING.left - 7}
                  y={y + 3}
                >
                  {Math.round(maximum * (1 - ratio))}
                </SvgText>
              </G>
            );
          })}
          {data.map((point, index) => {
            const height = (point.totalKm / maximum) * plotHeight;
            const x =
              CHART_PADDING.left +
              index * slotWidth +
              (slotWidth - barWidth) / 2;
            return (
              <Rect
                fill={colors.teal}
                height={height}
                key={point.date}
                rx={2}
                width={barWidth}
                x={x}
                y={CHART_PADDING.top + plotHeight - height}
              />
            );
          })}
          {labelIndexes.map((index) => {
            const x =
              CHART_PADDING.left + (index + 0.5) * slotWidth;
            return (
              <SvgText
                fill={colors.textMuted}
                fontSize={9}
                key={data[index].date}
                textAnchor="middle"
                x={x}
                y={CHART_HEIGHT - 10}
              >
                {formatShortDate(data[index].date)}
              </SvgText>
            );
          })}
        </Svg>
      </View>
    );
  }
);

TravelTrendChart.displayName = "TravelTrendChart";

const claimStatusColors = {
  approved: colors.green,
  pending: colors.warningBright,
  rejected: colors.dangerBright,
} as const;

export const ClaimStatusDonut = memo(
  ({ data }: { data: ReportClaimStatusPoint[] }) => {
    const total = data.reduce((sum, item) => sum + item.count, 0);
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    if (total === 0) {
      return <EmptyChart label="No claim status data" />;
    }

    return (
      <View
        accessibilityLabel={`${total} claims by approval status`}
        accessible
        style={styles.donutLayout}
      >
        <View style={styles.donutChart}>
          <Svg height={150} width={150}>
            <Circle
              cx={75}
              cy={75}
              fill="none"
              r={radius}
              stroke={colors.neutral175}
              strokeWidth={18}
            />
            <G rotation="-90" origin="75, 75">
              {data.map((item) => {
                const length = (item.count / total) * circumference;
                const currentOffset = offset;
                offset += length;
                return (
                  <Circle
                    cx={75}
                    cy={75}
                    fill="none"
                    key={item.status}
                    r={radius}
                    stroke={claimStatusColors[item.status]}
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-currentOffset}
                    strokeWidth={18}
                  />
                );
              })}
            </G>
          </Svg>
          <View pointerEvents="none" style={styles.donutCenter}>
            <Text style={styles.donutValue}>{total}</Text>
            <Text style={styles.donutLabel}>Claims</Text>
          </View>
        </View>
        <View style={styles.legend}>
          {data.map((item) => (
            <View key={item.status} style={styles.legendRow}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: claimStatusColors[item.status] },
                ]}
              />
              <Text style={styles.legendName}>
                {item.status.charAt(0).toUpperCase() +
                  item.status.slice(1)}
              </Text>
              <Text style={styles.legendValue}>{item.count}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
);

ClaimStatusDonut.displayName = "ClaimStatusDonut";

export const TherapistPerformanceChart = memo(
  ({ data }: { data: ReportTopTherapist[] }) => {
    const maximum = Math.max(
      ...data.map((item) => item.completedTreatments),
      0
    );

    if (maximum === 0) {
      return <EmptyChart label="No therapist performance data" />;
    }

    return (
      <View
        accessibilityLabel="Top therapist completed treatment comparison"
        accessible
        style={styles.performanceChart}
      >
        {data.slice(0, 5).map((item) => (
          <View key={item.therapistId} style={styles.performanceRow}>
            <Text numberOfLines={1} style={styles.performanceName}>
              {item.therapistName}
            </Text>
            <View style={styles.performanceTrack}>
              <View
                style={[
                  styles.performanceFill,
                  {
                    width: `${Math.max(
                      (item.completedTreatments / maximum) * 100,
                      4
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.performanceValue}>
              {item.completedTreatments}
            </Text>
          </View>
        ))}
      </View>
    );
  }
);

TherapistPerformanceChart.displayName = "TherapistPerformanceChart";

const styles = StyleSheet.create({
  emptyChart: {
    alignItems: "center",
    height: CHART_HEIGHT,
    justifyContent: "center",
  },
  emptyChartText: {
    color: colors.textSubtle,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  donutLayout: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: CHART_HEIGHT,
  },
  donutChart: {
    height: 150,
    width: 150,
  },
  donutCenter: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  donutValue: {
    color: colors.textPrimary,
    fontSize: typography.size.heading,
    fontWeight: typography.weight.extrabold,
  },
  donutLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.xxs,
  },
  legend: {
    flex: 1,
    gap: spacing.lg,
    marginLeft: spacing.xl,
    maxWidth: 160,
  },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  legendSwatch: {
    borderRadius: 2,
    height: 10,
    marginRight: spacing.md,
    width: 10,
  },
  legendName: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  legendValue: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  performanceChart: {
    gap: spacing.xl,
    justifyContent: "center",
    minHeight: CHART_HEIGHT,
  },
  performanceRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  performanceName: {
    color: colors.textSecondary,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.semibold,
    width: 92,
  },
  performanceTrack: {
    backgroundColor: colors.neutral175,
    borderRadius: 3,
    flex: 1,
    height: 8,
    marginHorizontal: spacing.md,
    overflow: "hidden",
  },
  performanceFill: {
    backgroundColor: colors.indigo,
    borderRadius: 3,
    height: "100%",
  },
  performanceValue: {
    color: colors.textPrimary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    minWidth: 20,
    textAlign: "right",
  },
});
