/**
 * Edit-readings sheet — the artboard's entry-form language inside a sheet:
 * big numeric reading wells, the dosed yes/no choice and a remarks field.
 *
 * The field set mirrors the entry UI (UnifiedLogItem): Temp & RH → Temp/RH,
 * Water → TDS/pH/Hardness, Chemical → the Yes/No dosing choice. Every type
 * also carries the remark.
 */
import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { PrimaryButton, SecondaryButton, StatusPill } from "@/components/jo/ui";
import {
  normaliseLogStatus,
  shiftLabelToName,
} from "@/components/sitelogs/LogHistoryCard";
import {
  DoseChoice,
  FieldLabel,
  FormSheet,
  NumberField,
  RemarksField,
  statusLook,
} from "@/components/sitelogs/LogsKit";

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

  const status = statusLook(normaliseLogStatus(row?.status));
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

  // Temp/RH pair up; Water's three readings stack in a 3-up row.
  const numSize = fields.length >= 3 ? "sm" : "md";

  return (
    <FormSheet
      visible
      onClose={onClose}
      title={row?.task_name || "Log entry"}
      subtitle={meta}
      right={<StatusPill label={status.label} tone={status.tone} />}
      footer={
        <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
          <SecondaryButton label="Cancel" onPress={onClose} style={{ paddingHorizontal: 22 }} />
          <PrimaryButton
            label="Update readings"
            icon="bx-check"
            height={52}
            busy={saving}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <ScrollView
        style={{ flexGrow: 0, marginTop: 16 }}
        contentContainerStyle={{ gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {fields.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {fields.map((f) => (
              <NumberField
                key={f.key}
                label={f.label}
                value={values[f.key] ?? ""}
                onChangeText={(v) => set(f.key, v)}
                unit={f.unit}
                placeholder="—"
                size={numSize}
                surface="sheet"
                keyboardType="decimal-pad"
                style={{ flex: 1, minWidth: 0 }}
              />
            ))}
          </View>
        ) : null}

        {/* Dosing is the same Yes / No answer as the entry screen. */}
        {isChemical ? (
          <View style={{ gap: 7 }}>
            <FieldLabel label="Was dosing carried out?" />
            <DoseChoice value={values.dosing ?? ""} onChange={(v) => set("dosing", v)} onCard />
          </View>
        ) : null}

        <RemarksField
          label="Remark"
          value={values.mainRemarks ?? ""}
          onChangeText={(v) => set("mainRemarks", v)}
          placeholder="Add a remark…"
          multiline
          surface="sheet"
        />
      </ScrollView>
    </FormSheet>
  );
}

export default LogEditSheet;
