/**
 * Record a voice note on the device — the mobile twin of the web
 * customer-communication `use-voice-recorder` hook. The file goes up to S3 and
 * through /ai/transcripts, so the words land in the "Describe it" notes.
 *
 * expo-audio is a native module, so only binaries built after it was added
 * have it. `requireOptionalNativeModule` tells us without throwing, and the
 * library's JS entry (which calls `requireNativeModule` at load and would
 * crash older builds) is only required once we know it is there. On older
 * builds `supported` is false and the screen simply hides the record button.
 *
 * Mono AAC in an .m4a at 64 kbps: ~0.5 MB a minute, so the 10-minute cap stays
 * far below the server's 20 MB limit. Recording stops (and keeps the take)
 * when the app goes to the background — background recording is not enabled.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { AudioRecorder } from "expo-audio";

type ExpoAudio = typeof import("expo-audio");

/** The recorder stops itself here (web MAX_RECORDING_SECONDS). */
export const MAX_RECORDING_SECONDS = 10 * 60;

const RECORDER_SUPPORTED = Platform.OS !== "web" && requireOptionalNativeModule("ExpoAudio") != null;

function loadAudio(): ExpoAudio {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-audio") as ExpoAudio;
}

/** RecordingPresets.HIGH_QUALITY, mono and at half the bit rate — it's speech. */
function voiceOptions(audio: ExpoAudio) {
  const preset = audio.RecordingPresets.HIGH_QUALITY;
  const common = {
    extension: ".m4a",
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
    isMeteringEnabled: false,
  };
  // Same flattening as expo-audio's own createRecordingOptions.
  return Platform.OS === "ios" ? { ...common, ...preset.ios } : { ...common, ...preset.android };
}

export type RecorderState = "idle" | "requesting" | "recording";

export interface RecordedVoiceNote {
  uri: string;
  name: string;
  ext: string;
  size: number | null;
}

export function useVoiceRecorder(onRecorded: (file: RecordedVoiceNote, seconds: number) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const takesRef = useRef(0);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  });
  const mounted = useRef(true);

  /** Detach the current recorder so a second stop/cancel is a no-op; returns it. */
  const detach = useCallback((): AudioRecorder | null => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recorderRef.current;
    recorderRef.current = null;
    return rec;
  }, []);

  /** Free the native recorder and hand the audio session back to playback. */
  const release = useCallback(async (rec: AudioRecorder | null) => {
    if (rec) {
      try {
        rec.release();
      } catch {
        // Already released — nothing to free.
      }
    }
    // iOS keeps routing sound to the earpiece while the session allows recording.
    if (RECORDER_SUPPORTED) await loadAudio().setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, []);

  /** Stop and hand the take to `onRecorded`. */
  const stop = useCallback(async () => {
    const rec = detach();
    if (!rec) return;
    const secs = Math.round(rec.currentTime);
    try {
      await rec.stop();
    } catch {
      // A failed stop leaves no usable file; the uri check below reports it.
    }
    const uri = rec.uri;
    await release(rec);
    if (!mounted.current) return;
    setState("idle");
    setSeconds(0);
    if (!uri) {
      setError("The recording didn't save. Please try again.");
      return;
    }
    takesRef.current += 1;
    onRecordedRef.current({ uri, name: `voice-note-${takesRef.current}.m4a`, ext: "m4a", size: null }, secs);
  }, [detach, release]);

  /** Stop and throw the take away. */
  const cancel = useCallback(async () => {
    const rec = detach();
    if (rec) await rec.stop().catch(() => {});
    await release(rec);
    if (mounted.current) {
      setState("idle");
      setSeconds(0);
    }
  }, [detach, release]);

  const start = useCallback(async () => {
    if (!RECORDER_SUPPORTED || recorderRef.current) return;
    setError(null);
    setState("requesting");
    try {
      const audio = loadAudio();
      const perm = await audio.requestRecordingPermissionsAsync();
      if (!mounted.current) return;
      if (!perm.granted) {
        setState("idle");
        setError("Allow microphone access for JouleOps in Settings to record a voice note.");
        return;
      }
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const rec = new audio.AudioModule.AudioRecorder(voiceOptions(audio));
      recorderRef.current = rec;
      await rec.prepareToRecordAsync();
      if (!mounted.current || recorderRef.current !== rec) return;
      rec.record();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        const secs = rec.currentTime;
        setSeconds(Math.floor(secs));
        if (secs >= MAX_RECORDING_SECONDS) void stop();
      }, 500);
    } catch {
      await release(detach());
      if (!mounted.current) return;
      setState("idle");
      setError("Couldn't start recording. Close any other app using the microphone and try again.");
    }
  }, [detach, release, stop]);

  // No background recording: keep what was said so far when the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && recorderRef.current) void stop();
    });
    return () => sub.remove();
  }, [stop]);

  // Closing the sheet discards an unfinished take.
  useEffect(
    () => () => {
      mounted.current = false;
      const rec = detach();
      if (rec) void rec.stop().catch(() => {}).finally(() => void release(rec));
    },
    [detach, release],
  );

  return {
    supported: RECORDER_SUPPORTED,
    state,
    seconds,
    error,
    clearError: () => setError(null),
    start,
    stop,
    cancel,
  };
}
