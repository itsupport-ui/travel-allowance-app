import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getApiErrorMessage } from "../src/services/errorHandler";
import {
  getTravelById,
  updateManualTravel,
  type ManualTravelUpdateRequest,
} from "../src/services/travelService";
import { colors, radius, spacing, typography } from "../src/theme";


const modes = ["vehicle", "auto", "bus", "metro", "cab"] as const;


export default function ManualTravelEditScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const travelId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  }, [params.id]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(1);
  const [travelDate, setTravelDate] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientVisited, setPatientVisited] = useState(false);
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [totalKm, setTotalKm] = useState("");
  const [mode, setMode] = useState<(typeof modes)[number]>("vehicle");
  const [billAmount, setBillAmount] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [invoice, setInvoice] = useState<ManualTravelUpdateRequest["invoice_file"]>(null);
  const [hasExistingInvoice, setHasExistingInvoice] = useState(false);

  useEffect(() => {
    if (travelId === null) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const travel = await getTravelById(travelId);
        if (!travel.available_actions.includes("edit")) {
          throw new Error("This manual travel entry is not editable.");
        }
        setVersion(travel.manual_review_version);
        setTravelDate(travel.travel_date.slice(0, 10));
        setPatientName(travel.patient_name ?? "");
        setPatientVisited(travel.patient_visited);
        setFromAddress(travel.from_address);
        setToAddress(travel.to_address);
        setTotalKm(String(travel.total_km));
        setMode(
          modes.includes(travel.transport_mode as (typeof modes)[number])
            ? (travel.transport_mode as (typeof modes)[number])
            : "vehicle"
        );
        setBillAmount(travel.bill_amount == null ? "" : String(travel.bill_amount));
        setManualReason(travel.manual_reason ?? "");
        setHasExistingInvoice(Boolean(travel.invoice_file));
      } catch (error) {
        Alert.alert("Unable to Edit Travel", getApiErrorMessage(error));
        router.back();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [travelId]);

  const pickInvoice = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["application/pdf", "image/jpeg", "image/png"],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert("File Too Large", "Invoice files must be 5 MB or smaller.");
      return;
    }
    setInvoice({
      mimeType: asset.mimeType || "application/octet-stream",
      name: asset.name,
      uri: asset.uri,
    });
  };

  const save = async () => {
    if (travelId === null) return;
    const distance = Number(totalKm);
    const bill = mode === "vehicle" ? null : Number(billAmount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      Alert.alert("Check Travel Date", "Use YYYY-MM-DD.");
      return;
    }
    if (!fromAddress.trim() || !toAddress.trim() || !Number.isFinite(distance) || distance < 0) {
      Alert.alert("Check Route", "Enter both addresses and a valid non-negative distance.");
      return;
    }
    if (patientVisited && !patientName.trim()) {
      Alert.alert("Patient Name Required", "Enter the patient name for a visited patient.");
      return;
    }
    if (manualReason.trim().length < 10 || correctionReason.trim().length < 5) {
      Alert.alert("Reasons Required", "Explain why manual travel was needed and what you corrected.");
      return;
    }
    if (mode !== "vehicle" && (!Number.isFinite(bill) || Number(bill) <= 0 || (!invoice && !hasExistingInvoice))) {
      Alert.alert("Invoice Required", "Enter a positive bill and attach or retain an invoice.");
      return;
    }
    try {
      setSaving(true);
      await updateManualTravel(travelId, {
        bill_amount: bill,
        correction_reason: correctionReason.trim(),
        from_address: fromAddress.trim(),
        invoice_file: invoice,
        manual_reason: manualReason.trim(),
        patient_name: patientName.trim(),
        patient_visited: patientVisited,
        to_address: toAddress.trim(),
        total_km: distance,
        transport_mode: mode,
        travel_date: travelDate,
        version,
      });
      Alert.alert("Corrections Submitted", "The entry is awaiting administrator review.", [
        { text: "Done", onPress: () => router.replace({ pathname: "/travel-details", params: { id: String(travelId) } }) },
      ]);
    } catch (error) {
      Alert.alert("Unable to Save", getApiErrorMessage(error, "Refresh and try again."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.primary} style={styles.loader} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Correct Manual Travel</Text>
        <Text style={styles.help}>Update the evidence and explain the correction. Approval is required before claiming.</Text>
        <Field label="Travel date (YYYY-MM-DD)" value={travelDate} onChangeText={setTravelDate} />
        <Field label="From address" value={fromAddress} onChangeText={setFromAddress} />
        <Field label="To address" value={toAddress} onChangeText={setToAddress} />
        <Field label="Distance (km)" keyboardType="decimal-pad" value={totalKm} onChangeText={setTotalKm} />
        <Text style={styles.label}>Transport mode</Text>
        <View style={styles.chips}>{modes.map((value) => (
          <TouchableOpacity key={value} style={[styles.chip, mode === value && styles.chipSelected]} onPress={() => setMode(value)}>
            <Text style={[styles.chipText, mode === value && styles.chipTextSelected]}>{value}</Text>
          </TouchableOpacity>
        ))}</View>
        {mode !== "vehicle" ? (
          <>
            <Field label="Bill amount" keyboardType="decimal-pad" value={billAmount} onChangeText={setBillAmount} />
            <TouchableOpacity style={styles.outlineButton} onPress={() => void pickInvoice()}>
              <Text style={styles.outlineText}>{invoice ? invoice.name : hasExistingInvoice ? "Replace existing invoice" : "Attach invoice"}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <View style={styles.switchRow}><Text style={styles.label}>Patient visited</Text><Switch value={patientVisited} onValueChange={setPatientVisited} /></View>
        {patientVisited ? <Field label="Patient name" value={patientName} onChangeText={setPatientName} /> : null}
        <Field label="Why was manual travel needed?" multiline value={manualReason} onChangeText={setManualReason} />
        <Field label="What did you correct?" multiline value={correctionReason} onChangeText={setCorrectionReason} />
        <TouchableOpacity disabled={saving} style={[styles.save, saving && styles.disabled]} onPress={() => void save()}>
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save & Resubmit</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}


function Field(props: {
  keyboardType?: "decimal-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput {...props} placeholderTextColor={colors.textSubtle} style={[styles.input, props.multiline && styles.multiline]} />
    </View>
  );
}


const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  loader: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.sectionLg },
  title: { color: colors.textStrong, fontSize: typography.size.title, fontWeight: typography.weight.extrabold },
  help: { color: colors.textMuted, fontSize: typography.size.small, lineHeight: typography.lineHeight.smallRelaxed, marginBottom: spacing.lg, marginTop: spacing.xs },
  field: { marginTop: spacing.md },
  label: { color: colors.textStrong, fontSize: typography.size.small, fontWeight: typography.weight.bold, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface, borderColor: colors.inputBorder, borderRadius: radius.control, borderWidth: 1, color: colors.textPrimary, minHeight: 48, paddingHorizontal: spacing.md },
  multiline: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: typography.size.small, textTransform: "capitalize" },
  chipTextSelected: { color: colors.surface, fontWeight: typography.weight.extrabold },
  switchRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  outlineButton: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.control, borderWidth: 1, marginTop: spacing.md, minHeight: 48, justifyContent: "center" },
  outlineText: { color: colors.primary, fontSize: typography.size.small, fontWeight: typography.weight.extrabold },
  save: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.control, justifyContent: "center", marginTop: spacing.xl, minHeight: 50 },
  saveText: { color: colors.surface, fontSize: typography.size.body, fontWeight: typography.weight.extrabold },
  disabled: { opacity: 0.55 },
});
