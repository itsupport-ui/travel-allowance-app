import { colors, radius, spacing, typography } from "@/src/theme";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PRIMARY = colors.primary;

interface FormTextFieldProps {
  accessibilityLabel: string;
  error?: string;
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  required?: boolean;
  value: string;
}

export const FormTextField = ({
  accessibilityLabel,
  error,
  icon,
  keyboardType,
  label,
  maxLength,
  multiline = false,
  onChangeText,
  placeholder,
  required = false,
  value,
}: FormTextFieldProps) => (
  <View style={styles.field}>
    <Text style={styles.label}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
    <View
      style={[
        styles.inputContainer,
        multiline ? styles.multilineContainer : null,
        error ? styles.invalidControl : null,
      ]}
    >
      <Ionicons
        color={colors.textMuted}
        name={icon}
        size={19}
        style={multiline ? styles.multilineIcon : undefined}
      />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="sentences"
        autoCorrect
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
    </View>
    {error ? (
      <Text accessibilityLiveRegion="polite" style={styles.errorText}>
        {error}
      </Text>
    ) : null}
  </View>
);

export interface SelectOption {
  description?: string;
  id: number | string;
  label: string;
}

interface SelectOptionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: (option: SelectOption) => void;
  option: SelectOption;
  selected: boolean;
}

const SelectOptionRow = memo(function SelectOptionRow({
  icon,
  onPress,
  option,
  selected,
}: SelectOptionRowProps) {
  return (
    <TouchableOpacity
      accessibilityLabel={`${option.label}${
        option.description ? `, ${option.description}` : ""
      }`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.82}
      onPress={() => onPress(option)}
      style={[
        styles.option,
        selected ? styles.selectedOption : null,
      ]}
    >
      <View style={styles.optionIcon}>
        <Ionicons color={PRIMARY} name={icon} size={19} />
      </View>
      <View style={styles.optionContent}>
        <Text numberOfLines={1} style={styles.optionLabel}>
          {option.label}
        </Text>
        {option.description ? (
          <Text numberOfLines={1} style={styles.optionDescription}>
            {option.description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Ionicons color={PRIMARY} name="checkmark-circle" size={22} />
      ) : null}
    </TouchableOpacity>
  );
});

const OPTION_ROW_HEIGHT = 64;
const OPTION_SEPARATOR_HEIGHT = 10;
const OPTION_LAYOUT_HEIGHT = OPTION_ROW_HEIGHT + OPTION_SEPARATOR_HEIGHT;

const optionKeyExtractor = (item: SelectOption): string => String(item.id);

const OptionSeparator = () => <View style={styles.optionSeparator} />;

const getOptionItemLayout = (
  _data: ArrayLike<SelectOption> | null | undefined,
  index: number
) => ({
  index,
  length: OPTION_ROW_HEIGHT,
  offset: OPTION_LAYOUT_HEIGHT * index,
});

interface SearchableSelectProps {
  accessibilityLabel: string;
  emptyMessage: string;
  error?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onSelect: (option: SelectOption) => void;
  options: SelectOption[];
  placeholder: string;
  required?: boolean;
  searchPlaceholder: string;
  selectedId: number | string | null;
  title: string;
}

export const SearchableSelect = ({
  accessibilityLabel,
  emptyMessage,
  error,
  icon,
  label,
  onSelect,
  options,
  placeholder,
  required = false,
  searchPlaceholder,
  selectedId,
  title,
}: SearchableSelectProps) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find(
    (option) => option.id === selectedId
  );
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery) ||
        (option.description ?? "")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
    );
  }, [options, query]);

  const closeModal = useCallback(() => {
    setVisible(false);
    setQuery("");
  }, []);

  const selectOption = useCallback(
    (option: SelectOption) => {
      onSelect(option);
      closeModal();
    },
    [closeModal, onSelect]
  );

  const renderOption = useCallback<ListRenderItem<SelectOption>>(
    ({ item }) => (
      <SelectOptionRow
        icon={icon}
        onPress={selectOption}
        option={item}
        selected={item.id === selectedId}
      />
    ),
    [icon, selectOption, selectedId]
  );

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        accessibilityHint={`Opens ${label.toLocaleLowerCase()} options`}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        activeOpacity={0.82}
        onPress={() => setVisible(true)}
        style={[
          styles.selectControl,
          error ? styles.invalidControl : null,
        ]}
      >
        <Ionicons color={colors.textMuted} name={icon} size={19} />
        <View style={styles.selectTextContainer}>
          <Text
            numberOfLines={1}
            style={[
              styles.selectValue,
              !selectedOption ? styles.placeholder : null,
            ]}
          >
            {selectedOption?.label ?? placeholder}
          </Text>
          {selectedOption?.description ? (
            <Text numberOfLines={1} style={styles.selectDescription}>
              {selectedOption.description}
            </Text>
          ) : null}
        </View>
        <Ionicons color={colors.textMuted} name="chevron-down" size={18} />
      </TouchableOpacity>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={closeModal}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>
                {options.length} available
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={`Close ${title}`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={closeModal}
              style={styles.closeButton}
            >
              <Ionicons color={colors.textSecondary} name="close" size={22} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalSearch}>
            <Ionicons color={colors.textMuted} name="search-outline" size={20} />
            <TextInput
              accessibilityLabel={searchPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textSubtle}
              returnKeyType="search"
              style={styles.modalSearchInput}
              value={query}
            />
            {query ? (
              <TouchableOpacity
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setQuery("")}
              >
                <Ionicons
                  color={colors.textMuted}
                  name="close-circle"
                  size={20}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <FlatList
            contentContainerStyle={styles.optionList}
            data={filteredOptions}
            getItemLayout={getOptionItemLayout}
            initialNumToRender={10}
            ItemSeparatorComponent={OptionSeparator}
            keyboardShouldPersistTaps="handled"
            keyExtractor={optionKeyExtractor}
            ListEmptyComponent={
              <View style={styles.optionsEmpty}>
                <Ionicons
                  color={colors.textSubtle}
                  name="search-outline"
                  size={34}
                />
                <Text style={styles.optionsEmptyTitle}>
                  No matching options
                </Text>
                <Text style={styles.optionsEmptyText}>{emptyMessage}</Text>
              </View>
            }
            maxToRenderPerBatch={10}
            removeClippedSubviews
            renderItem={renderOption}
            showsVerticalScrollIndicator={false}
            windowSize={7}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

interface DateTimeFieldProps {
  error?: string;
  label: string;
  minimumDate?: Date;
  mode: "date" | "time";
  onChange: (value: Date) => void;
  placeholder: string;
  required?: boolean;
  value: Date | null;
}

const formatDateValue = (value: Date): string =>
  value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatTimeValue = (value: Date): string =>
  value.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
  });

