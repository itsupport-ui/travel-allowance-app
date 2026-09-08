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
import {
  buildFormDraftKey,
  loadFormDraft,
  removeFormDraft,
  saveFormDraft,
} from "../../src/utils/formDraftStorage";
import { getStoredUser } from "../../src/utils/storage";

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
type EntryMode = "manual" | "visit";
const expenseCategories = [
  { label: "Mileage", value: "mileage" },
  { label: "Public transport", value: "public_transport" },
  { label: "Toll / parking", value: "toll_parking" },
  { label: "Authorized other", value: "authorized_other" },
] as const;
type ExpenseCategory = (typeof expenseCategories)[number]["value"];

interface DoctorExpenseFormDraft {
  expenseDate: string;
  fare: string;
  remarks: string;
  transportMode: TransportMode;
  visitId: number | null;
  entryMode: EntryMode;
  expenseCategory: ExpenseCategory;
  fromLocation: string;
  toLocation: string;
  manualReason: string;
}

const isDoctorExpenseFormDraft = (
  value: unknown
): value is DoctorExpenseFormDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<DoctorExpenseFormDraft>;
  return (
    typeof draft.expenseDate === "string" &&
    typeof draft.fare === "string" &&
    typeof draft.remarks === "string" &&
    (draft.visitId === null || typeof draft.visitId === "number") &&
    (draft.entryMode === "visit" || draft.entryMode === "manual") &&
    expenseCategories.some((category) => category.value === draft.expenseCategory) &&
    typeof draft.fromLocation === "string" &&
    typeof draft.toLocation === "string" &&
    typeof draft.manualReason === "string" &&
    (draft.transportMode === "" ||
      transportModes.some((mode) => mode.value === draft.transportMode))
  );
};

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
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(editing);
  const [draftNotice, setDraftNotice] = useState<"restored" | "saved" | null>(
    null
  );
  const [expenseDate, setExpenseDate] = useState(getLocalIsoDate());
  const [entryMode, setEntryMode] = useState<EntryMode>("visit");
  const [expenseCategory, setExpenseCategory] =
    useState<ExpenseCategory>("public_transport");
  const [fare, setFare] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fromLocation, setFromLocation] = useState("");
  const [proofFile, setProofFile] =
    useState<DoctorProofAsset | null>(null);
  const [remarks, setRemarks] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
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
    enabled: !editing && entryMode === "visit",
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
    if (editing) return;
    let active = true;

    const initializeDraft = async () => {
      const user = await getStoredUser();
      if (!active) return;
      if (!user) {
        setDraftReady(true);
        return;
      }

      const key = buildFormDraftKey(user.id, "doctor-expense-create");
      setDraftKey(key);
      let stored;
      try {
        stored = await loadFormDraft<DoctorExpenseFormDraft>(key);
      } catch {
        setDraftReady(true);
        return;
      }
      if (!active) return;
      if (!stored || !isDoctorExpenseFormDraft(stored.data)) {
        if (stored) await removeFormDraft(key);
        setDraftReady(true);
        return;
      }

      Alert.alert(
        "Restore expense draft?",
        `A draft from ${new Date(stored.savedAt).toLocaleString()} is available. Receipt files are not stored and must be attached again.`,
        [
          {
            onPress: () => {
              void removeFormDraft(key);
              setDraftReady(true);
            },
            style: "destructive",
            text: "Discard",
          },
          {
            onPress: () => {
              setExpenseDate(stored.data.expenseDate);
              setEntryMode(stored.data.entryMode);
              setExpenseCategory(stored.data.expenseCategory);
              setFare(stored.data.fare);
              setFromLocation(stored.data.fromLocation);
              setToLocation(stored.data.toLocation);
              setManualReason(stored.data.manualReason);
              setRemarks(stored.data.remarks);
              setTransportMode(stored.data.transportMode);
              setVisitId(stored.data.visitId);
              setDraftNotice("restored");
              setDraftReady(true);
            },
            text: "Restore",
          },
        ],
        { cancelable: false }
      );
    };

    void initializeDraft();
    return () => {
      active = false;
    };
  }, [editing]);

  useEffect(() => {
    if (editing || !draftReady || !draftKey) return undefined;
    const timeout = setTimeout(() => {
      const hasDraftData =
        visitId !== null ||
        entryMode === "manual" ||
        Boolean(transportMode) ||
        Boolean(fare.trim()) ||
        Boolean(remarks.trim());
      if (!hasDraftData) {
        void removeFormDraft(draftKey);
        setDraftNotice(null);
        return;
      }

      void saveFormDraft<DoctorExpenseFormDraft>(draftKey, {
        expenseDate,
        entryMode,
        expenseCategory,
        fare,
        fromLocation,
        toLocation,
        manualReason,
        remarks,
        transportMode,
        visitId,
      })
        .then(() => setDraftNotice("saved"))
        .catch(() => setDraftNotice(null));
    }, 700);

    return () => clearTimeout(timeout);
  }, [
    draftKey,
    draftReady,
    editing,
    entryMode,
    expenseDate,
    expenseCategory,
    fare,
    fromLocation,
    manualReason,
    remarks,
    transportMode,
    toLocation,
    visitId,
  ]);

  useEffect(() => {
    if (
      editing ||
      !draftReady ||
      visitOptionsQuery.isPending ||
      !visitOptionsQuery.data ||
      visitId === null
    ) {
      return;
    }
    if (!availableVisits.some((option) => option.visit_id === visitId)) {
      setVisitId(null);
      setFormError("The visit saved in this draft is no longer available. Select another completed visit.");
    }
  }, [
    availableVisits,
    draftReady,
    editing,
    visitId,
    visitOptionsQuery.data,
    visitOptionsQuery.isPending,
  ]);

  useEffect(() => {
    if (!expense || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    setExpenseDate(expense.expense_date);
    setEntryMode(expense.visit_id === null ? "manual" : "visit");
    setExpenseCategory(
      expense.expense_category as ExpenseCategory
    );
    setFare(String(expense.fare));
    setFromLocation(expense.from_location);
    setRemarks(expense.remarks ?? "");
    setManualReason(expense.manual_reason ?? "");
    setToLocation(expense.to_location);
    setVisitId(expense.visit_id);
    setTransportMode(expense.transport_mode as TransportMode);
  }, [expense]);

  const mutation = useMutation({
    mutationFn: async () => {
      const request = {
        expense_date: expenseDate.trim(),
        expense_category: expenseCategory,
        fare: expenseCategory === "mileage" ? null : Number(fare),
        from_location:
          (editing && expense?.visit_id === null) ||
          (!editing && entryMode === "manual")
            ? fromLocation.trim()
            : undefined,
        manual_reason:
          (editing && expense?.visit_id === null) ||
          (!editing && entryMode === "manual")
            ? manualReason.trim()
            : undefined,
        correction_reason:
          editing && expense?.visit_id === null
            ? correctionReason.trim()
            : undefined,
        proof_file: proofFile,
        remarks: remarks.trim(),
        to_location:
          (editing && expense?.visit_id === null) ||
          (!editing && entryMode === "manual")
            ? toLocation.trim()
            : undefined,
        transport_mode: transportMode,
        version:
          editing && expense?.visit_id === null
            ? expense.manual_review_version
            : undefined,
        visit_id: editing
          ? (expense?.visit_id ?? null)
          : entryMode === "visit"
            ? visitId
            : null,
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
      if (draftKey) {
        await removeFormDraft(draftKey);
      }
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
          ? expense?.visit_id === null
            ? "The corrected expense was resubmitted for review."
            : "The draft expense was updated."
          : entryMode === "manual"
            ? "The manual expense was submitted for approval."
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
    if (!editing && entryMode === "visit" && visitId === null) {
      setFormError("Select a completed patient visit.");
      return;
    }
    if (
      ((editing && expense?.visit_id === null) ||
        (!editing && entryMode === "manual")) &&
      (!fromLocation.trim() || !toLocation.trim())
    ) {
      setFormError("From and to locations are required.");
      return;
    }
    if (
      !editing &&
      entryMode === "manual" &&
      expenseCategory === "mileage"
    ) {
      setFormError("Mileage requires a completed visit with a verified route.");
      return;
    }
    if (
      ((editing && expense?.visit_id === null) ||
        (!editing && entryMode === "manual")) &&
      manualReason.trim().length < 10
    ) {
      setFormError("Explain the manual expense in at least 10 characters.");
      return;
    }
    if (
      !editing &&
      entryMode === "manual" &&
      proofFile === null
    ) {
      setFormError("Attach a receipt for a manual expense.");
      return;
    }
    if (
      editing &&
      expense?.visit_id === null &&
      correctionReason.trim().length < 5
    ) {
      setFormError("Explain the correction in at least 5 characters.");
      return;
    }
    if (!transportMode) {
      setFormError("Select a transport mode.");
      return;
    }

    const amount = Number(fare);
    if (
      expenseCategory !== "mileage" &&
      (!Number.isFinite(amount) || amount <= 0)
    ) {
      setFormError("Enter an actual fare greater than zero.");
      return;
    }

    setFormError(null);
    submittingRef.current = true;
    mutation.mutate();
  };
  const discardLocalDraft = () => {
    Alert.alert(
      "Discard local draft?",
      "This clears the unsaved visit, fare, transport mode, and remarks from this device.",
      [
        { style: "cancel", text: "Keep Draft" },
        {
          onPress: () => {
            if (draftKey) void removeFormDraft(draftKey);
            setExpenseDate(getLocalIsoDate());
            setEntryMode("visit");
            setExpenseCategory("public_transport");
            setFare("");
            setFormError(null);
            setProofFile(null);
            setRemarks("");
            setManualReason("");
            setCorrectionReason("");
            setTransportMode("");
            setVisitId(null);
            setDraftNotice(null);
          },
          style: "destructive",
          text: "Discard",
        },
      ]
    );
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
    !(
      expense.visit_id !== null
        ? expense.status === "draft" && expense.claim_id === null
        : expense.available_actions.includes("edit")
    )
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
          {!editing && draftNotice ? (
            <View style={styles.draftNotice}>
              <View style={styles.draftTextContainer}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={styles.draftTitle}
                >
                  {draftNotice === "restored"
                    ? "Draft restored"
                    : "Draft saved on this device"}
                </Text>
                <Text style={styles.draftText}>
                  Receipt files are never stored in the local draft.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Discard local expense draft"
                accessibilityRole="button"
                onPress={discardLocalDraft}
              >
                <Text style={styles.discardDraft}>Discard</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!editing ? (
            <>
              <Text style={styles.sectionLabel}>Expense source *</Text>
              <DoctorChoiceChips
                onChange={(value) => {
                  setEntryMode(value);
                  setVisitId(null);
                  setFromLocation("");
                  setToLocation("");
                  setExpenseCategory("public_transport");
                  setFormError(null);
                }}
                options={[
                  { label: "Completed visit", value: "visit" },
                  { label: "Manual exception", value: "manual" },
                ]}
                value={entryMode}
              />
              {entryMode === "manual" ? (
                <Text style={styles.manualHelp}>
                  Use only when a completed visit cannot provide the route. A reason and receipt are required; approval is required before claiming.
                </Text>
              ) : null}
            </>
          ) : null}
          {editing || entryMode === "manual" ? (
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

          {!editing && entryMode === "visit" ? (
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
            editable={
              (editing && expense?.visit_id === null) ||
              (!editing && entryMode === "manual")
            }
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
            editable={
              (editing && expense?.visit_id === null) ||
              (!editing && entryMode === "manual")
            }
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

          <Text style={styles.sectionLabel}>Expense category *</Text>
          <DoctorChoiceChips
            onChange={(value) => {
              setExpenseCategory(value);
              if (value === "mileage") setTransportMode("car");
              setFormError(null);
            }}
            options={expenseCategories.filter(
              (category) =>
                entryMode === "visit" || category.value !== "mileage"
            )}
            value={expenseCategory}
          />
          {formError === "Mileage requires a completed visit with a verified route." ? (
            <Text style={styles.choiceError}>{formError}</Text>
          ) : null}

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

          {expenseCategory === "mileage" ? (
            <DoctorField
              editable={false}
              label="Calculated reimbursement"
              value={
                expense?.rate_applied && expense.distance_km
                  ? `${expense.distance_km.toFixed(2)} km × INR ${expense.rate_applied.toFixed(2)} = INR ${expense.fare.toFixed(2)}`
                  : "Calculated from verified distance and active policy"
              }
            />
          ) : (
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
          )}

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
          {formError === "Attach a receipt for a manual expense." ? (
            <Text style={styles.choiceError}>{formError}</Text>
          ) : null}

          {entryMode === "manual" ? (
            <DoctorField
              error={
                formError === "Explain the manual expense in at least 10 characters."
                  ? formError
                  : null
              }
              label="Why is this manual?"
              multiline
              required
              value={manualReason}
              onChangeText={(value) => {
                setManualReason(value);
                setFormError(null);
              }}
            />
          ) : null}

          {editing && expense?.visit_id === null ? (
            <DoctorField
              error={
                formError === "Explain the correction in at least 5 characters."
                  ? formError
                  : null
              }
              label="Correction summary"
              multiline
              required
              value={correctionReason}
              onChangeText={(value) => {
                setCorrectionReason(value);
                setFormError(null);
              }}
            />
          ) : null}

          <DoctorField
            label="Remarks"
            multiline
            value={remarks}
            onChangeText={setRemarks}
          />

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>
              {entryMode === "visit" ? "Route verified" : "Manual exception review"}
            </Text>
            <Text style={styles.noticeText}>
              {entryMode === "visit"
                ? "Locations and distance come from attendance and patient visit GPS. Mileage is calculated by the server; actual-fare categories use the amount entered."
                : "Typed routes are weaker evidence, so this expense cannot enter a claim until an administrator approves it."}
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                mutation.isPending ||
                (!editing && entryMode === "visit" && availableVisits.length === 0),
            }}
            disabled={
              mutation.isPending ||
              (!editing && entryMode === "visit" && availableVisits.length === 0)
            }
            style={[
              styles.submitButton,
              (mutation.isPending ||
                (!editing && entryMode === "visit" && availableVisits.length === 0)) &&
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
  draftNotice: {
    alignItems: "center",
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  draftTextContainer: {
    flex: 1,
  },
  draftTitle: {
    color: colors.primaryDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  draftText: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  discardDraft: {
    color: colors.danger,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
  },
  sectionLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  manualHelp: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    color: colors.warningDark,
    fontSize: typography.size.small,
    lineHeight: typography.lineHeight.smallRelaxed,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
    padding: spacing.lg,
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
