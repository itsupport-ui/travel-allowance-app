import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";

import { formatDoctorLabel } from "../../utils/doctorWorkflow";

interface DoctorStatusBadgeProps {
  status: string | null | undefined;
}

const getStatusTone = (
  status: string
): "danger" | "info" | "neutral" | "success" | "warning" => {
  if (
    ["approved", "completed", "confirmed", "visited"].includes(status)
  ) {
    return "success";
  }

  if (["cancelled", "rejected"].includes(status)) {
    return "danger";
  }

  if (["scheduled", "submitted"].includes(status)) {
    return "info";
  }

  if (["draft", "follow_up", "pending"].includes(status)) {
    return "warning";
  }

  return "neutral";
};

export function DoctorStatusBadge({
  status,
}: DoctorStatusBadgeProps) {
  const normalized = status?.trim().toLowerCase() || "unknown";
  const tone = getStatusTone(normalized);

  return (
    <View style={[styles.badge, styles[`${tone}Badge`]]}>
      <Text style={[styles.badgeText, styles[`${tone}Text`]]}>
        {formatDoctorLabel(normalized)}
      </Text>
    </View>
  );
}

export function DoctorScreenHeader({
  action,
  subtitle,
  title,
}: {
  action?: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderText}>
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function DoctorBackHeader({
  action,
  onBack,
  title,
}: {
  action?: ReactNode;
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={styles.backHeader}>
      <TouchableOpacity
        accessibilityLabel="Go back"
        accessibilityRole="button"
        style={styles.headerButton}
        onPress={onBack}
      >
        <Ionicons
          color={colors.textStrong}
          name="arrow-back"
          size={23}
        />
      </TouchableOpacity>
      <Text numberOfLines={1} style={styles.backHeaderTitle}>
        {title}
      </Text>
      <View style={styles.headerButton}>{action}</View>
    </View>
  );
}

export function DoctorLoadingState({
  label = "Loading...",
}: {
  label?: string;
}) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function DoctorErrorState({
  message,
  onRetry,
  title = "Unable to load",
}: {
  message: string;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <View style={styles.centerState}>
      <View style={styles.errorIcon}>
        <Ionicons
          color={colors.danger}
          name="alert-circle-outline"
          size={28}
        />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.retryButton}
        onPress={onRetry}
      >
        <Text style={styles.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

export function DoctorEmptyState({
  description,
  icon = "file-tray-outline",
  title,
}: {
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons color={colors.primary} name={icon} size={27} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{description}</Text>
    </View>
  );
}

export function DoctorDetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.detailValue}>
          {value === "" ? "Not available" : value}
        </Text>
      ) : (
        <View style={styles.detailComponent}>{value}</View>
      )}
    </View>
  );
}

export function DoctorField({
  error,
  label,
  multiline,
  required = false,
  style,
  ...props
}: TextInputProps & {
  error?: string | null;
  label: string;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        multiline={multiline}
        placeholderTextColor={colors.textSubtle}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          error && styles.inputError,
          style,
        ]}
        textAlignVertical={multiline ? "top" : "center"}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function DoctorChoiceChips<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            style={[
              styles.choice,
              selected && styles.selectedChoice,
            ]}
            onPress={() => onChange(option.value)}
          >
            <Text
              style={[
                styles.choiceText,
                selected && styles.selectedChoiceText,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  badgeText: {
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    textTransform: "uppercase",
  },
  successBadge: {
    backgroundColor: colors.greenSurface,
  },
  successText: {
    color: colors.primaryDark,
  },
  dangerBadge: {
    backgroundColor: colors.dangerSurfaceStrong,
  },
  dangerText: {
    color: colors.danger,
  },
  infoBadge: {
    backgroundColor: colors.blueSurface,
  },
  infoText: {
    color: colors.blueDark,
  },
  warningBadge: {
    backgroundColor: colors.warningSurface,
  },
  warningText: {
    color: colors.warningDark,
  },
  neutralBadge: {
    backgroundColor: colors.neutral100,
  },
  neutralText: {
    color: colors.textMutedDark,
  },
  screenHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  screenHeaderText: {
    flex: 1,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.extrabold,
  },
  screenSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  backHeader: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: spacing.xl,
  },
  backHeaderTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.titleSmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "center",
  },
  headerButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.section,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: spacing.section,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 54,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 54,
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
    textAlign: "center",
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  retryButton: {
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 44,
  },
  retryText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  detailRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.lgPlus,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
  },
  detailComponent: {
    alignItems: "flex-start",
  },
  field: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.size.body,
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  multilineInput: {
    minHeight: 96,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lgPlus,
    paddingVertical: spacing.md,
  },
  selectedChoice: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  choiceText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  selectedChoiceText: {
    color: colors.primary,
  },
});
