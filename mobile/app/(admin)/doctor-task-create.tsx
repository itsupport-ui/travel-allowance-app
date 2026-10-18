import { colors, radius, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
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
import {
  DoctorBackHeader,
  DoctorChoiceChips,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { FormScrollView } from "../../src/components/layout/FormScrollView";
import {
  createDoctorTask,
  getPlaces,
} from "../../src/services/doctorTaskService";
import { getConsultationDoctors } from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import type { DoctorTaskType } from "../../src/types/doctorTask";
import { getLocalIsoDate } from "../../src/utils/doctorWorkflow";

const typeOptions: readonly { label: string; value: DoctorTaskType }[] = [
  { label: "Clinic training", value: "clinic_training" },
  { label: "Patient visit", value: "patient_visit" },
  { label: "Other", value: "other" },
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(admin)/doctor-tasks" as Href);
  }
};

export default function AdminDoctorTaskCreateScreen() {
  const queryClient = useQueryClient();
  const [taskType, setTaskType] = useState<DoctorTaskType>("clinic_training");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(getLocalIsoDate());
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [visitTime, setVisitTime] = useState("");

  const doctorsQuery = useQuery({
    queryFn: getConsultationDoctors,
    queryKey: ["admin", "doctor-tasks", "doctors"],
  });
  const placesQuery = useQuery({
    queryFn: getPlaces,
    queryKey: ["admin", "places"],
  });

  const isVisit = taskType === "patient_visit";
  const validation = (): string | null => {
    if (doctorId === null) return "Select a doctor.";
    if (title.trim().length < 3) return "Enter a task title.";
    if (isVisit) {
      if (!patientName.trim() || !patientPhone.trim() || !patientAddress.trim()) {
        return "Enter the patient's name, phone and address.";
      }
      if (!TIME_PATTERN.test(visitTime)) {
        return "Enter the visit time as HH:MM (24-hour).";
      }
    } else if (placeId === null) {
      return "Select a place. Add one under Manage places if needed.";
    }
    return null;
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createDoctorTask({
        doctor_id: doctorId ?? 0,
        notes: notes.trim() || null,
        patient_address: isVisit ? patientAddress.trim() : null,
        patient_name: isVisit ? patientName.trim() : null,
        patient_phone: isVisit ? patientPhone.trim() : null,
        place_id: isVisit ? null : placeId,
        scheduled_date: date,
        task_type: taskType,
        title: title.trim(),
        visit_time: isVisit ? `${visitTime}:00` : null,
      }),
    onError: (error) =>
      Alert.alert(
        "Unable to Assign Task",
        getApiErrorMessage(error, "Unable to assign this task.")
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "doctor-tasks"],
      });
      Alert.alert("Task Assigned", "The doctor can now see this task.", [
        { onPress: goBack, text: "OK" },
      ]);
    },
  });

  const submit = () => {
    const problem = validation();
    if (problem) {
      Alert.alert("Check the form", problem);
      return;
    }
    createMutation.mutate();
  };

  if (doctorsQuery.isPending || placesQuery.isPending) {
    return <DoctorLoadingState label="Loading..." />;
  }
  if (doctorsQuery.error || placesQuery.error) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Assign Task" />
        <DoctorErrorState
          message={getApiErrorMessage(
            doctorsQuery.error ?? placesQuery.error,
            "Unable to load the form."
          )}
          onRetry={() => {
            void doctorsQuery.refetch();
            void placesQuery.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  const doctors = (doctorsQuery.data ?? []).filter((doctor) => doctor.active);
  const places = placesQuery.data ?? [];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Assign Task" />
      <FormScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Task type</Text>
        <DoctorChoiceChips
          options={typeOptions}
          value={taskType}
          onChange={setTaskType}
        />

        <Text style={styles.label}>Doctor *</Text>
        <DoctorChoiceChips
          options={doctors.map((doctor) => ({
            label: doctor.name,
            value: String(doctor.id),
          }))}
          value={doctorId === null ? "" : String(doctorId)}
          onChange={(value) => setDoctorId(Number(value))}
        />

        <DoctorField
          label="Title"
          placeholder="e.g. Train clinic doctors on stroke rehab"
          required
          value={title}
          onChangeText={setTitle}
        />
        <AppDatePickerField
          label="Date"
          minimumDate={new Date()}
          required
          value={date}
          onChange={setDate}
        />

        {isVisit ? (
          <>
            <DoctorField
              label="Patient name"
              required
              value={patientName}
              onChangeText={setPatientName}
            />
            <DoctorField
              keyboardType="phone-pad"
              label="Patient phone"
              required
              value={patientPhone}
              onChangeText={setPatientPhone}
            />
            <DoctorField
              label="Patient address"
              multiline
              required
              value={patientAddress}
              onChangeText={setPatientAddress}
            />
            <DoctorField
              label="Visit time (HH:MM)"
              placeholder="10:30"
              required
              value={visitTime}
              onChangeText={setVisitTime}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>Place *</Text>
            {places.length === 0 ? (
              <Text style={styles.help}>
                No places yet. Add a clinic under Manage places first.
              </Text>
            ) : (
              <DoctorChoiceChips
                options={places.map((place) => ({
                  label: place.name,
                  value: String(place.id),
                }))}
                value={placeId === null ? "" : String(placeId)}
                onChange={(value) => setPlaceId(Number(value))}
              />
            )}
          </>
        )}

        <DoctorField
          label="Notes"
          multiline
          placeholder="Anything the doctor should know"
          value={notes}
          onChangeText={setNotes}
        />

        <View style={styles.footer}>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={createMutation.isPending}
            style={[
              styles.button,
              createMutation.isPending && styles.disabled,
            ]}
            onPress={submit}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Assign task</Text>
            )}
          </TouchableOpacity>
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  label: {
    color: colors.textStrong,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  help: { color: colors.textMuted, fontSize: typography.size.small },
  footer: { marginTop: spacing.xl },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 50,
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.size.bodySmall,
    fontWeight: typography.weight.extrabold,
  },
  disabled: { opacity: 0.6 },
});
