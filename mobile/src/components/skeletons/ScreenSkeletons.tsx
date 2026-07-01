import { colors, radius, spacing } from "@/src/theme";
import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import SkeletonPlaceholder from "./SkeletonPlaceholder";

interface SkeletonFrameProps {
  accessibilityLabel: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const SkeletonFrame = ({
  accessibilityLabel,
  children,
  style,
}: SkeletonFrameProps) => (
  <View
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="progressbar"
    style={style}
  >
    <SkeletonPlaceholder
      backgroundColor={colors.neutral150}
      borderRadius={radius.md}
      highlightColor={colors.surface}
      speed={1100}
    >
      <SkeletonPlaceholder.Item>{children}</SkeletonPlaceholder.Item>
    </SkeletonPlaceholder>
  </View>
);

const SummaryCardSkeleton = () => (
  <SkeletonPlaceholder.Item
    borderRadius={radius.control}
    height={126}
    padding={spacing.xl}
    width="48%"
  >
    <SkeletonPlaceholder.Item
      borderRadius={radius.control}
      height={36}
      width={36}
    />
    <SkeletonPlaceholder.Item
      height={12}
      marginTop={spacing.lg}
      width="72%"
    />
    <SkeletonPlaceholder.Item
      height={24}
      marginTop={spacing.md}
      width="48%"
    />
  </SkeletonPlaceholder.Item>
);

const HistoryCardSkeleton = () => (
  <SkeletonPlaceholder.Item
    borderRadius={radius.control}
    marginBottom={spacing.lgPlus}
    padding={spacing.xl}
    width="100%"
  >
    <SkeletonPlaceholder.Item
      alignItems="center"
      flexDirection="row"
      justifyContent="space-between"
    >
      <SkeletonPlaceholder.Item>
        <SkeletonPlaceholder.Item height={18} width={156} />
        <SkeletonPlaceholder.Item
          height={12}
          marginTop={spacing.sm}
          width={96}
        />
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        borderRadius={radius.pill}
        height={26}
        width={74}
      />
    </SkeletonPlaceholder.Item>
    <SkeletonPlaceholder.Item
      height={1}
      marginVertical={spacing.lgPlus}
      width="100%"
    />
    <SkeletonPlaceholder.Item height={12} width="84%" />
    <SkeletonPlaceholder.Item
      height={12}
      marginTop={spacing.md}
      width="68%"
    />
    <SkeletonPlaceholder.Item
      height={12}
      marginTop={spacing.lg}
      width="44%"
    />
  </SkeletonPlaceholder.Item>
);

const DirectoryCardSkeleton = () => (
  <SkeletonPlaceholder.Item
    borderRadius={radius.control}
    marginBottom={spacing.lg}
    padding={spacing.xl}
    width="100%"
  >
    <SkeletonPlaceholder.Item alignItems="center" flexDirection="row">
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={46}
        width={46}
      />
      <SkeletonPlaceholder.Item flex={1} marginLeft={spacing.lg}>
        <SkeletonPlaceholder.Item height={16} width="56%" />
        <SkeletonPlaceholder.Item
          height={12}
          marginTop={spacing.md}
          width="72%"
        />
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        borderRadius={radius.pill}
        height={26}
        width={68}
      />
    </SkeletonPlaceholder.Item>
    <SkeletonPlaceholder.Item
      height={1}
      marginVertical={spacing.lgPlus}
      width="100%"
    />
    <SkeletonPlaceholder.Item height={12} width="52%" />
    <SkeletonPlaceholder.Item
      height={12}
      marginTop={spacing.md}
      width="66%"
    />
  </SkeletonPlaceholder.Item>
);

const MetricGridSkeleton = ({ count }: { count: number }) => (
  <SkeletonPlaceholder.Item
    flexDirection="row"
    flexWrap="wrap"
    justifyContent="space-between"
  >
    {Array.from({ length: count }, (_, index) => (
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={154}
        key={index}
        marginBottom={spacing.lg}
        padding={spacing.xl}
        width="48%"
      >
        <SkeletonPlaceholder.Item
          borderRadius={radius.control}
          height={40}
          width={40}
        />
        <SkeletonPlaceholder.Item
          height={28}
          marginTop={spacing.lgPlus}
          width="42%"
        />
        <SkeletonPlaceholder.Item
          height={12}
          marginTop={spacing.md}
          width="74%"
        />
      </SkeletonPlaceholder.Item>
    ))}
  </SkeletonPlaceholder.Item>
);

export const DashboardSkeleton = () => (
  <SkeletonFrame
    accessibilityLabel="Loading dashboard"
    style={styles.fullScreen}
  >
    <SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item height={16} marginTop={spacing.section} width={112} />
      <SkeletonPlaceholder.Item
        height={30}
        marginBottom={spacing.xxxl}
        marginTop={spacing.md}
        width={178}
      />
      <SkeletonPlaceholder.Item
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="space-between"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonPlaceholder.Item
            borderRadius={radius.control}
            height={120}
            key={index}
            marginBottom={spacing.lg}
            padding={spacing.xl}
            width="48%"
          >
            <SkeletonPlaceholder.Item height={13} width="74%" />
            <SkeletonPlaceholder.Item
              height={34}
              marginTop={spacing.xl}
              width="36%"
            />
          </SkeletonPlaceholder.Item>
        ))}
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        height={18}
        marginBottom={spacing.lg}
        marginTop={spacing.xxl}
        width={92}
      />
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={250}
        padding={spacing.xl}
        width="100%"
      >
        <SkeletonPlaceholder.Item alignItems="center" flexDirection="row">
          <SkeletonPlaceholder.Item height={38} width={38} />
          <SkeletonPlaceholder.Item
            height={17}
            marginLeft={spacing.mdPlus}
            width={132}
          />
          <SkeletonPlaceholder.Item flex={1} />
          <SkeletonPlaceholder.Item
            borderRadius={radius.pill}
            height={28}
            width={84}
          />
        </SkeletonPlaceholder.Item>
        <SkeletonPlaceholder.Item
          height={1}
          marginTop={spacing.xl}
          width="100%"
        />
        <SkeletonPlaceholder.Item
          height={13}
          marginTop={spacing.xl}
          width="100%"
        />
        <SkeletonPlaceholder.Item
          height={13}
          marginTop={spacing.lg}
          width="100%"
        />
        <SkeletonPlaceholder.Item
          borderRadius={radius.control}
          height={52}
          marginTop={spacing.xl}
          width="100%"
        />
      </SkeletonPlaceholder.Item>
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const ScheduleListSkeleton = () => (
  <SkeletonFrame
    accessibilityLabel="Loading schedules"
    style={styles.listScreen}
  >
    <SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item height={26} width={204} />
      <SkeletonPlaceholder.Item marginTop={spacing.xl}>
        <HistoryCardSkeleton />
        <HistoryCardSkeleton />
        <HistoryCardSkeleton />
      </SkeletonPlaceholder.Item>
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const TravelSkeleton = () => (
  <SkeletonFrame
    accessibilityLabel="Loading travel history"
    style={styles.listScreen}
  >
    <SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        alignItems="center"
        flexDirection="row"
        justifyContent="space-between"
      >
        <SkeletonPlaceholder.Item height={30} width={92} />
        <SkeletonPlaceholder.Item
          borderRadius={radius.control}
          height={44}
          width={44}
        />
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="space-between"
        marginTop={spacing.xlPlus}
      >
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        height={20}
        marginBottom={spacing.lg}
        marginTop={spacing.xl}
        width={132}
      />
      <HistoryCardSkeleton />
      <HistoryCardSkeleton />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const ClaimsSkeleton = () => (
  <SkeletonFrame
    accessibilityLabel="Loading claims"
    style={styles.listScreen}
  >
    <SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item height={30} width={106} />
      <SkeletonPlaceholder.Item
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="space-between"
        marginTop={spacing.xlPlus}
      >
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={54}
        marginTop={spacing.lg}
        width="100%"
      />
      <SkeletonPlaceholder.Item
        height={20}
        marginBottom={spacing.lg}
        marginTop={spacing.xxxl}
        width={126}
      />
      <HistoryCardSkeleton />
      <HistoryCardSkeleton />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const DoctorListSkeleton = () => (
  <SkeletonFrame
    accessibilityLabel="Loading doctors"
    style={styles.directoryScreen}
  >
    <SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item alignItems="center" flexDirection="row">
        <SkeletonPlaceholder.Item height={42} width={42} />
        <SkeletonPlaceholder.Item flex={1} marginLeft={spacing.lg}>
          <SkeletonPlaceholder.Item height={11} width="32%" />
          <SkeletonPlaceholder.Item
            height={24}
            marginTop={spacing.sm}
            width="48%"
          />
          <SkeletonPlaceholder.Item
            height={12}
            marginTop={spacing.sm}
            width="42%"
          />
        </SkeletonPlaceholder.Item>
      </SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={50}
        marginTop={spacing.xxlPlus}
        width="100%"
      />
      <SkeletonPlaceholder.Item
        alignItems="center"
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={spacing.lg}
        marginTop={spacing.xxxl}
      >
        <SkeletonPlaceholder.Item height={18} width="42%" />
        <SkeletonPlaceholder.Item height={26} width={32} />
      </SkeletonPlaceholder.Item>
      <DirectoryCardSkeleton />
      <DirectoryCardSkeleton />
      <DirectoryCardSkeleton />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const TherapistListSkeleton = () => (
  <SkeletonFrame
    accessibilityLabel="Loading therapists"
    style={styles.directoryScreen}
  >
    <SkeletonPlaceholder.Item>
      <SkeletonPlaceholder.Item height={11} marginTop={spacing.xlPlus} width={108} />
      <SkeletonPlaceholder.Item
        height={26}
        marginTop={spacing.sm}
        width={146}
      />
      <SkeletonPlaceholder.Item
        height={13}
        marginTop={spacing.sm}
        width="72%"
      />
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={50}
        marginTop={spacing.xxlPlus}
        width="100%"
      />
      <SkeletonPlaceholder.Item
        alignItems="center"
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={spacing.lg}
        marginTop={spacing.xxxl}
      >
        <SkeletonPlaceholder.Item height={18} width="46%" />
        <SkeletonPlaceholder.Item height={26} width={32} />
      </SkeletonPlaceholder.Item>
      <DirectoryCardSkeleton />
      <DirectoryCardSkeleton />
      <DirectoryCardSkeleton />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const AdminDashboardSkeleton = () => (
  <SkeletonFrame accessibilityLabel="Loading dashboard">
    <SkeletonPlaceholder.Item marginTop={spacing.s26}>
      <SkeletonPlaceholder.Item
        height={20}
        marginBottom={spacing.lg}
        width={92}
      />
      <MetricGridSkeleton count={6} />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const ReportsSkeleton = () => (
  <SkeletonFrame accessibilityLabel="Loading reports">
    <SkeletonPlaceholder.Item marginTop={spacing.xxxl}>
      <SkeletonPlaceholder.Item
        alignItems="center"
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={spacing.lg}
      >
        <SkeletonPlaceholder.Item height={20} width={182} />
        <SkeletonPlaceholder.Item
          borderRadius={radius.pill}
          height={26}
          width={72}
        />
      </SkeletonPlaceholder.Item>
      <MetricGridSkeleton count={5} />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

export const FilterFieldSkeleton = () => (
  <SkeletonFrame accessibilityLabel="Loading therapist filter">
    <SkeletonPlaceholder.Item marginBottom={spacing.xl}>
      <SkeletonPlaceholder.Item height={12} width={76} />
      <SkeletonPlaceholder.Item
        borderRadius={radius.control}
        height={50}
        marginTop={spacing.sm}
        width="100%"
      />
    </SkeletonPlaceholder.Item>
  </SkeletonFrame>
);

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xxl,
  },
  listScreen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  directoryScreen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xxl,
  },
});
