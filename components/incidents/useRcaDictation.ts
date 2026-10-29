/**
 * Speech to text for the Create RCA form. ONE controller for the whole form,
 * so only one field can record or be typed up at a time.
 *
 *   tap mic ─► record (≤ 2 min) ─► tap again ─► upload .m4a (presigned PUT)
 *           ─► POST /rca-create/voice ─► poll every ~2 s ─► text appended
 *
 * The words are added only if the field is still exactly as it was when the
 * recording ended; a reply for a form that has closed, or for a field the
 * person edited meanwhile, is dropped (and they are told). Everything stops
 * when the form closes, and a take left running when the app goes to the
 * background is discarded. English only — the RCA document can't print other
 * scripts — and `supported` is false on builds without expo-audio, in which
 * case the form shows no mic at all.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { v4 as uuidv4 } from "uuid";
import { useVoiceRecorder } from "@/components/comms/useVoiceRecorder";
import { RcaCreateService } from "@/services/RcaCreateService";
import { StorageService } from "@/services/StorageService";
import {
  VOICE_GIVE_UP_MS,
  VOICE_POLL_MISSES,
  VOICE_POLL_MS,
  appendDictation,
  shouldAutoStop,
  voiceGiveUp,
  voiceKey,
} from "./rcaCreateLib";

export type DictationPhase = "idle" | "starting" | "recording" | "transcribing";
export interface DictationNote {
  kind: "info" | "error";
  text: string;
}

export interface Dictation {
  /** False on builds without expo-audio — render no mic. */
  supported: boolean;
  phase: DictationPhase;
  /** The field currently recording / being typed up. */
  activeId: string | null;
  seconds: number;
  /** An error or hint for this field (permission, upload, transcript…). */
  noteFor: (id: string) => DictationNote | null;
  toggle: (id: string) => void;
  /** Stop everything and ignore any reply still on its way. */
  cancelAll: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useRcaDictation({
  siteCode,
  getValue,
  maxFor,
  apply,
}: {
  siteCode: string;
  getValue: (id: string) => string;
  maxFor: (id: string) => number;
  apply: (id: string, text: string) => void;
}): Dictation {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [note, setNote] = useState<(DictationNote & { id: string }) | null>(null);

  const activeRef = useRef<string | null>(null);
  /** The take hit the 2-minute cap — said once the text arrives. */
  const cappedRef = useRef(false);
  const runRef = useRef(0);
  const mountedRef = useRef(true);
  const latest = useRef({ siteCode, getValue, maxFor, apply });
  useEffect(() => {
    latest.current = { siteCode, getValue, maxFor, apply };
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
    };
  }, []);

  const transcribe = useCallback(async (id: string, uri: string) => {
    const run = ++runRef.current;
    const alive = () => mountedRef.current && run === runRef.current;
    const { siteCode: site, getValue: read, maxFor: limit, apply: write } = latest.current;
    // What the field said when the recording ended: the words are only added
    // if it still says that when they arrive.
    const snapshot = read(id);
    const capped = cappedRef.current;
    cappedRef.current = false;
    setTranscribing(true);
    setNote(null);
    const end = (n?: DictationNote) => {
      if (!alive()) return;
      setTranscribing(false);
      const shown = n ?? (capped ? { kind: "info" as const, text: "Recording stopped at 2 minutes." } : undefined);
      setNote(shown ? { ...shown, id } : null);
    };

    let url: string | null = null;
    try {
      url = (await StorageService.uploadFileDetailed(voiceKey(site, uuidv4()), uri)).url;
    } catch {
      url = null;
    }
    if (!alive()) return;
    if (!url) {
      return end({ kind: "error", text: "We couldn't upload the recording. Check your connection and try again." });
    }

    const started = await RcaCreateService.voiceStart(url);
    if (!alive()) return;
    if (!started.ok) return end({ kind: "error", text: started.error });

    const startedAt = Date.now();
    let misses = 0;
    for (;;) {
      await sleep(VOICE_POLL_MS);
      if (!alive()) return;
      if (voiceGiveUp(startedAt, Date.now())) {
        return end({
          kind: "error",
          text: `Typing this up is taking too long (over ${Math.round(VOICE_GIVE_UP_MS / 60000)} minutes). Please try again, or type it instead.`,
        });
      }
      const res = await RcaCreateService.voiceGet(started.data.id);
      if (!alive()) return;
      if (!res.ok) {
        misses += 1;
        if (res.network && misses < VOICE_POLL_MISSES) continue;
        return end({ kind: "error", text: res.error });
      }
      misses = 0;
      const view = res.data;
      if (view.status === "failed") return end({ kind: "error", text: view.message });
      if (view.status !== "ready") continue;

      if (read(id) !== snapshot) {
        return end({
          kind: "info",
          text: "You changed this answer while it was being typed up, so the dictated words weren't added.",
        });
      }
      const merged = appendDictation(snapshot, view.text ?? "", limit(id));
      if (!merged.added) {
        return end({
          kind: merged.truncated ? "error" : "info",
          text: merged.truncated ? "There's no room left in this answer for more words." : "We couldn't hear any speech.",
        });
      }
      write(id, merged.text);
      return end(
        merged.truncated ? { kind: "info", text: "Some of what you said was cut off to fit the length limit." } : undefined,
      );
    }
  }, []);

  const recorder = useVoiceRecorder((file) => {
    const id = activeRef.current;
    if (!id) return;
    // A take that ended because the app left the foreground is thrown away.
    if (AppState.currentState !== "active") {
      activeRef.current = null;
      setActiveId(null);
      return;
    }
    void transcribe(id, file.uri);
  });

  const { state, seconds, error, start, stop, cancel, supported } = recorder;

  // The 2-minute cap.
  const capNoted = useRef(false);
  useEffect(() => {
    if (state !== "recording") {
      capNoted.current = false;
      return;
    }
    if (shouldAutoStop(seconds) && !capNoted.current) {
      capNoted.current = true;
      cappedRef.current = true;
      void stop();
    }
  }, [state, seconds, stop]);

  const phase: DictationPhase = transcribing
    ? "transcribing"
    : state === "recording"
      ? "recording"
      : state === "requesting"
        ? "starting"
        : "idle";

  const toggle = useCallback(
    (id: string) => {
      if (!supported) return;
      if (phase === "recording") {
        if (activeRef.current === id) void stop();
        return;
      }
      if (phase !== "idle") return; // another field is busy
      activeRef.current = id;
      setActiveId(id);
      setNote(null);
      void start();
    },
    [phase, start, stop, supported],
  );

  const cancelAll = useCallback(() => {
    runRef.current += 1;
    const had = activeRef.current;
    activeRef.current = null;
    if (had) void cancel();
    if (mountedRef.current) {
      setTranscribing(false);
      setActiveId(null);
    }
  }, [cancel]);

  const noteFor = useCallback(
    (id: string): DictationNote | null => {
      if (note && note.id === id) return note;
      if (error && activeId === id && phase === "idle") return { kind: "error", text: error };
      return null;
    },
    [note, error, activeId, phase],
  );

  return { supported, phase, activeId, seconds, noteFor, toggle, cancelAll };
}
