/**
 * Form fields for the Create RCA screen: one labelled field per incident-details
 * question, and the free-text input with its mic and Polish controls.
 *
 * The pickers, option chips and date-time tiles are the same pieces the RCA
 * upload flow uses (IncPicker, IncChip, DateTimeTiles); this file only lays
 * them out as a form instead of one question per screen.
 */
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { SelectOption } from "@/components/SearchableSelect";
import type { RcaFields, RcaQuestion } from "@/services/RcaImportService";
import { FieldLabel, IncChip, IncPicker, TextField } from "./IncFields";
import { DateTimeTiles, InlineError } from "./RcaImportParts";
import PolishButton from "./PolishButton";
import { formatElapsed, maxForField } from "./rcaCreateLib";
import type { Dictation } from "./useRcaDictation";

/** Ref callback factory the form uses to find a field when scrolling to a problem. */
export type AnchorRef = (id: string) => (node: View | null) => void;

/* ── Mic ─────────────────────────────────────────────────────────────────── */

export function DictateButton({
  id,
  label,
  dictation,
  offline,
}: {
  id: string;
  /** What is being dictated, for screen readers. */
  label: string;
  dictation: Dictation;
  offline: boolean;
}) {
  const t = useJoTheme();
  const s = useStyles();
  // No expo-audio in this build: no mic, rather than a dead button.
  if (!dictation.supported) return null;

  const mine = dictation.activeId === id;
  const recording = mine && dictation.phase === "recording";
  const working = mine && (dictation.phase === "transcribing" || dictation.phase === "starting");
  const otherBusy = dictation.phase !== "idle" && !mine;
  const disabled = offline || otherBusy || working;

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        dictation.toggle(id);
      }}
      disabled={disabled}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={[s.mic, recording && { backgroundColor: t.bad }, disabled && !working && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityLabel={recording ? `Stop recording ${label}` : `Dictate ${label}`}
      accessibilityState={{ selected: recording, busy: working, disabled }}
    >
      {working ? (
        <ActivityIndicator size="small" color={t.accentInk} style={{ transform: [{ scale: 0.7 }] }} />
      ) : (
        <Bx name={recording ? "bx-stop" : "bxs-microphone"} size={14} color={recording ? t.onAccent : t.accentInk} />
      )}
      {recording ? <Text style={[s.micText, { color: t.onAccent }]}>{formatElapsed(dictation.seconds)}</Text> : null}
    </TouchableOpacity>
  );
}

/** The one-line status next to the mic, or null when there is nothing to say. */
function dictationStatus(
  id: string,
  dictation: Dictation,
  color: { muted: string; bad: string },
  style: object,
): React.ReactNode {
  const mine = dictation.activeId === id;
  if (mine && dictation.phase === "recording") {
    return (
      <Text style={[style, { color: color.bad }]}>
        Recording… {formatElapsed(dictation.seconds)} · tap the mic to stop
      </Text>
    );
  }
  if (mine && dictation.phase === "starting") return <Text style={style}>Starting the microphone…</Text>;
  if (mine && dictation.phase === "transcribing") return <Text style={style}>Transcribing…</Text>;
  const note = dictation.noteFor(id);
  if (note) return <Text style={[style, note.kind === "error" && { color: color.bad }]}>{note.text}</Text>;
  return null;
}

/* ── Free-text input: field + mic + Polish ───────────────────────────────── */

