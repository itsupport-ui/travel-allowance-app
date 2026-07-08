import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorEmptyState,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
  DoctorStatusBadge,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  confirmDoctorConsultation,
  createDoctorConsultation,
  createVisitFromConsultation,
  getAdminDoctorConsultations,
  getConsultationDoctors,
  rejectDoctorConsultation,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type {
  CreateDoctorConsultationRequest,
  DoctorConsultation,
  DoctorConsultationFilters,
} from "../../src/types/doctorWorkflow";
import type { Doctor } from "../../src/types/doctor";
import {
  formatDoctorDate,
  getLocalIsoDate,
  nullableDoctorText,
} from "../../src/utils/doctorWorkflow";

type ActivePanel = "create" | "reject" | "visit" | null;

const emptyConsultationForm = {
  doctor_id: "",
  notes: "",
  patient_address: "",
  patient_name: "",
  patient_phone: "",
  purpose: "",
  scheduled_date: getLocalIsoDate(),
  scheduled_time: "",
};

const emptyFilters = {
  doctor_id: "",
  from_date: "",
  patient_decision: "",
  status: "",
  to_date: "",
};

const isIsoDate = (value: string): boolean =>
  !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

const isTime = (value: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const statusFilters = [
  { label: "All", value: "" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
] as const;

const decisionFilters = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Rejected", value: "rejected" },
  { label: "Follow up", value: "follow_up" },
] as const;

const actionablePatientDecisions = new Set(["pending", "follow_up"]);

const getConsultationVisitId = (
  consultation: DoctorConsultation
): number | null =>
  consultation.visit_id ?? consultation.doctor_visit_id ?? null;

const isConsultationConverted = (
  consultation: DoctorConsultation
): boolean =>
  Boolean(consultation.has_visit) ||
  Boolean(getConsultationVisitId(consultation));

const EMPTY_CONSULTATIONS: DoctorConsultation[] = [];
const EMPTY_DOCTORS: Doctor[] = [];

export default function AdminDoctorConsultationsScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] =
    useState<DoctorConsultationFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<DoctorConsultationFilters>(emptyFilters);
  const [panel, setPanel] = useState<ActivePanel>(null);
  const [selectedConsultation, setSelectedConsultation] =
    useState<DoctorConsultation | null>(null);
  const [consultationForm, setConsultationForm] = useState(
    emptyConsultationForm
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [visitForm, setVisitForm] = useState({
    remarks: "",
    visit_date: getLocalIsoDate(),
    visit_time: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const consultationsQuery = useQuery({
    queryFn: () => getAdminDoctorConsultations(appliedFilters),
    queryKey: [
      ...queryKeys.adminDoctorWorkflow.consultations,
      appliedFilters,
    ],
  });
  const doctorsQuery = useQuery({
    queryFn: getConsultationDoctors,
    queryKey: queryKeys.adminDoctorWorkflow.doctors,
  });
  const consultations = consultationsQuery.data ?? EMPTY_CONSULTATIONS;
  const doctors = doctorsQuery.data ?? EMPTY_DOCTORS;
  const doctorNameById = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.id, doctor.name])),
    [doctors]
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.adminDoctorWorkflow.consultations,
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateDoctorConsultationRequest = {
        doctor_id: Number(consultationForm.doctor_id),
        notes: nullableDoctorText(consultationForm.notes),
        patient_address: consultationForm.patient_address.trim(),
        patient_name: consultationForm.patient_name.trim(),
        patient_phone: consultationForm.patient_phone.trim(),
        purpose: consultationForm.purpose.trim(),
        scheduled_date: consultationForm.scheduled_date.trim(),
        scheduled_time: consultationForm.scheduled_time.trim(),
      };
      return createDoctorConsultation(payload);
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Schedule Consultation",
        getApiErrorMessage(error, "Unable to schedule this consultation.")
      );
    },
    onSuccess: async () => {
      await invalidate();
      setPanel(null);
      setConsultationForm(emptyConsultationForm);
      Alert.alert("Consultation Scheduled", "The consultation was created.");
    },
  });
  const confirmMutation = useMutation({
    mutationFn: confirmDoctorConsultation,
    onError: (error) => {
      Alert.alert(
        "Unable to Confirm",
        getApiErrorMessage(error, "Unable to confirm this consultation.")
      );
    },
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Consultation Confirmed", "Patient decision was confirmed.");
    },
  });
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConsultation) {
        throw new Error("Select a consultation first.");
      }
      return rejectDoctorConsultation(
        selectedConsultation.id,
        rejectionReason.trim()
      );
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Reject",
        getApiErrorMessage(error, "Unable to reject this consultation.")
      );
    },
    onSuccess: async () => {
      await invalidate();
      setPanel(null);
      setSelectedConsultation(null);
      setRejectionReason("");
      Alert.alert("Consultation Rejected", "Rejection reason was saved.");
    },
  });
  const createVisitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConsultation) {
        throw new Error("Select a consultation first.");
      }
      return createVisitFromConsultation(selectedConsultation.id, {
        remarks: nullableDoctorText(visitForm.remarks),
        visit_date: visitForm.visit_date.trim(),
        visit_time: visitForm.visit_time.trim(),
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Create Visit",
        getApiErrorMessage(error, "Unable to create a visit from this consultation.")
      );
    },
    onSuccess: async (visit) => {
      await invalidate();
      setPanel(null);
      setSelectedConsultation(null);
      setVisitForm({
        remarks: "",
        visit_date: getLocalIsoDate(),
        visit_time: "",
      });
      Alert.alert("Visit Created", `Doctor visit #${visit.id} was created.`);
    },
  });

  const openCreate = () => {
    setFormError(null);
    setSelectedConsultation(null);
    setConsultationForm(emptyConsultationForm);
    setPanel("create");
  };
  const openReject = (consultation: DoctorConsultation) => {
    setFormError(null);
    setSelectedConsultation(consultation);
    setRejectionReason("");
    setPanel("reject");
  };
  const openVisit = (consultation: DoctorConsultation) => {
    if (isConsultationConverted(consultation)) {
      Alert.alert(
        "Visit already created",
        "This consultation has already been converted to a doctor visit."
      );
      return;
    }
    setFormError(null);
    setSelectedConsultation(consultation);
    setVisitForm({
      remarks: "",
      visit_date: getLocalIsoDate(),
      visit_time: "",
    });
    setPanel("visit");
  };
  const submitCreate = () => {
    if (
      !consultationForm.patient_name.trim() ||
      !consultationForm.patient_phone.trim() ||
      !consultationForm.patient_address.trim() ||
      !consultationForm.doctor_id ||
      !consultationForm.scheduled_date.trim() ||
      !consultationForm.scheduled_time.trim() ||
      !consultationForm.purpose.trim()
    ) {
      setFormError("Patient, doctor, schedule, and purpose are required.");
      return;
    }
    if (!isIsoDate(consultationForm.scheduled_date)) {
      setFormError("Scheduled date must use YYYY-MM-DD format.");
      return;
    }
    if (consultationForm.scheduled_date < getLocalIsoDate()) {
      setFormError("Scheduled date cannot be in the past.");
      return;
    }
    if (!isTime(consultationForm.scheduled_time)) {
      setFormError("Scheduled time must use HH:MM 24-hour format.");
      return;
    }
    setFormError(null);
    createMutation.mutate();
  };
  const submitReject = () => {
    if (!rejectionReason.trim()) {
      setFormError("Rejection reason is required.");
      return;
    }
    setFormError(null);
    rejectMutation.mutate();
  };
  const submitVisit = () => {
    if (
      selectedConsultation &&
      isConsultationConverted(selectedConsultation)
    ) {
      Alert.alert(
        "Visit already created",
        "This consultation has already been converted to a doctor visit."
      );
      setPanel(null);
      setSelectedConsultation(null);
      return;
    }
    if (!visitForm.visit_date.trim() || !visitForm.visit_time.trim()) {
      setFormError("Visit date and time are required.");
      return;
    }
    if (!isIsoDate(visitForm.visit_date)) {
      setFormError("Visit date must use YYYY-MM-DD format.");
      return;
    }
    if (visitForm.visit_date < getLocalIsoDate()) {
      setFormError("Visit date cannot be in the past.");
      return;
    }
    if (!isTime(visitForm.visit_time)) {
      setFormError("Visit time must use HH:MM 24-hour format.");
      return;
    }
    setFormError(null);
    createVisitMutation.mutate();
  };
  const confirmConsultation = (consultation: DoctorConsultation) => {
    Alert.alert(
      "Confirm Consultation?",
      `Confirm the patient decision for ${consultation.patient_name}?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => confirmMutation.mutate(consultation.id),
          text: "Confirm",
        },
      ]
    );
  };

  if (
    (consultationsQuery.isPending && !consultationsQuery.data) ||
    (doctorsQuery.isPending && !doctorsQuery.data)
  ) {
    return <DoctorLoadingState label="Loading doctor consultations..." />;
  }

  if (
    (consultationsQuery.error && !consultationsQuery.data) ||
    (doctorsQuery.error && !doctorsQuery.data)
  ) {
    const error = consultationsQuery.error ?? doctorsQuery.error;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader
          onBack={() => router.back()}
          title="Doctor Consultations"
        />
        <DoctorErrorState
          message={getApiErrorMessage(
            error,
            "Unable to load doctor consultations."
          )}
          onRetry={() =>
            void Promise.all([
              consultationsQuery.refetch(),
              doctorsQuery.refetch(),
            ])
          }
          title="Consultations unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        action={
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.headerButton}
            onPress={openCreate}
          >
            <Ionicons color={colors.primary} name="add" size={22} />
          </TouchableOpacity>
        }
        onBack={() => router.back()}
        title="Doctor Consultations"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              refreshing={consultationsQuery.isRefetching}
              tintColor={colors.primary}
              onRefresh={() => void consultationsQuery.refetch()}
            />
          }
        >
          <Text style={styles.eyebrow}>Doctor Workflow</Text>
          <Text style={styles.title}>Consultations</Text>
          <Text style={styles.subtitle}>
            Schedule calls, review patient decisions, and create confirmed visits.
          </Text>

          <FilterCard
            doctors={doctors}
            filters={filters}
            onApply={() => setAppliedFilters(filters)}
            onClear={() => {
              setFilters(emptyFilters);
              setAppliedFilters(emptyFilters);
            }}
            onChange={setFilters}
          />

          {panel === "create" ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Schedule consultation</Text>
              <DoctorField
                label="Patient name"
                required
                value={consultationForm.patient_name}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    patient_name: value,
                  }))
                }
              />
              <DoctorField
                keyboardType="phone-pad"
                label="Patient phone"
                required
                value={consultationForm.patient_phone}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    patient_phone: value,
                  }))
                }
              />
              <DoctorField
                label="Patient address"
                multiline
                required
                value={consultationForm.patient_address}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    patient_address: value,
                  }))
                }
              />
              <DoctorSelectList
                doctors={doctors}
                selectedId={consultationForm.doctor_id}
                onSelect={(doctorId) =>
                  setConsultationForm((current) => ({
                    ...current,
                    doctor_id: doctorId,
                  }))
                }
              />
              <DoctorField
                label="Scheduled date"
                placeholder="YYYY-MM-DD"
                required
                value={consultationForm.scheduled_date}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    scheduled_date: value,
                  }))
                }
              />
              <DoctorField
                label="Scheduled time"
                placeholder="HH:MM"
                required
                value={consultationForm.scheduled_time}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    scheduled_time: value,
                  }))
                }
              />
              <DoctorField
                label="Purpose"
                multiline
                required
                value={consultationForm.purpose}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    purpose: value,
                  }))
                }
              />
              <DoctorField
                label="Notes"
                multiline
                value={consultationForm.notes}
                onChangeText={(value) =>
                  setConsultationForm((current) => ({
                    ...current,
                    notes: value,
                  }))
                }
              />
              <PanelActions
                busy={createMutation.isPending}
                error={formError}
                primaryLabel="Schedule"
                onCancel={() => setPanel(null)}
                onSubmit={submitCreate}
              />
            </View>
          ) : null}

          {panel === "reject" && selectedConsultation ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Reject consultation</Text>
              <Text style={styles.panelSubtitle}>
                {selectedConsultation.patient_name}
              </Text>
              <DoctorField
                label="Rejection reason"
                multiline
                required
                value={rejectionReason}
                onChangeText={setRejectionReason}
              />
              <PanelActions
                busy={rejectMutation.isPending}
                destructive
                error={formError}
                primaryLabel="Reject"
                onCancel={() => setPanel(null)}
                onSubmit={submitReject}
              />
            </View>
          ) : null}

          {panel === "visit" && selectedConsultation ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Create doctor visit</Text>
              <Text style={styles.panelSubtitle}>
                {selectedConsultation.patient_name}
              </Text>
              <DoctorField
                label="Visit date"
                placeholder="YYYY-MM-DD"
                required
                value={visitForm.visit_date}
                onChangeText={(value) =>
                  setVisitForm((current) => ({
                    ...current,
                    visit_date: value,
                  }))
                }
              />
              <DoctorField
                label="Visit time"
                placeholder="HH:MM"
                required
                value={visitForm.visit_time}
                onChangeText={(value) =>
                  setVisitForm((current) => ({
                    ...current,
                    visit_time: value,
                  }))
                }
              />
              <DoctorField
                label="Remarks"
                multiline
                value={visitForm.remarks}
                onChangeText={(value) =>
                  setVisitForm((current) => ({
                    ...current,
                    remarks: value,
                  }))
                }
              />
              <PanelActions
                busy={createVisitMutation.isPending}
                error={formError}
                primaryLabel="Create Visit"
                onCancel={() => setPanel(null)}
                onSubmit={submitVisit}
              />
            </View>
          ) : null}

          {consultations.length === 0 ? (
            <DoctorEmptyState
              description="No consultations match the selected filters."
              icon="call-outline"
              title="No consultations"
            />
          ) : (
            consultations.map((consultation) => (
              <ConsultationCard
                busy={
                  confirmMutation.isPending ||
                  rejectMutation.isPending ||
                  createVisitMutation.isPending
                }
                consultation={consultation}
                doctorName={
                  doctorNameById.get(consultation.doctor_id) ??
                  `Doctor #${consultation.doctor_id}`
                }
                key={consultation.id}
                onConfirm={confirmConsultation}
                onReject={openReject}
                onVisit={openVisit}
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FilterCard({
  doctors,
  filters,
  onApply,
  onChange,
  onClear,
}: {
  doctors: Doctor[];
  filters: DoctorConsultationFilters;
  onApply: () => void;
  onChange: (filters: DoctorConsultationFilters) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.filterCard}>
      <Text style={styles.filterLabel}>Status</Text>
      <DoctorChoiceChips
        onChange={(value) => onChange({ ...filters, status: value })}
        options={statusFilters}
        value={(filters.status ?? "") as (typeof statusFilters)[number]["value"]}
      />
      <Text style={styles.filterLabel}>Patient decision</Text>
      <DoctorChoiceChips
        onChange={(value) =>
          onChange({ ...filters, patient_decision: value })
        }
        options={decisionFilters}
        value={
          (filters.patient_decision ?? "") as (typeof decisionFilters)[number]["value"]
        }
      />
      <Text style={styles.filterLabel}>Doctor</Text>
      <View style={styles.chipList}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.chip,
            !filters.doctor_id && styles.selectedChip,
          ]}
          onPress={() => onChange({ ...filters, doctor_id: "" })}
        >
          <Text
            style={[
              styles.chipText,
              !filters.doctor_id && styles.selectedChipText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {doctors.map((doctor) => {
          const selected = filters.doctor_id === String(doctor.id);
          return (
            <TouchableOpacity
              accessibilityRole="button"
              key={doctor.id}
              style={[styles.chip, selected && styles.selectedChip]}
              onPress={() =>
                onChange({ ...filters, doctor_id: String(doctor.id) })
              }
            >
              <Text
                style={[
                  styles.chipText,
                  selected && styles.selectedChipText,
                ]}
              >
                {doctor.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <DoctorField
        label="From date"
        placeholder="YYYY-MM-DD"
        value={filters.from_date ?? ""}
        onChangeText={(value) => onChange({ ...filters, from_date: value })}
      />
      <DoctorField
        label="To date"
        placeholder="YYYY-MM-DD"
        value={filters.to_date ?? ""}
        onChangeText={(value) => onChange({ ...filters, to_date: value })}
      />
      <View style={styles.filterActions}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={onClear}
        >
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.darkButton}
          onPress={onApply}
        >
          <Text style={styles.darkButtonText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DoctorSelectList({
  doctors,
  onSelect,
  selectedId,
}: {
  doctors: Doctor[];
  onSelect: (doctorId: string) => void;
  selectedId: string;
}) {
  return (
    <View style={styles.selector}>
      <Text style={styles.selectorLabel}>Assigned doctor *</Text>
      <View style={styles.chipList}>
        {doctors.map((doctor) => {
          const selected = selectedId === String(doctor.id);
          return (
            <TouchableOpacity
              accessibilityRole="button"
              key={doctor.id}
              style={[styles.chip, selected && styles.selectedChip]}
              onPress={() => onSelect(String(doctor.id))}
            >
              <Text
                style={[
                  styles.chipText,
                  selected && styles.selectedChipText,
                ]}
              >
                {doctor.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function PanelActions({
  busy,
  destructive = false,
  error,
  onCancel,
  onSubmit,
  primaryLabel,
}: {
  busy: boolean;
  destructive?: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  primaryLabel: string;
}) {
  return (
    <>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.panelActions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.secondaryButton}
          onPress={onCancel}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={[
            styles.submitButton,
            destructive && styles.destructiveButton,
            busy && styles.disabledButton,
          ]}
          onPress={onSubmit}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : null}
          <Text style={styles.submitButtonText}>
            {busy ? "Saving..." : primaryLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function ConsultationCard({
  busy,
  consultation,
  doctorName,
  onConfirm,
  onReject,
  onVisit,
}: {
  busy: boolean;
  consultation: DoctorConsultation;
  doctorName: string;
  onConfirm: (consultation: DoctorConsultation) => void;
  onReject: (consultation: DoctorConsultation) => void;
  onVisit: (consultation: DoctorConsultation) => void;
}) {
  const visitId = getConsultationVisitId(consultation);
  const converted = isConsultationConverted(consultation);
  const canUpdateDecision =
    consultation.status === "completed" &&
    !converted &&
    actionablePatientDecisions.has(consultation.patient_decision);
  const canConfirm = canUpdateDecision;
  const canReject = canUpdateDecision;
  const canCreateVisit = consultation.patient_decision === "confirmed";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.patientName}>{consultation.patient_name}</Text>
          <Text style={styles.mutedText}>{consultation.patient_phone}</Text>
        </View>
        <DoctorStatusBadge status={consultation.status} />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Doctor</Text>
          <Text style={styles.metaValue}>{doctorName}</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Schedule</Text>
          <Text style={styles.metaValue}>
            {formatDoctorDate(consultation.scheduled_date)}
          </Text>
          <Text style={styles.mutedText}>
            {consultation.scheduled_time?.slice(0, 5)}
          </Text>
        </View>
      </View>
      <Text style={styles.metaLabel}>Purpose</Text>
      <Text style={styles.bodyText}>{consultation.purpose}</Text>
      <View style={styles.decisionRow}>
        <Text style={styles.metaLabel}>Patient decision</Text>
        <DoctorStatusBadge status={consultation.patient_decision} />
      </View>
      {converted ? (
        <View style={styles.workflowNotice}>
          <Text style={styles.workflowNoticeText}>
            Visit already created{visitId ? ` (#${visitId})` : ""}
          </Text>
        </View>
      ) : null}
      <View style={styles.cardActions}>
        {canConfirm ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            style={[styles.smallButton, styles.approveButton]}
            onPress={() => onConfirm(consultation)}
          >
            <Text style={styles.approveButtonText}>Confirm</Text>
          </TouchableOpacity>
        ) : null}
        {canReject ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            style={[styles.smallButton, styles.rejectButton]}
            onPress={() => onReject(consultation)}
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
        ) : null}
        {canCreateVisit ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || converted}
            style={[
              styles.smallButton,
              styles.visitButton,
              (busy || converted) && styles.disabledButton,
            ]}
            onPress={() => onVisit(consultation)}
          >
            <Text style={styles.visitButtonText}>
              {converted ? "Visit already created" : "Create Visit"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
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
  headerButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.sectionLg,
  },
  eyebrow: {
    color: colors.primary,
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
    marginBottom: spacing.xl,
    marginTop: spacing.s5,
  },
  filterCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  filterLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  chipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lgPlus,
    paddingVertical: spacing.md,
  },
  selectedChip: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  selectedChipText: {
    color: colors.primary,
  },
  filterActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontSize: typography.size.subtitle,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.xs,
  },
  panelSubtitle: {
    color: colors.textMuted,
    fontSize: typography.size.smallLarge,
    marginBottom: spacing.lg,
  },
  selector: {
    marginBottom: spacing.xl,
  },
  selectorLabel: {
    color: colors.textMutedDark,
    fontSize: typography.size.small,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  panelActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryButtonText: {
    color: colors.textMutedDark,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  darkButton: {
    alignItems: "center",
    backgroundColor: colors.textPrimary,
    borderRadius: radius.control,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  darkButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
  },
  destructiveButton: {
    backgroundColor: colors.danger,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabledButton: {
    opacity: 0.55,
  },
  formError: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    marginBottom: spacing.lgPlus,
    padding: spacing.xl,
    elevation: shadows.elevation.card,
    shadowColor: shadows.color,
    shadowOffset: shadows.offset.y2,
    shadowOpacity: shadows.opacity.card,
    shadowRadius: shadows.radius.card,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  cardTitleBlock: {
    flex: 1,
  },
  patientName: {
    color: colors.textPrimary,
    fontSize: typography.size.bodyLarge,
    fontWeight: typography.weight.extrabold,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: typography.size.small,
    marginTop: spacing.xs,
  },
  metaRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.xl,
    marginVertical: spacing.lg,
    paddingVertical: spacing.lg,
  },
  metaBlock: {
    flex: 1,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: typography.size.captionLarge,
    fontWeight: typography.weight.bold,
    textTransform: "uppercase",
  },
  metaValue: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginTop: spacing.xs,
  },
  bodyText: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    lineHeight: typography.lineHeight.bodyRelaxed,
    marginTop: spacing.xs,
  },
  decisionRow: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  workflowNotice: {
    backgroundColor: colors.neutral100,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  workflowNoticeText: {
    color: colors.textMutedDark,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.bold,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  smallButton: {
    alignItems: "center",
    borderRadius: radius.control,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  rejectButton: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorderStrong,
    borderWidth: 1,
  },
  rejectButtonText: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
  visitButton: {
    backgroundColor: colors.blue,
  },
  visitButtonText: {
    color: colors.surface,
    fontSize: typography.size.smallLarge,
    fontWeight: typography.weight.extrabold,
  },
});
