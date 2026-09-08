import type {
  CreateScheduleRequest,
  ScheduleResponse,
  UpdateScheduleRequest,
} from "../types/schedule";
import type {
  ScheduleFormErrors,
  ScheduleFormState,
} from "../types/scheduleForm";
import { formatDateForApi, parseApiDate } from "./date";

export const DEFAULT_SCHEDULE_INSTRUCTIONS =
  "Wear face mask and cap during treatment";

export const createInitialScheduleForm = (): ScheduleFormState => ({
  cadenceDays: 1,
  doctorId: null,
  endDate: null,
  estimatedDurationMinutes: 60,
  inTime: null,
  instructions: DEFAULT_SCHEDULE_INSTRUCTIONS,
  clinicalNotes: "",
  medicines: "",
  outTime: null,
  patientAddress: "",
  patientName: "",
  patientPhone: "",
  patientReferenceId: "",
  precautions: "",
  priority: "normal",
  scheduleType: "one_time",
  startDate: null,
  therapistId: null,
  treatmentDate: null,
  treatmentName: "",
  visitType: "home_visit",
});

export const startOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const formatScheduleDate = (value: Date): string => {
  return formatDateForApi(value);
};

export const formatScheduleTime = (value: Date): string => {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}:00`;
};

const parseScheduleDate = (value: string | null): Date | null => {
  return parseApiDate(value);
};

const parseScheduleTime = (value: string): Date | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

export const scheduleResponseToForm = (
  schedule: ScheduleResponse
): ScheduleFormState => {
  const inTime = parseScheduleTime(schedule.in_time);
  const outTime = parseScheduleTime(schedule.out_time);
  const estimatedDurationMinutes =
    inTime && outTime
      ? Math.max(15, getMinutes(outTime) - getMinutes(inTime))
      : 60;

  return {
  cadenceDays: 1,
  doctorId: schedule.doctor_id,
  endDate: parseScheduleDate(schedule.end_date),
  estimatedDurationMinutes,
  inTime,
  instructions: schedule.instructions,
  clinicalNotes: schedule.clinical_notes ?? "",
  medicines: schedule.medicines ?? "",
  outTime,
  patientAddress: schedule.patient_address,
  patientName: schedule.patient_name,
  patientPhone: schedule.patient_phone ?? "",
  patientReferenceId: schedule.patient_reference_id ?? "",
  precautions: schedule.precautions ?? "",
  priority: schedule.priority,
  scheduleType: schedule.schedule_type,
  startDate: parseScheduleDate(schedule.start_date),
  therapistId: schedule.therapist_id,
  treatmentDate: parseScheduleDate(schedule.treatment_date),
  treatmentName: schedule.treatment_name,
  visitType: schedule.visit_type,
  };
};

const getMinutes = (value: Date): number =>
  value.getHours() * 60 + value.getMinutes();

export const validateScheduleForm = (
  form: ScheduleFormState,
  originalForm?: ScheduleFormState | null
): ScheduleFormErrors => {
  const errors: ScheduleFormErrors = {};
  const today = startOfDay(new Date());

  if (!form.patientName.trim()) {
    errors.patientName = "Patient name is required.";
  }

  if (!form.treatmentName.trim()) {
    errors.treatmentName = "Treatment name is required.";
  }

  if (!form.patientAddress.trim()) {
    errors.patientAddress = "Patient address is required.";
  }

  const normalizedPhone = form.patientPhone.replace(/\s/g, "");
  if (
    normalizedPhone &&
    !/^[+]?[\d()-]{7,20}$/.test(normalizedPhone)
  ) {
    errors.patientPhone = "Enter a valid phone number.";
  }

  if (form.doctorId === null) {
    errors.doctorId = "Select a doctor.";
  }

  if (form.therapistId === null) {
    errors.therapistId = "Select a therapist.";
  }

  if (!form.instructions.trim()) {
    errors.instructions = "Instructions are required.";
  }

  if (form.scheduleType === "one_time") {
    if (!form.treatmentDate) {
      errors.treatmentDate = "Treatment date is required.";
    } else if (
      startOfDay(form.treatmentDate) < today &&
      (!originalForm?.treatmentDate ||
        formatScheduleDate(form.treatmentDate) !==
          formatScheduleDate(originalForm.treatmentDate))
    ) {
      errors.treatmentDate = "Treatment date cannot be in the past.";
    }
  } else {
    if (
      !Number.isInteger(form.cadenceDays) ||
      form.cadenceDays < 1 ||
      form.cadenceDays > 31
    ) {
      errors.cadenceDays = "Days between visits must be from 1 to 31.";
    }
    if (!form.startDate) {
      errors.startDate = "Start date is required.";
    } else if (
      startOfDay(form.startDate) < today &&
      (!originalForm?.startDate ||
        formatScheduleDate(form.startDate) !==
          formatScheduleDate(originalForm.startDate))
    ) {
      errors.startDate = "Start date cannot be in the past.";
    }

    if (!form.endDate) {
      errors.endDate = "End date is required.";
    } else if (
      form.startDate &&
      startOfDay(form.endDate) < startOfDay(form.startDate)
    ) {
      errors.endDate = "End date cannot be before the start date.";
    }
  }

  if (!form.inTime) {
    errors.inTime = "In time is required.";
  }

  if (!form.outTime) {
    errors.outTime = "Out time is required.";
  } else if (
    form.inTime &&
    getMinutes(form.outTime) <= getMinutes(form.inTime)
  ) {
    errors.outTime = "Out time must be after in time.";
  }

  return errors;
};

const hasRequiredMutationValues = (
  form: ScheduleFormState
): form is ScheduleFormState & {
  doctorId: number;
  inTime: Date;
  outTime: Date;
  therapistId: number;
} =>
  form.doctorId !== null &&
  form.therapistId !== null &&
  form.inTime !== null &&
  form.outTime !== null;

export const buildCreateScheduleRequest = (
  form: ScheduleFormState
): CreateScheduleRequest | null => {
  if (!hasRequiredMutationValues(form)) {
    return null;
  }

  return {
    cadence_days: form.scheduleType === "recurring" ? form.cadenceDays : 1,
    doctor_id: form.doctorId,
    end_date:
      form.scheduleType === "recurring" && form.endDate
        ? formatScheduleDate(form.endDate)
        : null,
    in_time: formatScheduleTime(form.inTime),
    instructions: form.instructions.trim(),
    clinical_notes: form.clinicalNotes.trim() || null,
    medicines: form.medicines.trim() || null,
    out_time: formatScheduleTime(form.outTime),
    patient_address: form.patientAddress.trim(),
    patient_name: form.patientName.trim(),
    patient_phone: form.patientPhone.trim() || null,
    patient_reference_id: form.patientReferenceId.trim() || null,
    precautions: form.precautions.trim() || null,
    priority: form.priority,
    schedule_type: form.scheduleType,
    start_date:
      form.scheduleType === "recurring" && form.startDate
        ? formatScheduleDate(form.startDate)
        : null,
    therapist_id: form.therapistId,
    treatment_date:
      form.scheduleType === "one_time" && form.treatmentDate
        ? formatScheduleDate(form.treatmentDate)
        : null,
    treatment_name: form.treatmentName.trim(),
    visit_type: form.visitType,
  };
};

export const buildUpdateScheduleRequest = (
  form: ScheduleFormState
): UpdateScheduleRequest | null => {
  const request = buildCreateScheduleRequest(form);

  if (!request) {
    return null;
  }

  return {
    ...request,
    instructions: form.instructions.trim(),
    priority: form.priority,
  };
};

export const getScheduleFormFingerprint = (
  form: ScheduleFormState
): string =>
  JSON.stringify({
    ...form,
    endDate: form.endDate ? formatScheduleDate(form.endDate) : null,
    inTime: form.inTime ? formatScheduleTime(form.inTime) : null,
    outTime: form.outTime ? formatScheduleTime(form.outTime) : null,
    startDate: form.startDate ? formatScheduleDate(form.startDate) : null,
    treatmentDate: form.treatmentDate
      ? formatScheduleDate(form.treatmentDate)
      : null,
  });