export function DictatedTextField({
  id,
  value,
  onChange,
  max,
  multiline,
  minHeight,
  placeholder,
  invalid,
  accessibilityLabel,
  dictation,
  offline,
}: {
  /** Dictation id — unique per field in the form. */
  id: string;
  value: string;
  onChange: (next: string) => void;
  max: number;
  multiline?: boolean;
  minHeight?: number;
  placeholder?: string;
  invalid?: boolean;
  accessibilityLabel: string;
  dictation: Dictation;
  offline: boolean;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const mine = dictation.activeId === id;
  const busyHere = mine && dictation.phase !== "idle";
  const status = dictationStatus(id, dictation, { muted: t.muted, bad: t.bad }, s.statusText);
  return (
    <View>
      <TextField
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        minHeight={minHeight}
        maxLength={max}
        invalid={invalid}
        accessibilityLabel={accessibilityLabel}
      />
      {value.length >= max - Math.min(500, Math.floor(max / 5)) ? (
        <Text style={s.count}>
          {value.length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
        </Text>
      ) : null}
      <PolishButton
        value={value}
        onChange={onChange}
        offline={offline}
        disabled={busyHere}
        status={status}
        before={<DictateButton id={id} label={accessibilityLabel} dictation={dictation} offline={offline} />}
      />
    </View>
  );
}

/* ── Incident-details question as a form field ───────────────────────────── */

interface DetailProps {
  question: RcaQuestion;
  fields: RcaFields;
  setField: <K extends keyof RcaFields>(field: K, value: RcaFields[K]) => void;
  error?: string;
  assetSearchOptions: SelectOption[];
  assetsLoading: boolean;
  assetSearch: string;
  onAssetSearch: (q: string) => void;
  peopleOptions: SelectOption[];
  dictation: Dictation;
  offline: boolean;
}

export function DetailField({
  question,
  fields,
  setField,
  error,
  assetSearchOptions,
  assetsLoading,
  assetSearch,
  onAssetSearch,
  peopleOptions,
  dictation,
  offline,
}: DetailProps) {
  const t = useJoTheme();
  const s = useStyles();
  const value = fields[question.field];
  const str = (value as string | null) ?? "";

  if (question.kind === "asset") {
    return (
      <IncPicker
        label={question.title}
        required={question.required}
        placeholder="Search this site's equipment"
        options={assetSearchOptions}
        value={str}
        onChange={(v) => setField("asset_location", v)}
        searchPlaceholder="Search assets..."
        emptyMessage={assetsLoading ? "Searching…" : "No assets found"}
        searchValue={assetSearch}
        onSearchChange={onAssetSearch}
        remoteSearch
        error={error}
        hint={question.help}
        style={{ marginTop: 0 }}
      />
    );
  }

  if (question.kind === "user") {
    return (
      <IncPicker
        label={question.title}
        required={question.required}
        placeholder="Choose who handles this incident"
        options={peopleOptions}
        value={str}
        onChange={(v) => setField("assigned_to", v)}
        searchPlaceholder="Search people..."
        emptyMessage="No people found for this site"
        error={error}
        hint={question.help}
        style={{ marginTop: 0 }}
      />
    );
  }

  const selectedHint = question.options?.find((o) => o.value === value)?.hint;

  return (
    <View>
      <FieldLabel label={question.title} required={question.required} />
      {question.help && question.kind !== "choice" ? <Text style={s.help}>{question.help}</Text> : null}
      <View style={{ marginTop: 8 }}>
        {question.kind === "choice" ? (
          <>
            <View style={s.chips} accessibilityRole="radiogroup">
              {(question.options ?? []).map((o) => (
                <IncChip
                  key={o.value}
                  label={o.label}
                  selected={value === o.value}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setField(question.field, o.value as never);
                  }}
                />
              ))}
            </View>
            {selectedHint ? <Text style={s.help}>{selectedHint}</Text> : null}
          </>
        ) : null}

        {question.kind === "datetime" ? (
          <>
            <DateTimeTiles
              value={(value as string | null) ?? null}
              onChange={(v) => setField(question.field, v as never)}
              invalid={!!error}
            />
            {!question.required && str ? (
              <TouchableOpacity
                onPress={() => setField(question.field, null as never)}
                hitSlop={8}
                style={{ alignSelf: "flex-start", marginTop: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Clear ${question.title}`}
              >
                <Text style={[f.t(12.5, 600), { color: t.accentInk }]}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {question.kind === "text" ? (
          <DictatedTextField
            id={`q:${String(question.field)}`}
            value={str}
            onChange={(v) => setField(question.field, v as never)}
            max={maxForField(question.field)}
            multiline={question.field === "fault_symptom"}
            minHeight={question.field === "fault_symptom" ? 72 : undefined}
            placeholder={question.field === "fault_symptom" ? "e.g. AHU-3 motor tripping" : "Type your answer"}
            invalid={!!error}
            accessibilityLabel={question.title}
            dictation={dictation}
            offline={offline}
          />
        ) : null}
      </View>
      <InlineError text={error} style={{ marginTop: 8 }} />
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  mic: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: t.accentTint,
  },
  micText: { ...f.t(12, 700) },
  statusText: { ...f.t(12), lineHeight: 16, color: t.muted },
  count: { ...f.t(11.5), color: t.muted, textAlign: "right", marginTop: 6 },
  help: { ...f.t(12), lineHeight: 17, color: t.muted, marginTop: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
