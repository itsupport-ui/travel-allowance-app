import { colors, radius, shadows, spacing, typography } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDatePickerField } from "../../src/components/common/AppDatePickerField";
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import {
  AdminConsultationCard,
  ConsultationEmptyState,
  ConsultationSearchBar,
  ConsultationSkeletonCard,
} from "../../src/components/doctor/AdminConsultationUi";
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorErrorState,
  DoctorField,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  createDoctorConsultation,
  getAdminDoctorConsultations,
  getConsultationDoctors,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type {
  CreateDoctorConsultationRequest,
  DoctorConsultation,
  DoctorConsultationFilters,
} from "../../src/types/doctorWorkflow";
import type { Doctor } from "../../src/types/doctor";
import { getLocalIsoDate, nullableDoctorText } from "../../src/utils/doctorWorkflow";

type Panel = "create" | null;

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

const emptyFilters: DoctorConsultationFilters = {
  doctor_id: "",
  from_date: "",
  patient_decision: "",
  status: "",
  to_date: "",
};

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

const EMPTY_CONSULTATIONS: DoctorConsultation[] = [];
const EMPTY_DOCTORS: Doctor[] = [];

const isIsoDate = (value: string): boolean =>
  !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

const isTime = (value: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const normalize = (value: string | null | undefined): string =>
  value?.trim().toLowerCase() ?? "";

export default function AdminDoctorConsultationsScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DoctorConsultationFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<DoctorConsultationFilters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [consultationForm, setConsultationForm] = useState(emptyConsultationForm);
  const [formError, setFormError] = useState<string | null>(null);

  const consultationsQuery = useQuery({
    queryFn: () => getAdminDoctorConsultations(appliedFilters),
    queryKey: [...queryKeys.adminDoctorWorkflow.consultations, appliedFilters],
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
  const searchTerm = normalize(search);
  const visibleConsultations = useMemo(() => {
    if (!searchTerm) return consultations;
    return consultations.filter((consultation) => {
      const doctorName = doctorNameById.get(consultation.doctor_id) ?? "";
      return [
        consultation.patient_name,
        consultation.patient_phone,
        doctorName,
        consultation.purpose,
      ].some((value) => normalize(value).includes(searchTerm));
    });
  }, [consultations, doctorNameById, searchTerm]);

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.adminDoctorWorkflow.consultations,
      }),
    [queryClient]
  );

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
      setFormError(getApiErrorMessage(error, "Unable to schedule this consultation."));
    },
    onSuccess: async () => {
      await invalidate();
      setPanel(null);
      setConsultationForm(emptyConsultationForm);
    },
  });

  const openCreate = useCallback(() => {
    setFormError(null);
    setConsultationForm(emptyConsultationForm);
    setPanel("create");
  }, []);

  const openDetails = useCallback((consultation: DoctorConsultation) => {
    router.push(`./doctor-workflow-consultation-details?id=${consultation.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DoctorConsultation }) => (
      <AdminConsultationCard
        consultation={item}
        doctorName={doctorNameById.get(item.doctor_id) ?? `Doctor #${item.doctor_id}`}
        onPress={openDetails}
      />
    ),
    [doctorNameById, openDetails]
  );

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
      setFormError("Select a valid scheduled date.");
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

  if (
    (consultationsQuery.isPending && !consultationsQuery.data) ||
    (doctorsQuery.isPending && !doctorsQuery.data)
  ) {
    return <ConsultationLoadingState />;
  }

  if (
    (consultationsQuery.error && !consultationsQuery.data) ||
    (doctorsQuery.error && !doctorsQuery.data)
  ) {
    const error = consultationsQuery.error ?? doctorsQuery.error;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader
          onBack={() => router.replace("/(admin)/doctor-workflow")}
          title="Consultations"
        />
        <DoctorErrorState
          message={getApiErrorMessage(error, "Unable to load consultations.")}
          onRetry={() =>
            void Promise.all([consultationsQuery.refetch(), doctorsQuery.refetch()])
          }
          title="Unable to load consultations"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        onBack={() => router.replace("/(admin)/doctor-workflow")}
        title="Consultations"
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={visibleConsultations}
        initialNumToRender={8}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <ConsultationEmptyState
            description={
              searchTerm || appliedFilterCount(appliedFilters) > 0
                ? "Try changing your search or filters."
                : "Schedule a consultation to begin the doctor workflow."
            }
            onCreate={openCreate}
            searchActive={Boolean(searchTerm)}
          />
        }
        ListFooterComponent={<View style={styles.listFooter} />}
        ListHeaderComponent={
          <View>
            <View style={styles.pageHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Doctor Workflow</Text>
                <Text style={styles.title}>Consultations</Text>
                <Text style={styles.subtitle}>
                  {visibleConsultations.length} of {consultations.length} records
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel={showFilters ? "Hide filters" : "Show filters"}
                accessibilityRole="button"
                style={[styles.filterButton, showFilters && styles.filterButtonActive]}
                onPress={() => setShowFilters((current) => !current)}
              >
                <Ionicons
                  color={showFilters ? colors.surface : colors.primary}
                  name="options-outline"
                  size={19}
                />
                <Text style={[styles.filterButtonText, showFilters && styles.filterButtonTextActive]}>
                  Filters
                </Text>
              </TouchableOpacity>
            </View>
            <ConsultationSearchBar value={search} onChangeText={setSearch} />
            {showFilters ? (
              <FilterCard
                doctors={doctors}
                filters={filters}
                onApply={() => {
                  setAppliedFilters(filters);
                  setShowFilters(false);
                }}
                onClear={() => {
                  setFilters(emptyFilters);
                  setAppliedFilters(emptyFilters);
                }}
                onChange={setFilters}
              />
            ) : null}
            <View style={styles.listHeadingRow}>
              <Text style={styles.sectionTitle}>All consultations</Text>
              {appliedFilterCount(appliedFilters) > 0 ? (
                <Text style={styles.filterCountText}>
                  {appliedFilterCount(appliedFilters)} filters active
                </Text>
              ) : null}
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            refreshing={consultationsQuery.isRefetching}
            tintColor={colors.primary}
            onRefresh={() => void consultationsQuery.refetch()}
          />
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
      <TouchableOpacity
        accessibilityLabel="Create consultation"
        accessibilityRole="button"
        activeOpacity={0.86}
        style={styles.fab}
        onPress={openCreate}
      >
        <Ionicons color={colors.surface} name="add" size={28} />
      </TouchableOpacity>
      <CreateConsultationModal
        doctors={doctors}
        error={formError}
        form={consultationForm}
        saving={createMutation.isPending}
        visible={panel === "create"}
        onChange={setConsultationForm}
        onClose={() => setPanel(null)}
        onSubmit={submitCreate}
      />
    </SafeAreaView>
  );
}

function appliedFilterCount(filters: DoctorConsultationFilters): number {
  return Object.values(filters).filter((value) => Boolean(value?.trim())).length;
}

function ConsultationLoadingState() {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader
        onBack={() => router.replace("/(admin)/doctor-workflow")}
        title="Consultations"
      />
      <ScrollView contentContainerStyle={styles.loadingContent}>
        <View style={styles.loadingHeader}>
          <View style={styles.loadingTitle} />
          <View style={styles.loadingFilter} />
        </View>
        {Array.from({ length: 6 }, (_, index) => (
          <ConsultationSkeletonCard key={index} />
        ))}
      </ScrollView>
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
  const doctorOptions = [
    { label: "All doctors", value: "" },
    ...doctors.map((doctor) => ({ label: doctor.name, value: String(doctor.id) })),
  ];

  return (
    <View style={styles.filterCard}>
      <Text style={styles.filterLabel}>Consultation status</Text>
      <DoctorChoiceChips
        onChange={(value) => onChange({ ...filters, status: value })}
        options={statusFilters}
        value={filters.status ?? ""}
      />
      <Text style={styles.filterLabel}>Patient decision</Text>
      <DoctorChoiceChips
        onChange={(value) => onChange({ ...filters, patient_decision: value })}
        options={decisionFilters}
        value={filters.patient_decision ?? ""}
      />
      <WorkflowDropdown
        label="Assigned doctor"
        options={doctorOptions}
        placeholder="All doctors"
        value={filters.doctor_id ?? ""}
        onChange={(value) => onChange({ ...filters, doctor_id: value })}
      />
      <View style={styles.dateFilterRow}>
        <View style={styles.dateFilterItem}>
          <AppDatePickerField
            allowClear
            label="From date"
            value={filters.from_date ?? ""}
            onChange={(value) => onChange({ ...filters, from_date: value })}
          />
        </View>
        <View style={styles.dateFilterItem}>
          <AppDatePickerField
            allowClear
            label="To date"
            value={filters.to_date ?? ""}
            onChange={(value) => onChange({ ...filters, to_date: value })}
          />
        </View>
      </View>
      <View style={styles.filterActions}>
        <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={onClear}>
          <Text style={styles.secondaryButtonText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.darkButton} onPress={onApply}>
          <Text style={styles.darkButtonText}>Apply filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function WorkflowDropdown({
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View>
      <Text style={styles.filterLabel}>{label}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.dropdownButton} onPress={() => setOpen(true)}>
        <Text numberOfLines={1} style={[styles.dropdownText, !selected && styles.dropdownPlaceholder]}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons color={colors.textMuted} name="chevron-down" size={18} />
      </TouchableOpacity>
      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownTitle}>{label}</Text>
            <ScrollView style={styles.dropdownOptions}>
              {options.map((option) => {
                const selectedOption = option.value === value;
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={`${label}-${option.value || "all"}`}
                    style={[styles.dropdownOption, selectedOption && styles.dropdownOptionSelected]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, selectedOption && styles.dropdownOptionSelectedText]}>
                      {option.label}
                    </Text>
                    {selectedOption ? <Ionicons color={colors.primary} name="checkmark" size={19} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type ConsultationForm = typeof emptyConsultationForm;

function CreateConsultationModal({
  doctors,
  error,
  form,
  saving,
  visible,
  onChange,
  onClose,
  onSubmit,
}: {
  doctors: Doctor[];
  error: string | null;
  form: ConsultationForm;
  saving: boolean;
  visible: boolean;
  onChange: React.Dispatch<React.SetStateAction<ConsultationForm>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalEyebrow}>Doctor workflow</Text>
            <Text style={styles.modalTitle}>Schedule consultation</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Close schedule consultation" accessibilityRole="button" style={styles.closeButton} onPress={onClose}>
            <Ionicons color={colors.textPrimary} name="close" size={26} />
          </TouchableOpacity>
        </View>
        <FormScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.formSectionTitle}>Patient information</Text>
          <DoctorField
            label="Patient name"
            required
            value={form.patient_name}
            onChangeText={(value) => onChange((current) => ({ ...current, patient_name: value }))}
          />
          <DoctorField
            keyboardType="phone-pad"
            label="Patient phone"
            required
            value={form.patient_phone}
            onChangeText={(value) => onChange((current) => ({ ...current, patient_phone: value }))}
          />
          <DoctorField
            label="Patient address"
            multiline
            required
            value={form.patient_address}
            onChangeText={(value) => onChange((current) => ({ ...current, patient_address: value }))}
          />

          <Text style={styles.formSectionTitle}>Assignment and schedule</Text>
          <DoctorSelectList
            doctors={doctors}
            selectedId={form.doctor_id}
            onSelect={(value) => onChange((current) => ({ ...current, doctor_id: value }))}
          />
          <AppDatePickerField
            label="Scheduled date"
            required
            value={form.scheduled_date}
            onChange={(value) => onChange((current) => ({ ...current, scheduled_date: value }))}
          />
          <DoctorField
            label="Scheduled time"
            placeholder="HH:MM"
            required
            value={form.scheduled_time}
            onChangeText={(value) => onChange((current) => ({ ...current, scheduled_time: value }))}
          />

          <Text style={styles.formSectionTitle}>Consultation notes</Text>
          <DoctorField
            label="Purpose"
            multiline
            required
            value={form.purpose}
            onChangeText={(value) => onChange((current) => ({ ...current, purpose: value }))}
          />
          <DoctorField
            label="Notes"
            multiline
            value={form.notes}
            onChangeText={(value) => onChange((current) => ({ ...current, notes: value }))}
          />
          <PanelActions
            busy={saving}
            error={error}
            primaryLabel="Schedule consultation"
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        </FormScrollView>
      </SafeAreaView>
    </Modal>
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
    <WorkflowDropdown
      label="Assigned doctor"
      options={doctors.map((doctor) => ({ label: doctor.name, value: String(doctor.id) }))}
      placeholder="Select doctor"
      value={selectedId}
      onChange={onSelect}
    />
  );
}

function PanelActions({
  busy,
  error,
  onCancel,
  onSubmit,
  primaryLabel,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  primaryLabel: string;
}) {
  return (
    <View style={styles.panelActionsContainer}>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.panelActions}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={[styles.submitButton, busy && styles.disabledButton]} onPress={onSubmit}>
          {busy ? <ActivityIndicator color={colors.surface} size="small" /> : null}
          <Text style={styles.submitButtonText}>{busy ? "Saving..." : primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  listContent: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  listFooter: { height: spacing.sectionLg },
  pageHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.lg },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  title: { color: colors.textPrimary, fontSize: typography.size.size27, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  subtitle: { color: colors.textMuted, fontSize: typography.size.bodySmall, marginTop: spacing.xs },
  filterButton: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: spacing.xs, marginTop: spacing.md, minHeight: 42, paddingHorizontal: spacing.md },
  filterButtonActive: { backgroundColor: colors.primary },
  filterButtonText: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  filterButtonTextActive: { color: colors.surface },
  listHeadingRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, marginTop: spacing.xl },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold },
  filterCountText: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.bold },
  fab: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.rounded, bottom: spacing.xlPlus, elevation: shadows.elevation.floating, height: 60, justifyContent: "center", position: "absolute", right: spacing.xl, shadowColor: shadows.color, shadowOffset: shadows.offset.y4, shadowOpacity: shadows.opacity.strong, shadowRadius: shadows.radius.raised, width: 60 },
  filterCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.md, marginTop: spacing.lg, padding: spacing.lg },
  filterLabel: { color: colors.textMutedDark, fontSize: typography.size.small, fontWeight: typography.weight.extrabold, marginTop: spacing.sm, textTransform: "uppercase" },
  dateFilterRow: { flexDirection: "row", gap: spacing.md },
  dateFilterItem: { flex: 1 },
  filterActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48 },
  secondaryButtonText: { color: colors.textMutedDark, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  darkButton: { alignItems: "center", backgroundColor: colors.textPrimary, borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 48 },
  darkButtonText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  dropdownButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 50, paddingHorizontal: spacing.lg },
  dropdownText: { color: colors.textPrimary, flex: 1, fontSize: typography.size.bodySmall, fontWeight: typography.weight.bold },
  dropdownPlaceholder: { color: colors.textSubtle },
  dropdownOverlay: { backgroundColor: "rgba(0,0,0,0.35)", flex: 1, justifyContent: "flex-end" },
  dropdownSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, maxHeight: "70%", padding: spacing.xl },
  dropdownTitle: { color: colors.textPrimary, fontSize: typography.size.subtitle, fontWeight: typography.weight.extrabold, marginBottom: spacing.md },
  dropdownOptions: { maxHeight: 360 },
  dropdownOption: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingVertical: spacing.md },
  dropdownOptionSelected: { backgroundColor: colors.primarySurface, borderRadius: radius.control, paddingHorizontal: spacing.md },
  dropdownOptionText: { color: colors.textPrimary, flex: 1, fontSize: typography.size.bodySmall, fontWeight: typography.weight.bold },
  dropdownOptionSelectedText: { color: colors.primary },
  loadingContent: { padding: spacing.xl },
  loadingHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xl },
  loadingTitle: { backgroundColor: colors.neutral150, borderRadius: radius.sm, height: 28, width: "42%" },
  loadingFilter: { backgroundColor: colors.neutral150, borderRadius: radius.pill, height: 42, width: 84 },
  modalContainer: { backgroundColor: colors.background, flex: 1 },
  modalHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  modalEyebrow: { color: colors.primary, fontSize: typography.size.captionLarge, fontWeight: typography.weight.extrabold, textTransform: "uppercase" },
  modalTitle: { color: colors.textPrimary, fontSize: typography.size.titleSmall, fontWeight: typography.weight.extrabold, marginTop: spacing.xs },
  closeButton: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  modalContent: { padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 64 : spacing.xl },
  formSectionTitle: { color: colors.primary, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold, marginBottom: spacing.lg, marginTop: spacing.sm, textTransform: "uppercase" },
  panelActionsContainer: { marginTop: spacing.md, paddingBottom: spacing.lg },
  panelActions: { flexDirection: "row", gap: spacing.md },
  submitButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 48 },
  submitButtonText: { color: colors.surface, fontSize: typography.size.bodySmall, fontWeight: typography.weight.extrabold },
  disabledButton: { opacity: 0.55 },
  formError: { color: colors.danger, fontSize: typography.size.smallLarge, marginBottom: spacing.md },
});
