import { useLocalSearchParams } from "expo-router";

import { AdminScheduleFormScreen } from "../../src/components/schedule/AdminScheduleFormScreen";

const getSingleParam = (
  value: string | string[] | undefined
): string | undefined => (Array.isArray(value) ? value[0] : value);

export default function AdminScheduleEditScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    reschedule?: string | string[];
  }>();
  const scheduleId = Number(getSingleParam(params.id));

  return (
    <AdminScheduleFormScreen
      mode="edit"
      reschedule={getSingleParam(params.reschedule) === "1"}
      scheduleId={
        Number.isInteger(scheduleId) && scheduleId > 0
          ? scheduleId
          : undefined
      }
    />
  );
}
