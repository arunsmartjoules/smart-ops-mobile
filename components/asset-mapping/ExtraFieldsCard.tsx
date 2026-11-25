/**
 * "Extra details" on the asset detail screen: the fields an admin added on
 * the web (one list for every site), filled here per asset. Read view by
 * default; "Edit details" turns it into a small form in place (no Modal —
 * see the Modal + Reanimated touch bug). Only changed fields are sent, so two
 * people filling different fields don't overwrite each other.
 */
import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Chip, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { MappedAsset, MappingField, MappingFieldValue } from "@/services/AssetMappingService";
import { ActionPill, SectionCard } from "./ui";

/** Backend limit for text values (mappingCustomFields.ts). */
const MAX_TEXT = 500;

/** Form state: every field as text; Yes/No as "yes" | "no" | "". */
type Draft = Record<string, string>;

export function formatExtraValue(v: MappingFieldValue | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const toDraft = (fields: MappingField[], values: Record<string, MappingFieldValue>): Draft =>
  Object.fromEntries(
    fields.map((fd) => {
      const v = values[fd.id];
      if (v === undefined || v === null) return [fd.id, ""];
      if (typeof v === "boolean") return [fd.id, v ? "yes" : "no"];
      return [fd.id, String(v)];
    }),
  );

function toApiValue(field: MappingField, text: string): MappingFieldValue | null {
  const t = text.trim();
  if (!t) return null;
  if (field.field_type === "yes_no") return t === "yes";
  if (field.field_type === "number") return Number(t);
  return t;
}

export default function ExtraFieldsCard({
  asset,
  fields,
  onSave,
}: {
  asset: MappedAsset;
  /** Visible fields, in order. Nothing renders when there are none. */
  fields: MappingField[];
  /** Resolves true when saved (the screen shows any error itself). */
  onSave: (changes: Record<string, MappingFieldValue | null>) => Promise<boolean>;
}) {
  const s = useStyles();
  const t = useJoTheme();
  const values = asset.custom_fields ?? {};
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  if (fields.length === 0) return null;

  const filled = fields.filter((fd) => formatExtraValue(values[fd.id]) !== "").length;

  const validate = (d: Draft) => {
    const out: Record<string, string> = {};
    for (const fd of fields) {
      const v = (d[fd.id] ?? "").trim();
      if (fd.field_type === "number" && v && !Number.isFinite(Number(v))) out[fd.id] = "Enter a number";
    }
    return out;
  };

  const save = async () => {
    if (!draft || saving) return;
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const before = toDraft(fields, values);
    const changes: Record<string, MappingFieldValue | null> = {};
    for (const fd of fields) {
      if ((draft[fd.id] ?? "").trim() !== (before[fd.id] ?? "").trim()) {
        changes[fd.id] = toApiValue(fd, draft[fd.id] ?? "");
      }
    }
    if (Object.keys(changes).length === 0) {
      setDraft(null);
      return;
    }
    setSaving(true);
    // On failure the form stays open with what was typed.
    const ok = await onSave(changes);
    setSaving(false);
    if (ok) setDraft(null);
  };

  const set = (id: string, v: string) => setDraft((d) => (d ? { ...d, [id]: v } : d));

  return (
    <SectionCard title="Extra details" meta={`${filled} of ${fields.length} filled`}>
      {draft ? (
        <View style={{ gap: 14 }}>
          {fields.map((fd) => {
            const value = draft[fd.id] ?? "";
            const choices =
              fd.field_type === "yes_no"
                ? [
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]
                : fd.field_type === "select"
                  ? // A saved value that's no longer an option still shows.
                    [...fd.options, ...(value && !fd.options.includes(value) ? [value] : [])].map((o) => ({
                      value: o,
                      label: o,
                    }))
                  : null;
            return (
              <View key={fd.id}>
                <Text style={s.label}>{fd.label}</Text>
                {choices ? (
                  <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={fd.label}>
                    {choices.map((c) => (
                      <Chip
                        key={c.value}
                        label={c.label}
                        selected={value === c.value}
                        // Tapping the chosen option again clears it.
                        onPress={() => set(fd.id, value === c.value ? "" : c.value)}
                        height={32}
                      />
                    ))}
                  </View>
                ) : (
                  <TextInput
                    value={value}
                    onChangeText={(v) => set(fd.id, v)}
                    placeholder={fd.field_type === "number" ? "Number" : "Not set"}
                    placeholderTextColor={t.faint}
                    keyboardType={fd.field_type === "number" ? "decimal-pad" : "default"}
                    maxLength={fd.field_type === "text" ? MAX_TEXT : undefined}
                    onFocus={() => setFocused(fd.id)}
                    onBlur={() => {
                      setFocused(null);
                      if (draft) setErrors(validate(draft));
                    }}
                    style={[
                      s.input,
                      {
                        borderColor: errors[fd.id] ? t.bad : focused === fd.id ? t.accent : "transparent",
                      },
                    ]}
                    accessibilityLabel={fd.label}
                  />
                )}
                {errors[fd.id] ? <Text style={[s.error, { color: t.bad }]}>{errors[fd.id]}</Text> : null}
              </View>
            );
          })}
          <View style={s.actions}>
            <ActionPill label="Cancel" onPress={saving ? undefined : () => setDraft(null)} disabled={saving} />
            <ActionPill
              icon="bx-check"
              label={saving ? "Saving…" : "Save"}
              variant="accent"
              onPress={() => void save()}
              disabled={saving}
            />
          </View>
        </View>
      ) : (
        <>
          {fields.map((fd, i) => {
            const shown = formatExtraValue(values[fd.id]);
            return (
              <View key={fd.id} style={[s.row, i > 0 && s.divider]}>
                <Text style={s.rowLabel} numberOfLines={2}>
                  {fd.label}
                </Text>
                <Text style={[s.rowValue, !shown && { color: t.faint }]} selectable>
                  {shown || "Not set"}
                </Text>
              </View>
            );
          })}
          <View style={s.actions}>
            <ActionPill
              icon="bx-pencil"
              label={filled === 0 ? "Fill details" : "Edit details"}
              onPress={() => {
                setErrors({});
                setDraft(toDraft(fields, values));
              }}
            />
          </View>
        </>
      )}
    </SectionCard>
  );
}

const useStyles = makeJoStyles((t) => ({
  label: { ...f.t(12.5, 600), color: t.ink2, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    ...f.t(14),
    height: 44,
    borderRadius: 18,
    backgroundColor: t.raised,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 0,
    color: t.ink,
  },
  error: { ...f.t(11.5), marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: t.line },
  rowLabel: { ...f.t(12.5), color: t.muted, flex: 1, minWidth: 0 },
  rowValue: { ...f.t(13.5, 600), color: t.ink, flex: 1.2, textAlign: "right" },
}));
