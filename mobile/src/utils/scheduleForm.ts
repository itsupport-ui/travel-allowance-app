import type {
  CreateScheduleRequest,
  ScheduleResponse,
  UpdateScheduleRequest,
} from "../types/schedule";
import type {
  ScheduleFormErrors,
  ScheduleFormState,
} from "../types/scheduleForm";

export const DEFAULT_SCHEDULE_INSTRUCTIONS =
  "Wear face mask and cap during treatment";

export const createInitialScheduleForm = (): ScheduleFormState => ({
  doctorId: null,
  endDate: null,
  inTime: null,
  instructions: DEFAULT_SCHEDULE_INSTRUCTIONS,
  medicines: "",
  outTime: null,
  patientAddress: "",
  patientName: "",
  priority: "normal",
  scheduleType: "one_time",
  startDate: null,
  therapistId: null,
  treatmentDate: null,
  treatmentName: "",
  transportMode: "vehicle",
});

export const startOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const formatScheduleDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatScheduleTime = (value: Date): string => {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}:00`;
};

const parseScheduleDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  return Number.isNaN(date.getTime()) ? null : date;
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
): ScheduleFormState => ({
  doctorId: schedule.doctor_id,
  endDate: parseScheduleDate(schedule.end_date),
  inTime: parseScheduleTime(schedule.in_time),
  instructions: schedule.instructions,
  medicines: schedule.medicines ?? "",
  outTime: parseScheduleTime(schedule.out_time),
  patientAddress: schedule.patient_address,
  patientName: schedule.patient_name,
  priority: schedule.priority,
  scheduleType: schedule.schedule_type,
  startDate: parseScheduleDate(schedule.start_date),
  therapistId: schedule.therapist_id,
  treatmentDate: parseScheduleDate(schedule.treatment_date),
  treatmentName: schedule.treatment_name,
  transportMode: schedule.transport_mode ?? "vehicle",
});

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
    doctor_id: form.doctorId,
    end_date:
      form.scheduleType === "recurring" && form.endDate
        ? formatScheduleDate(form.endDate)
        : null,
    in_time: formatScheduleTime(form.inTime),
    instructions: form.instructions.trim(),
    medicines: form.medicines.trim() || null,
    out_time: formatScheduleTime(form.outTime),
    patient_address: form.patientAddress.trim(),
    patient_name: form.patientName.trim(),
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
    transport_mode: form.transportMode,
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
