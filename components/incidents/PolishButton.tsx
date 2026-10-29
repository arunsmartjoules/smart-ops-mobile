/**
 * The tiny "Polish" control under a free-text answer in the Create RCA flow.
 *
 * Fixes spelling, grammar and punctuation only (server side), never on its own:
 * the person taps it. A successful polish replaces the text and offers
 * "Polished · Undo" until they type again. Nothing is changed when the text was
 * edited while the request was running, and a reply for a screen that has gone
 * away is dropped.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { RcaCreateService } from "@/services/RcaCreateService";
import { POLISH_MAX } from "./rcaCreateLib";

/** `forValue` ties a message to the text it was about; typing makes it vanish. */
type Note = { kind: "info" | "error"; text: string; forValue: string } | null;

const INFO_MS = 3000;

export default function PolishButton({
  value,
  onChange,
  disabled,
  offline,
  before,
  status,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Polishing needs the server. */
  offline?: boolean;
  /** A control placed just before the button (the dictation mic). */
  before?: React.ReactNode;
  /** Shown in the message slot instead of the button's own messages (e.g. "Recording…"). */
  status?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  /** Bumped per request so only the newest reply may land. */
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Messages and the Undo link only show while the text is still exactly what
  // they were about, so typing makes them go away without an effect.
  const shownNote = note && note.forValue === value ? note : null;

  const tooLong = value.length > POLISH_MAX;
  const empty = !value.trim();
  const off = disabled || offline || busy || empty || tooLong;

  const polish = useCallback(async () => {
    const sent = valueRef.current;
    if (busy || !sent.trim() || sent.length > POLISH_MAX) return;
    Haptics.selectionAsync().catch(() => {});
    const id = ++requestRef.current;
    setBusy(true);
    setNote(null);
    setUndo(null);
    const res = await RcaCreateService.polish(sent);
    if (!mountedRef.current || id !== requestRef.current) return;
    setBusy(false);
    // Edited while we waited: keep what they typed.
    if (valueRef.current !== sent) return;
    if (!res.ok) {
      setNote({ kind: "error", text: res.error, forValue: sent });
      return;
    }
    const next = res.data.text;
    if (!res.data.changed || !next || next === sent) {
      setNote({ kind: "info", text: "Looks good already", forValue: sent });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) setNote((n) => (n?.kind === "info" ? null : n));
      }, INFO_MS);
      return;
    }
    onChange(next);
    setUndo({ before: sent, after: next });
  }, [busy, onChange]);

  const showUndo = !!undo && value === undo.after;

  return (
    <View style={[s.row, style]}>
      <View style={s.msg} accessibilityLiveRegion="polite">
        {status ? (
          status
        ) : shownNote ? (
          <Text style={[s.msgText, shownNote.kind === "error" && { color: t.bad }]}>{shownNote.text}</Text>
        ) : showUndo && undo ? (
          <View style={s.undoRow}>
            <Text style={s.msgText}>Polished · </Text>
            <TouchableOpacity
              onPress={() => {
                onChange(undo.before);
                setUndo(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Undo polish"
            >
              <Text style={s.undoLink}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : tooLong ? (
          <Text style={s.msgText}>Too long to polish (max {POLISH_MAX.toLocaleString("en-US")} characters)</Text>
        ) : offline ? (
          <Text style={s.msgText}>Needs an internet connection</Text>
        ) : null}
      </View>
      {before}
      <TouchableOpacity
        onPress={() => void polish()}
        disabled={off}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        style={[s.btn, off && !busy && { opacity: 0.45 }]}
        accessibilityRole="button"
        accessibilityLabel="Polish spelling and grammar"
        accessibilityState={{ disabled: !!off, busy }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={t.accentInk} style={{ transform: [{ scale: 0.7 }] }} />
        ) : (
          <Bx name="bxs-magic-wand" size={13} color={t.accentInk} />
        )}
        <Text style={s.btnText}>Polish</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 },
  msg: { flex: 1, minWidth: 0 },
  msgText: { ...f.t(12), lineHeight: 16, color: t.muted },
  undoRow: { flexDirection: "row", alignItems: "center" },
  undoLink: { ...f.t(12, 700), color: t.accentInk },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: t.accentTint,
  },
  btnText: { ...f.t(12, 600), color: t.accentInk },
}));
