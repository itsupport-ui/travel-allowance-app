import { colors, radius, spacing, typography } from "@/src/theme";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  createDoctorExpense,
  getTodayCompletedDoctorVisits,
  getMyDoctorExpenses,
  updateDoctorExpense,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type {
  DoctorProofAsset,
  DoctorVisitExpenseOption,
} from "../../src/types/doctorWorkflow";
import {
  getLocalIsoDate,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const transportModes = [
  { label: "Auto", value: "auto" },
  { label: "Bus", value: "bus" },
  { label: "Cab / Taxi", value: "cab" },
  { label: "Car", value: "car" },
  { label: "Train", value: "train" },
  { label: "Other", value: "other" },
] as const;
type TransportMode = (typeof transportModes)[number]["value"] | "";

const inferMimeType = (name: string, mimeType?: string): string => {
  if (mimeType) return mimeType;
  const normalized = name.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  return "image/jpeg";
};

const isValidDate = (value: string): boolean => {
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

function VisitOption({
  onPress,
  option,
  selected,
}: {
  onPress: () => void;
  option: DoctorVisitExpenseOption;
  selected: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      style={[styles.visitOption, selected && styles.selectedVisitOption]}
      onPress={onPress}
    >
      <View style={styles.visitOptionText}>
        <Text style={styles.visitPatient}>{option.patient_name}</Text>
        <Text style={styles.visitMeta}>
          {option.patient_address} · {option.visit_time.slice(0, 5)}
        </Text>
        <Text style={styles.visitRoute}>
          {option.from_location} to {option.to_location}
        </Text>
      </View>
      <Ionicons
        color={selected ? colors.primary : colors.textSubtle}
        name={
          selected ? "checkmark-circle" : "radio-button-off-outline"
        }
        size={22}
      />
    </TouchableOpacity>
  );
}

export default function DoctorExpenseFormScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const editing = rawId !== undefined;
  const expenseId = useMemo(() => parsePositiveId(params.id), [params.id]);
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const initializedRef = useRef(false);
  const [expenseDate, setExpenseDate] = useState(getLocalIsoDate());
  const [fare, setFare] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fromLocation, setFromLocation] = useState("");
  const [proofFile, setProofFile] =
    useState<DoctorProofAsset | null>(null);
  const [remarks, setRemarks] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [visitId, setVisitId] = useState<number | null>(null);
  const [transportMode, setTransportMode] =
    useState<TransportMode>("");
  const expensesQuery = useQuery({
    enabled: editing,
    queryFn: getMyDoctorExpenses,
    queryKey: queryKeys.doctor.expenses.mine,
  });
  const expense = editing
    ? expensesQuery.data?.find((item) => item.id === expenseId)
    : undefined;
  const visitOptionsQuery = useQuery({
    enabled: !editing,
    queryFn: getTodayCompletedDoctorVisits,
    queryKey: queryKeys.doctor.visits.completedToday,
  });
  const availableVisits = useMemo(
    () =>
      (visitOptionsQuery.data ?? []).filter(
        (option) => option.expense_id === null
      ),
    [visitOptionsQuery.data]
  );
  const selectedVisit = useMemo(
    () =>
      availableVisits.find((option) => option.visit_id === visitId) ??
      null,
    [availableVisits, visitId]
  );

  useEffect(() => {
    if (!expense || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    setExpenseDate(expense.expense_date);
    setFare(String(expense.fare));
    setFromLocation(expense.from_location);
    setRemarks(expense.remarks ?? "");
    setToLocation(expense.to_location);
    setVisitId(expense.visit_id);
    setTransportMode(expense.transport_mode as TransportMode);
  }, [expense]);

  const mutation = useMutation({
    mutationFn: async () => {
      const request = {
        expense_date: expenseDate.trim(),
        fare: Number(fare),
        from_location:
          editing && expense?.visit_id === null
            ? fromLocation.trim()
            : undefined,
        proof_file: proofFile,
        remarks: remarks.trim(),
        to_location:
          editing && expense?.visit_id === null
            ? toLocation.trim()
            : undefined,
        transport_mode: transportMode,
        visit_id: editing ? (expense?.visit_id ?? null) : visitId,
      };

      if (editing) {
        if (expenseId === null) {
          throw new Error("A valid expense ID is required.");
        }
        return updateDoctorExpense(expenseId, request);
      }

      return createDoctorExpense(request);
    },
    onError: (error) => {
      Alert.alert(
        editing ? "Unable to Update Expense" : "Unable to Add Expense",
        getApiErrorMessage(
          error,
          editing
            ? "Unable to update this expense."
            : "Unable to add this expense."
        )
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.expenses.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.claims.all,
        }),
      ]);
      Alert.alert(
        editing ? "Expense Updated" : "Expense Added",
        editing
          ? "The draft expense was updated."
          : "The expense was saved as a draft.",
        [
          {
            onPress: () =>
              router.replace("/(doctor)/(tabs)/expenses"),
            text: "Done",
          },
        ]
      );
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/expenses");
    }
  };
  const pickProof = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["application/pdf", "image/jpeg", "image/png"],
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_PROOF_BYTES) {
      setFormError("Receipt files must be 5 MB or smaller.");
      return;
    }

    setProofFile({
      mimeType: inferMimeType(asset.name, asset.mimeType),
      name: asset.name,
      size: asset.size ?? null,
      uri: asset.uri,
    });
    setFormError(null);
  };
  const submit = () => {
    if (submittingRef.current || mutation.isPending) {
      return;
    }

    if (!isValidDate(expenseDate.trim())) {
      setFormError("Select a valid expense date.");
      return;
    }
    if (!editing && visitId === null) {
      setFormError("Select a completed patient visit.");
      return;
    }
    if (
      editing &&
      expense?.visit_id === null &&
      (!fromLocation.trim() || !toLocation.trim())
    ) {
      setFormError("From and to locations are required.");
      return;
    }
    if (!transportMode) {
      setFormError("Select a transport mode.");
      return;
    }

    const amount = Number(fare);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter an actual fare greater than zero.");
      return;
    }

    setFormError(null);
    submittingRef.current = true;
    mutation.mutate();
  };

  if (editing && expensesQuery.isPending && !expensesQuery.data) {
    return <DoctorLoadingState label="Loading expense..." />;
  }

  if (
    editing &&
    (expenseId === null || (expensesQuery.error && !expensesQuery.data))
  ) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Edit Expense" />
        <DoctorErrorState
          message={
            expenseId === null
              ? "A valid expense ID is required."
              : getApiErrorMessage(
                  expensesQuery.error,
                  "Unable to load this expense."
                )
          }
          onRetry={() =>
            expenseId === null
              ? goBack()
              : void expensesQuery.refetch()
          }
          title="Expense unavailable"
        />
      </SafeAreaView>
    );
  }

  if (editing && expensesQuery.data && !expense) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Edit Expense" />
        <DoctorErrorState
          message="This expense was not found."
          onRetry={goBack}
          title="Expense unavailable"
        />
      </SafeAreaView>
    );
  }

  if (
    editing &&
    expense &&
    (expense.status !== "draft" || expense.claim_id !== null)
  ) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Edit Expense" />
        <DoctorErrorState
          message="Only unlinked draft expenses can be edited."
          onRetry={goBack}
          title="Expense is read-only"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        onBack={goBack}
        title={editing ? "Edit Expense" : "Add Expense"}
      />
      <View style={styles.flex}>
        <FormScrollView
          contentContainerStyle={styles.content}
        >
          {editing ? (
            <AppDatePickerField
              error={
                formError === "Select a valid expense date."
                  ? formError
                  : null
              }
              label="Expense date"
              required
              value={expenseDate}
              onChange={(value) => {
                setExpenseDate(value);
                setFormError(null);
              }}
            />
          ) : (
            <DoctorField
              editable={false}
              label="Expense date"
              value={expenseDate}
            />
          )}

          {!editing ? (
            <>
              <Text style={styles.sectionLabel}>
                Completed patient visit *
              </Text>
              {visitOptionsQuery.isPending ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={styles.optionLoader}
                />
              ) : availableVisits.length === 0 ? (
                <View style={styles.noVisits}>
                  <Text style={styles.noVisitsTitle}>
                    No completed patient visits available for today&apos;s
                    expenses.
                  </Text>
                  <Text style={styles.noVisitsText}>
                    Start your workday and Punch Out from a patient visit
                    before creating an expense.
                  </Text>
                </View>
              ) : (
                <View style={styles.visitOptions}>
                  {availableVisits.map((option) => (
                    <VisitOption
                      key={option.visit_id}
                      onPress={() => {
                        setVisitId(option.visit_id);
                        setFromLocation(option.from_location);
                        setToLocation(option.to_location);
                        setFormError(null);
                      }}
                      option={option}
                      selected={visitId === option.visit_id}
                    />
                  ))}
                </View>
              )}
              {formError === "Select a completed patient visit." ? (
                <Text style={styles.choiceError}>{formError}</Text>
              ) : null}
            </>
          ) : null}

          <DoctorField
            editable={editing && expense?.visit_id === null}
            error={
              formError === "From and to locations are required."
                ? formError
                : null
            }
            label="Travel from"
            value={selectedVisit?.from_location ?? fromLocation}
            onChangeText={setFromLocation}
          />
          <DoctorField
            editable={editing && expense?.visit_id === null}
            label="Travel to"
            value={selectedVisit?.to_location ?? toLocation}
            onChangeText={setToLocation}
          />
          <DoctorField
            editable={false}
            label="Distance"
            value={
              selectedVisit?.distance_km == null
                ? expense?.distance_km == null
                  ? "Calculated on submission"
                  : `${expense.distance_km.toFixed(2)} km`
                : `${selectedVisit.distance_km.toFixed(2)} km`
            }
          />

          <Text style={styles.sectionLabel}>Transport mode *</Text>
          <DoctorChoiceChips
            onChange={(value) => {
              setTransportMode(value);
              setFormError(null);
            }}
            options={transportModes}
            value={transportMode}
          />
          {formError === "Select a transport mode." ? (
            <Text style={styles.choiceError}>{formError}</Text>
          ) : null}

          <DoctorField
            error={
              formError === "Enter an actual fare greater than zero."
                ? formError
                : null
            }
            keyboardType="decimal-pad"
            label="Actual fare"
            placeholder="0.00"
            required
            value={fare}
            onChangeText={(value) => {
              setFare(value);
              setFormError(null);
            }}
          />

          <Text style={styles.sectionLabel}>Receipt (optional)</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.uploadCard}
            onPress={() => void pickProof()}
          >
            <View style={styles.uploadIcon}>
              <Ionicons
                color={colors.primary}
                name="cloud-upload-outline"
                size={23}
              />
            </View>
            <View style={styles.uploadText}>
              <Text numberOfLines={1} style={styles.uploadTitle}>
                {proofFile?.name ||
                  expense?.proof_file ||
                  "Choose receipt file"}
              </Text>
              <Text style={styles.uploadHint}>
                PDF, JPG, JPEG, or PNG · maximum 5 MB
              </Text>
            </View>
          </TouchableOpacity>
          {expense?.proof_file && !proofFile ? (
            <Text style={styles.existingProof}>
              Choose a new file only to replace the current receipt.
            </Text>
          ) : null}
          {formError === "Receipt files must be 5 MB or smaller." ? (
            <Text style={styles.choiceError}>{formError}</Text>
          ) : null}

          <DoctorField
            label="Remarks"
            multiline
            value={remarks}
            onChangeText={setRemarks}
          />

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Route verified</Text>
            <Text style={styles.noticeText}>
              Locations and distance come from attendance and patient
              visit GPS. Enter only the actual fare paid.
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                mutation.isPending ||
                (!editing && availableVisits.length === 0),
            }}
            disabled={
              mutation.isPending ||
              (!editing && availableVisits.length === 0)
            }
            style={[
              styles.submitButton,
              (mutation.isPending ||
                (!editing && availableVisits.length === 0)) &&
                styles.disabledButton,
            ]}
            onPress={submit}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : null}
            <Text style={styles.submitText}>
              {mutation.isPending
                ? "Saving..."
                : editing
                  ? "Update Expense"
                  : "Add Expense"}
            </Text>
          </TouchableOpacity>
        </FormScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  sectionLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  choiceError: {
    color: colors.danger,
    fontSize: typography.size.small,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  optionLoader: {
    marginVertical: spacing.xl,
  },
  noVisits: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  noVisitsTitle: {
    color: colors.warningDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  noVisitsText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginTop: spacing.sm,
  },
  visitOptions: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  visitOption: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  selectedVisitOption: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  visitOptionText: {
    flex: 1,
  },
  visitPatient: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  visitMeta: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  visitRoute: {
    color: colors.primary,
    fontSize: typography.size.small,
    marginTop: spacing.sm,
  },
  uploadCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 72,
    padding: spacing.lg,
  },
  uploadIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderRadius: radius.control,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  uploadText: {
    flex: 1,
  },
  uploadTitle: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  uploadHint: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  existingProof: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginBottom: spacing.xl,
  },
  notice: {
    backgroundColor: colors.neutral100,
    borderRadius: radius.control,
    padding: spacing.lg,
  },
  noticeTitle: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginTop: spacing.xs,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xxxl,
    minHeight: 52,
  },
  disabledButton: {
    opacity: 0.65,
  },
  submitText: {
    color: colors.surface,
    fontSize: typography.size.body,
    fontWeight: typography.weight.extrabold,
  },
});
