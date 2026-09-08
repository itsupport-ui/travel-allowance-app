import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../src/theme";
import { TravelExpenseReportScreen } from "../../src/components/reports/TravelExpenseReportScreen";

export default function AdminTravelExpenseReportScreen() {
  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background, flex: 1 }}>
      <TravelExpenseReportScreen variant="admin" />
    </SafeAreaView>
  );
}