export const DateTimeField = ({
  error,
  label,
  minimumDate,
  mode,
  onChange,
  placeholder,
  required = false,
  value,
}: DateTimeFieldProps) => {
  const [visible, setVisible] = useState(false);
  const [draftValue, setDraftValue] = useState(value ?? new Date());
  const displayValue = value
    ? mode === "date"
      ? formatDateValue(value)
      : formatTimeValue(value)
    : placeholder;

  const openPicker = () => {
    setDraftValue(value ?? minimumDate ?? new Date());
    setVisible(true);
  };

  const handleAndroidChange = (
    event: DateTimePickerEvent,
    selectedValue?: Date
  ) => {
    setVisible(false);

    if (event.type === "set" && selectedValue) {
      onChange(selectedValue);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        accessibilityHint={`Opens the ${label.toLocaleLowerCase()} picker`}
        accessibilityLabel={`${label}: ${displayValue}`}
        accessibilityRole="button"
        activeOpacity={0.82}
        onPress={openPicker}
        style={[
          styles.selectControl,
          error ? styles.invalidControl : null,
        ]}
      >
        <Ionicons
          color={colors.textMuted}
          name={mode === "date" ? "calendar-outline" : "time-outline"}
          size={19}
        />
        <Text
          style={[
            styles.dateTimeValue,
            !value ? styles.placeholder : null,
          ]}
        >
          {displayValue}
        </Text>
        <Ionicons color={colors.textMuted} name="chevron-down" size={18} />
      </TouchableOpacity>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {visible && Platform.OS === "android" ? (
        <DateTimePicker
          display="default"
          minimumDate={mode === "date" ? minimumDate : undefined}
          mode={mode}
          onChange={handleAndroidChange}
          value={draftValue}
        />
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        presentationStyle="pageSheet"
        visible={visible && Platform.OS === "ios"}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={styles.pickerHeaderButton}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>{label}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                onChange(draftValue);
                setVisible(false);
              }}
              style={styles.pickerHeaderButton}
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pickerContent}>
            <DateTimePicker
              display="spinner"
              minimumDate={mode === "date" ? minimumDate : undefined}
              mode={mode}
              onChange={(_event, selectedValue) => {
                if (selectedValue) {
                  setDraftValue(selectedValue);
                }
              }}
              value={draftValue}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const SkeletonPulse = ({ children }: { children: ReactNode }) => {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 700,
          toValue: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 700,
          toValue: 0.45,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};

const SkeletonBlock = ({
  height,
  width,
}: {
  height: number;
  width: number | `${number}%`;
}) => (
  <View style={[styles.skeletonBlock, { height, width }]} />
);

export const ScheduleFormSkeleton = () => (
  <SkeletonPulse>
    <View
      accessibilityLabel="Loading schedule form"
      accessibilityRole="progressbar"
      style={styles.skeletonContent}
    >
      <View style={styles.skeletonHeader}>
        <SkeletonBlock height={42} width={42} />
        <View style={styles.skeletonHeaderText}>
          <SkeletonBlock height={11} width="36%" />
          <SkeletonBlock height={22} width="58%" />
        </View>
      </View>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.skeletonSection}>
          <SkeletonBlock height={17} width="42%" />
          <SkeletonBlock height={50} width="100%" />
          <SkeletonBlock height={50} width="100%" />
          <SkeletonBlock height={50} width="100%" />
        </View>
      ))}
    </View>
  </SkeletonPulse>
);

