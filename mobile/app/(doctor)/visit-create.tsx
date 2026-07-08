import { colors, radius, spacing, typography } from "@/src/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DoctorBackHeader,
  DoctorErrorState,
  DoctorField,
  DoctorLoadingState,
} from "../../src/components/doctor/DoctorWorkflowUi";
import { queryKeys } from "../../src/query/queryKeys";
import {
  createDoctorVisit,
  getMyDoctorVisits,
} from "../../src/services/doctorWorkflowService";
import { getApiErrorMessage } from "../../src/services/errorHandler";
import {
  getLocalIsoDate,
  nullableDoctorText,
  parsePositiveId,
} from "../../src/utils/doctorWorkflow";

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

const isTime = (value: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export default function CreateDoctorVisitScreen() {
  const { doctorId: doctorIdParam } = useLocalSearchParams<{
    doctorId?: string;
  }>();
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const visitsQuery = useQuery({
    queryFn: getMyDoctorVisits,
    queryKey: queryKeys.doctor.visits.all,
  });
  const inferredDoctorId = useMemo(() => {
    const routeDoctorId = parsePositiveId(doctorIdParam);
    if (routeDoctorId !== null) {
      return routeDoctorId;
    }
    return visitsQuery.data?.[0]?.doctor_id ?? null;
  }, [doctorIdParam, visitsQuery.data]);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [visitDate, setVisitDate] = useState(getLocalIsoDate());
  const [visitTime, setVisitTime] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (inferredDoctorId === null) {
        throw new Error(
          "Doctor profile id is unavailable. At least one assigned visit is required before mobile can infer it."
        );
      }

      return createDoctorVisit({
        chief_complaint: nullableDoctorText(chiefComplaint),
        doctor_id: inferredDoctorId,
        patient_address: patientAddress.trim(),
        patient_name: patientName.trim(),
        patient_phone: patientPhone.trim(),
        remarks: nullableDoctorText(remarks),
        visit_date: visitDate.trim(),
        visit_time: visitTime.trim(),
      });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to Create Visit",
        getApiErrorMessage(error, "Unable to create this doctor visit.")
      );
    },
    onSuccess: async (visit) => {
      queryClient.setQueryData(queryKeys.doctor.visits.detail(visit.id), visit);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.visits.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.visits.dashboard,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.doctor.treatmentPlans.visits,
        }),
      ]);
      Alert.alert("Visit Created", "The doctor visit has been created.", [
        {
          onPress: () =>
            router.replace(
              {
                pathname: "/(doctor)/visit-details",
                params: { id: String(visit.id) },
              } as unknown as Href
            ),
          text: "View Visit",
        },
      ]);
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(doctor)/(tabs)/visits" as Href);
    }
  };
  const submit = () => {
    if (submittingRef.current || mutation.isPending) {
      return;
    }

    if (inferredDoctorId === null) {
      setFormError(
        "Unable to infer your doctor profile id from the mobile doctor APIs. Ask admin to assign/create one visit first, or create visits from admin workflow."
      );
      return;
    }

    if (
      !patientName.trim() ||
      !patientPhone.trim() ||
      !patientAddress.trim() ||
      !visitDate.trim() ||
      !visitTime.trim()
    ) {
      setFormError("Patient name, phone, address, date, and time are required.");
      return;
    }

    if (!isIsoDate(visitDate.trim())) {
      setFormError("Visit date must use YYYY-MM-DD format.");
      return;
    }

    if (visitDate.trim() < getLocalIsoDate()) {
      setFormError("Visit date cannot be in the past.");
      return;
    }

    if (!isTime(visitTime.trim())) {
      setFormError("Visit time must use HH:MM 24-hour format.");
      return;
    }

    setFormError(null);
    submittingRef.current = true;
    mutation.mutate();
  };

  if (visitsQuery.isPending && !visitsQuery.data) {
    return <DoctorLoadingState label="Preparing visit form..." />;
  }

  if (visitsQuery.error && !visitsQuery.data) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <DoctorBackHeader onBack={goBack} title="Create Visit" />
        <DoctorErrorState
          message={getApiErrorMessage(
            visitsQuery.error,
            "Unable to prepare the visit form."
          )}
          onRetry={() => void visitsQuery.refetch()}
          title="Visit form unavailable"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <DoctorBackHeader onBack={goBack} title="Create Visit" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Backend requires a doctor profile id for visit creation. Mobile
              infers it from your existing assigned visits.
            </Text>
          </View>

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
            label="Visit date"
            placeholder="YYYY-MM-DD"
            required
            value={visitDate}
            onChangeText={setVisitDate}
          />
          <DoctorField
            label="Visit time"
            placeholder="HH:MM"
            required
            value={visitTime}
            onChangeText={setVisitTime}
          />
          <DoctorField
            label="Chief complaint"
            multiline
            value={chiefComplaint}
            onChangeText={setChiefComplaint}
          />
          <DoctorField
            label="Remarks"
            multiline
            value={remarks}
            onChangeText={setRemarks}
          />

          {formError ? (
            <Text style={styles.formError}>{formError}</Text>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: mutation.isPending }}
            disabled={mutation.isPending}
            style={[
              styles.submitButton,
              mutation.isPending && styles.disabledButton,
            ]}
            onPress={submit}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : null}
            <Text style={styles.submitText}>
              {mutation.isPending ? "Creating..." : "Create Visit"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  notice: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.control,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  noticeText: {
    color: colors.warningDark,
    fontSize: typography.size.smallLarge,
    lineHeight: typography.lineHeight.s19,
  },
  formError: {
    color: colors.danger,
    fontSize: typography.size.smallLarge,
    marginTop: -spacing.sm,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xl,
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
