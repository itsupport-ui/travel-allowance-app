import { router, type Href } from "expo-router";

import type { DoctorTask, DoctorTaskType } from "../types/doctorTask";

export const taskTypeLabels: Record<DoctorTaskType, string> = {
  clinic_training: "Clinic training",
  other: "Other work",
  patient_visit: "Patient visit",
};

// Patient-visit tasks are punched through the linked visit; everything else
// opens the task screen.
export const openDoctorTask = (task: DoctorTask): void => {
  if (task.punch_via_visit && task.doctor_visit_id) {
    router.push({
      params: { id: String(task.doctor_visit_id) },
      pathname: "/(doctor)/visit-details",
    } as unknown as Href);
    return;
  }
  router.push({
    params: { id: String(task.id) },
    pathname: "/(doctor)/task-details",
  } as unknown as Href);
};
