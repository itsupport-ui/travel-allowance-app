import { colors, radius, spacing, typography } from "@/src/theme";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatDateForApi,
  formatDateForDisplay,
  parseApiDate,
} from "../../utils/date";

interface AppDatePickerFieldProps {
  allowClear?: boolean;
  error?: string | null;
  label: string;
  minimumDate?: Date;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}

export function AppDatePickerField({
  allowClear = false,
  error,
  label,
  minimumDate,
  onChange,
  placeholder = "Select date",
  required = false,
  value,
}: AppDatePickerFieldProps) {
  const parsedValue = parseApiDate(value);
  const pickerValue = parsedValue ?? minimumDate ?? new Date();
  const [visible, setVisible] = useState(false);
  const [draftValue, setDraftValue] = useState(pickerValue);
  const displayValue = parsedValue
    ? formatDateForDisplay(parsedValue)
    : placeholder;

  const openPicker = () => {
    const nextValue = parseApiDate(value) ?? minimumDate ?? new Date();
    setDraftValue(nextValue);
    setVisible(true);
  };

  const handleAndroidChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    setVisible(false);
    if (event.type !== "dismissed" && selectedDate) {
      onChange(formatDateForApi(selectedDate));
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.inputRow}>
        <TouchableOpacity
          accessibilityHint={`Opens the ${label.toLowerCase()} date picker`}
          accessibilityLabel={`${label}: ${displayValue}`}
          accessibilityRole="button"
          activeOpacity={0.82}
          style={[styles.input, error ? styles.inputError : null]}
          onPress={openPicker}
        >
          <Ionicons
            color={colors.textMuted}
            name="calendar-outline"
            size={18}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.inputText,
              !parsedValue ? styles.placeholderText : null,
            ]}
          >
            {displayValue}
          </Text>
          <Ionicons
            color={colors.textMuted}
            name="chevron-down"
            size={18}
          />
        </TouchableOpacity>
        {allowClear && value ? (
          <TouchableOpacity
            accessibilityLabel={`Clear ${label}`}
            accessibilityRole="button"
            style={styles.clearButton}
            onPress={() => onChange("")}
          >
            <Ionicons
              color={colors.textMutedDark}
              name="close"
              size={18}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {visible && Platform.OS === "android" ? (
        <DateTimePicker
          display="default"
          minimumDate={minimumDate}
          mode="date"
          value={pickerValue}
          onChange={handleAndroidChange}
        />
      ) : null}

      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={visible && Platform.OS === "ios"}
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={styles.modalHeaderButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{label}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                onChange(formatDateForApi(draftValue));
                setVisible(false);
              }}
              style={styles.modalHeaderButton}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pickerContent}>
            <DateTimePicker
              display="spinner"
              minimumDate={minimumDate}
              mode="date"
              value={draftValue}
              onChange={(_, selectedDate) => {
                if (selectedDate) {
                  setDraftValue(selectedDate);
                }
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  required: {
    color: colors.danger,
  },
  inputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  input: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  inputError: {
    borderColor: colors.danger,
  },
  inputText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.size.body,
  },
  placeholderText: {
    color: colors.textSubtle,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: colors.neutral100,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  modalSafeArea: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  modalHeaderButton: {
    minWidth: 72,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.bold,
  },
  doneText: {
    color: colors.primary,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    textAlign: "right",
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
  },
  pickerContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
});