const styles = StyleSheet.create({
  field: {
    marginTop: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.s7,
  },
  required: {
    color: colors.danger,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.mdPlus,
    minHeight: 50,
    paddingHorizontal: spacing.s13,
  },
  multilineContainer: {
    alignItems: "flex-start",
    minHeight: 96,
  },
  multilineIcon: {
    marginTop: spacing.s15,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingVertical: spacing.s11,
  },
  multilineInput: {
    minHeight: 94,
    paddingTop: spacing.s13,
  },
  invalidControl: {
    borderColor: colors.dangerBright,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.sm,
  },
  selectControl: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.mdPlus,
    minHeight: 50,
    paddingHorizontal: spacing.s13,
  },
  selectTextContainer: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  selectValue: {
    color: colors.textPrimary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  selectDescription: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    marginTop: spacing.s3,
  },
  placeholder: {
    color: colors.textSubtle,
    fontWeight: typography.weight.regular,
  },
  dateTimeValue: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
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
    padding: spacing.xxl,
  },
  modalHeaderText: {
    flex: 1,
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
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modalSearch: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.mdPlus,
    margin: spacing.xxl,
    minHeight: 48,
    paddingHorizontal: spacing.s13,
  },
  modalSearchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
    paddingVertical: spacing.mdPlus,
  },
  optionList: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
  },
  optionSeparator: {
    height: 10,
  },
  option: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 64,
    padding: spacing.lg,
  },
  selectedOption: {
    backgroundColor: colors.greenSurfaceLight,
    borderColor: colors.successBright,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 40,
    justifyContent: "center",
    marginRight: spacing.s11,
    width: 40,
  },
  optionContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  optionLabel: {
    color: colors.textPrimary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  optionDescription: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.s3,
  },
  optionsEmpty: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
    paddingHorizontal: spacing.xxxl,
  },
  optionsEmptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.lg,
  },
  optionsEmptyText: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.s19,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  pickerHeader: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdPlus,
  },
  pickerHeaderButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    minWidth: 64,
  },
  pickerTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  pickerCancelText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
  },
  pickerDoneText: {
    color: PRIMARY,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  pickerContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  skeletonBlock: {
    backgroundColor: colors.border,
    borderRadius: radius.md,
  },
  skeletonContent: {
    padding: spacing.xxl,
    paddingTop: spacing.s34,
  },
  skeletonHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: spacing.md,
  },
  skeletonSection: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.lgPlus,
    marginTop: spacing.xxl,
    padding: spacing.xl,
  },
});
