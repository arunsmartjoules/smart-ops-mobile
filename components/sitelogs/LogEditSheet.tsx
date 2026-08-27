/**
 * Edit-readings bottom sheet — Claude Design "JouleOps Logs.dc.html".
 *
 * Native sheet (SwiftUI / Material3). The field set and control types mirror
 * the existing entry UI (UnifiedLogItem) rather than the mock's sample fields:
 * Temp & RH → Temp/RH, Water → TDS/pH/Hardness, Chemical → a Yes/No dosing
 * toggle. Every type also carries the remark.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { Check } from "lucide-react-native";
import { makeThemedStyles, useDs, type DsTheme } from "@/hooks/useDs";
import { soRadius } from "@/components/home/SiteOverview";
import {
  normaliseLogStatus,
  shiftLabelToName,
} from "@/components/sitelogs/LogHistoryCard";

const statusMap = (
  ds: DsTheme,
): Record<string, { label: string; bg: string; fg: string }> => ({
  Pending: { label: "Pending", bg: ds.flame[1000], fg: ds.flame[100] },
  Inprogress: { label: "In progress", bg: ds.sky[1000], fg: ds.sky[100] },
  Completed: {
    label: "Completed",
    bg: ds.sky[900],
    fg: ds.isDark ? ds.sky[100] : "#1F757D",
  },
});

interface FieldDef {
  key: string;
  column: string;
  label: string;
  unit?: string;
}

/** Order matches the existing entry screens. */
const FIELDS: Record<string, FieldDef[]> = {
  "Temp RH": [
    { key: "temp", column: "temperature", label: "Temp", unit: "°C" },
    { key: "rh", column: "rh", label: "RH", unit: "%" },
  ],
  Water: [
    { key: "tds", column: "tds", label: "TDS" },
    { key: "ph", column: "ph", label: "pH" },
    { key: "hardness", column: "hardness", label: "Hardness" },
  ],
  "Chemical Dosing": [],
};

export function LogEditSheet({
  row,
  logName,
  saving,
  onClose,
  onSave,
}: {
  row: any;
  logName: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, any>) => void;
}) {
  const fields = FIELDS[logName] ?? [];
  const styles = useStyles();
  const ds = useDs();
  const isChemical = logName === "Chemical Dosing";

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    fields.forEach((f) => {
      const v = row?.[f.column];
      seed[f.key] = v == null ? "" : String(v);
    });
    seed.dosing = row?.chemical_dosing ? String(row.chemical_dosing) : "";
    seed.mainRemarks = row?.main_remarks ? String(row.main_remarks) : "";
    return seed;
  });

  const status = statusMap(ds)[normaliseLogStatus(row?.status)];
  const meta = useMemo(() => {
    const shift = shiftLabelToName(row?.shift_label);
    const person = row?.assigned_to || row?.executor_id || "Unassigned";
    return [shift, row?.scheduled_date, person].filter(Boolean).join(" · ");
  }, [row]);

  const set = (key: string, v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const submit = () => {
    const patch: Record<string, any> = {};
    fields.forEach((f) => {
      const raw = values[f.key]?.trim() ?? "";
      patch[f.column] = raw === "" ? null : Number(raw);
    });
    if (isChemical) patch.chemical_dosing = values.dosing || null;
    patch.main_remarks = values.mainRemarks?.trim() || null;
    onSave(patch);
  };

  return (
    <BottomSheet
      snapPoints={["82%"]}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: ds.white }}
    >
      <BottomSheetView style={styles.head}>
        <View style={styles.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              {row?.task_name || "Log entry"}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={[styles.badgeText, { color: status.fg }]}>
              {status.label}
            </Text>
          </View>
        </View>
      </BottomSheetView>

      <BottomSheetScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 12 }}>
          {fields.map((f) => (
            <View key={f.key}>
              <Text style={styles.label}>{f.label}</Text>
              <View style={styles.field}>
                <BottomSheetTextInput
                  value={values[f.key]}
                  onChangeText={(v: string) => set(f.key, v)}
                  placeholder={`Enter ${f.label.toLowerCase()}`}
                  placeholderTextColor={ds.carbon[600]}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                {f.unit ? <Text style={styles.unit}>{f.unit}</Text> : null}
              </View>
            </View>
          ))}

          {/* Dosing is a checkbox here too, matching the entry screen. */}
          {isChemical ? (
            <View>
              <Text style={styles.label}>Dosing</Text>
              <TouchableOpacity
                onPress={() =>
                  set("dosing", values.dosing === "Yes" ? "No" : "Yes")
                }
                activeOpacity={0.85}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: values.dosing === "Yes" }}
                accessibilityLabel="Dosing done"
                style={[styles.field, styles.checkRow]}
              >
                <View
                  style={[
                    styles.checkbox,
                    values.dosing === "Yes" && {
                      backgroundColor: ds.thunder[100],
                      borderColor: ds.thunder[100],
                    },
                  ]}
                >
                  {values.dosing === "Yes" ? (
                    <Check size={13} color={ds.onChrome} strokeWidth={3} />
                  ) : null}
                </View>
                <Text style={styles.checkLabel}>Dosing done</Text>
                <Text style={styles.checkState}>
                  {values.dosing || "Not set"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View>
            <Text style={styles.label}>Remark</Text>
            <View style={[styles.field, styles.fieldTall]}>
              <BottomSheetTextInput
                value={values.mainRemarks}
                onChangeText={(v: string) => set("mainRemarks", v)}
                placeholder="Add a remark…"
                placeholderTextColor={ds.carbon[600]}
                multiline
                style={[styles.input, styles.inputMultiline]}
              />
            </View>
          </View>
        </View>
      </BottomSheetScrollView>

      <BottomSheetView style={styles.footer}>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.85}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={saving}
          activeOpacity={0.9}
          style={styles.save}
        >
          {saving ? (
            <ActivityIndicator size="small" color={ds.onChrome} />
          ) : (
            <>
              <Check size={17} color={ds.onChrome} strokeWidth={2.6} />
              <Text style={styles.saveText}>Update readings</Text>
            </>
          )}
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  head: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0.16,
    color: ds.carbon[100],
  },
  meta: { fontSize: 11.5, color: ds.carbon[500], marginTop: 3 },
  badge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
  },

  body: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 8 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.22,
    color: ds.carbon[400],
    marginBottom: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: soRadius.sm,
    borderWidth: 1.5,
    borderColor: ds.fieldBorder,
    backgroundColor: ds.field,
  },
  fieldTall: { height: 84, alignItems: "flex-start", paddingVertical: 12 },
  input: {
    flex: 1,
    height: "100%",
    padding: 0,
    fontSize: 15,
    fontWeight: "600",
    color: ds.carbon[100],
  },
  inputMultiline: { height: "100%", textAlignVertical: "top", fontWeight: "500" },
  unit: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "600",
    color: ds.carbon[600],
  },

  checkRow: { gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ds.carbon[800],
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: ds.carbon[100],
  },
  checkState: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },

  footer: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[900],
  },
  cancel: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[800],
    backgroundColor: ds.white,
  },
  cancelText: { fontSize: 14, fontWeight: "500", color: ds.carbon[400] },
  save: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: soRadius.sm,
    backgroundColor: ds.thunder[100],
  },
  saveText: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: 0.15,
    color: ds.onChrome,
  },
}));

export default LogEditSheet;
