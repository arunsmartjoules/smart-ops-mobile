/**
 * "Describe it" — log a client communication from notes or the client's
 * email / minutes instead of filling the form field by field. The mobile twin
 * of web/src/app/customer-communication/components/ai-intake-dialog.tsx:
 *
 *   compose (type · record / upload a voice note · attach documents/photos)
 *     voice notes ─► S3 ─► POST /ai/transcripts ─► poll ─► text into the notes
 *   ─► POST /ai/drafts ─► poll GET /ai/drafts/:id (progress)
 *   ─► [up to 4 questions] ─► onDrafted → the normal form, pre-filled
 *
 * Saving that form is what creates the entry, so it goes through the same
 * validation, reference numbering and timeline as a manual one.
 *
 * The web's live dictation (browser speech service) has no twin here — the
 * keyboard's own mic does the same job in the notes box. Recording needs
 * expo-audio in the installed binary (see useVoiceRecorder); uploading an
 * existing voice note works on every build.
 *
 * Online-only. Closing the sheet (unmount) abandons any upload/poll.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Camera, File as FileIcon, Paperclip, Search, X } from "@/components/jo/bxIcons";
import { PrimaryButton, SecondaryButton, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import CustomerCommunicationService, {
  AI_MSG_GENERIC,
  AI_MSG_NETWORK,
  type CommDraftFields,
  type CommDraftResult,
  type CommDraftView,
  type CommPerson,
  type CommQuestion,
  type CommQuestionOption,
} from "@/services/CustomerCommunicationService";
import { DateField, FieldBlock, OfflineNotice, PickerPanel, SelectButton, TextField, type PickerItem } from "./fields";
import { pickDocuments, pickPhotos, type PickedFile } from "./pick";
import { MAX_RECORDING_SECONDS, useVoiceRecorder } from "./useVoiceRecorder";

/** What the intake hands back: a pre-filled form. */
export interface AiDraftOutcome {
  fields: CommDraftFields;
  /** Uploaded documents and voice notes — kept on the entry as evidence. */
  attachments: string[];
  /** "voice note", "document(s)", "notes" — for the form banner and the timeline. */
  sources: string[];
}

/* ── limits & timings (web ai-intake.ts; server commIntakeService.ts) ──── */

const MAX_QUESTIONS = 4;
const MAX_DOCUMENTS = 3;
const MAX_NOTES_CHARS = 8000;
const MIN_NOTES_CHARS = 12;
const POLL_INTERVAL_MS = 1500;
/** The server fails an orphaned job after 5 min; the client gives up first. */
const DRAFT_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_MAX_MISSES = 4;
const MSG_DRAFT_TIMEOUT = "Drafting is taking longer than expected. Please try again in a few minutes.";
/** Transcribe can queue under load. */
const TRANSCRIPT_TIMEOUT_MS = 5 * 60 * 1000;
const MSG_TRANSCRIPT_TIMEOUT =
  "Transcribing this recording is taking longer than expected. Please try again, or type the details instead.";
const MB = 1024 * 1024;
const UPLOAD_PREFIX = "customer-communication/ai-documents";
const VOICE_PREFIX = "customer-communication/voice-notes";
const MAX_VOICE_NOTES = 5;
const MAX_AUDIO_BYTES = 20 * MB;

/** Formats Amazon Transcribe reads and the presign endpoint allows (web AUDIO_MIME_BY_EXT). */
const AUDIO_EXTS = new Set(["mp3", "m4a", "mp4", "wav", "ogg", "opus", "oga", "webm", "flac", "amr"]);
const AUDIO_PICKER_TYPES = ["audio/*"];

const DOC_EXTS = new Set(["pdf", "docx", "pptx", "jpg", "jpeg", "png", "webp"]);
const PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const DOC_PICKER_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** Null when the document can be uploaded, otherwise the message to show (web `checkDocument`). */
function checkDocument(file: PickedFile): string | null {
  const ext = file.ext;
  if (ext === "doc" || ext === "ppt") {
    return `"${file.name}" is an older Office file. Please save it as PDF or .docx and try again.`;
  }
  // The server reads no HEIC (commIntakeService `heic`) — say so before uploading.
  if (ext === "heic" || ext === "heif") return `"${file.name}" is a HEIC photo. Please upload it as JPG or PNG.`;
  if (!DOC_EXTS.has(ext)) {
    return `"${file.name}" can't be read. Please attach a PDF, Word (.docx), PowerPoint (.pptx) or a photo (JPG/PNG).`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size != null && PHOTO_EXTS.has(ext) && file.size > 5 * MB) {
    return `"${file.name}" is larger than 5 MB. Please attach a smaller photo.`;
  }
  if (file.size != null && file.size > 15 * MB) return `"${file.name}" is larger than 15 MB. Please attach a smaller copy.`;
  return null;
}

/** Null when the recording can be uploaded, otherwise the message to show (web `checkAudio`). */
function checkAudio(file: PickedFile): string | null {
  if (!AUDIO_EXTS.has(file.ext)) {
    return `"${file.name}" isn't a recording we can read. Please use MP3, M4A, WAV, OGG/OPUS (WhatsApp) or WebM.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size != null && file.size > MAX_AUDIO_BYTES) {
    return `"${file.name}" is larger than 20 MB. Please send a shorter voice note.`;
  }
  return null;
}

const formatDuration = (seconds: number) => {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

const appendText = (current: string, text: string) => (current.trim() ? `${current.trimEnd()}\n\n${text}` : text);

const isQuestionVisible = (q: CommQuestion, fl: CommDraftFields) =>
  !q.only_if || String(fl[q.only_if.field] ?? "") === q.only_if.equals;

/** The questions to ask now — never more than MAX_QUESTIONS. */
const visibleQuestions = (qs: CommQuestion[], fl: CommDraftFields) =>
  qs.filter((q) => isQuestionVisible(q, fl)).slice(0, MAX_QUESTIONS);

function isAnswered(q: CommQuestion, fl: CommDraftFields): boolean {
  const v = fl[q.field];
  return Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "";
}

const PROGRESS_STEPS = ["Reading your notes and documents", "Working out what was said", "Matching the site and people"];

function progressIndexFor(stage: CommDraftView["stage"]): number {
  switch (stage) {
    case "queued":
    case "reading":
      return 0;
    case "extracting":
      return 1;
    case "matching":
      return 2;
    default:
      return PROGRESS_STEPS.length;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type Step = "compose" | "progress" | "failed" | "questions";

const HEADINGS: Record<Step, { title: string; sub: string }> = {
  compose: {
    title: "Describe the communication",
    sub: "Type it, record or upload a voice note, or attach the client's email or minutes. We'll fill in the entry — you check it before it's logged.",
  },
  progress: { title: "Drafting the entry", sub: "Hang on while we go through it." },
  failed: { title: "We couldn't draft this", sub: "Nothing has been logged." },
  questions: {
    title: "A few quick questions",
    sub: "These weren't clear from what you gave us. We've suggested an answer where we could.",
  },
};

interface DocItem {
  id: string;
  file: PickedFile;
  state: "uploading" | "ready" | "failed";
  url?: string;
  error?: string;
}

interface VoiceNote {
  id: string;
  label: string;
  seconds: number | null;
  file: PickedFile;
  state: "uploading" | "transcribing" | "done" | "failed";
  url?: string;
  error?: string;
}

let seq = 0;
const newId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

const useStyles = makeJoStyles((t) => ({
  heading: { ...f.d(20, -0.02, 1.2), color: t.ink },
  sub: { ...f.t(12.5), color: t.muted, lineHeight: 18, marginTop: 4 },
  docRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: t.raised,
  },
  add: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.lineStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  addText: { ...f.t(12.5, 600), color: t.accentInk },
  recordBar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 22,
    backgroundColor: t.badTint,
  },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.bad },
  recordStop: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: t.bad,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 16,
    backgroundColor: t.badTint,
  },
  errorText: { ...f.t(12.5, 500), color: t.bad, flex: 1, lineHeight: 18 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "transparent",
    gap: 10,
  },
}));

export function CommAiIntake({
  siteNames,
  defaultSite,
  people,
  online,
  bottomInset,
  onDrafted,
  onCancel,
}: {
  siteNames: string[];
  defaultSite: string;
  /** Everyone the entry can be assigned to, with roles — for the person question. */
  people: CommPerson[];
  online: boolean;
  bottomInset: number;
  onDrafted: (outcome: AiDraftOutcome) => void;
  onCancel: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [step, setStep] = useState<Step>("compose");
  // "" until the person picks one; falls back to the screen's site (the site
  // list can still be loading when the sheet opens).
  const [pickedSite, setSite] = useState("");
  const site = pickedSite || defaultSite || siteNames[0] || "";
  const [notes, setNotes] = useState("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<CommDraftResult | null>(null);
  const [fields, setFields] = useState<CommDraftFields | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [picker, setPicker] = useState<null | "site" | "person">(null);

  const [voice, setVoice] = useState<VoiceNote[]>([]);

  /** Bumped to abandon a draft run (cancel, edit-and-retry, unmount). */
  const runRef = useRef(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      runRef.current += 1;
    },
    [],
  );

  /* ── voice notes ────────────────────────────────────────────────────── */

  const patchVoice = (id: string, patch: Partial<VoiceNote>) =>
    setVoice((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  /** Upload (unless already uploaded), transcribe, and append the words to the notes. */
  const runVoice = async (id: string, file: PickedFile, uploadedUrl?: string) => {
    let url = uploadedUrl;
    if (!url) {
      patchVoice(id, { state: "uploading", error: undefined });
      const up = await CustomerCommunicationService.uploadFile(file, VOICE_PREFIX);
      if (!mounted.current) return;
      if (!up.ok) return patchVoice(id, { state: "failed", error: up.error });
      url = up.url;
    }
    patchVoice(id, { state: "transcribing", url, error: undefined });

    const started = await CustomerCommunicationService.startTranscript({ audio_url: url, file_name: file.name });
    if (!mounted.current) return;
    if (!started.ok) return patchVoice(id, { state: "failed", error: started.error });
    let view = started.data;
    const deadline = Date.now() + TRANSCRIPT_TIMEOUT_MS;
    let misses = 0;
    while (view.status === "processing") {
      // Transcribe is slower than drafting; no point asking more often.
      await sleep(POLL_INTERVAL_MS * 2);
      if (!mounted.current) return;
      if (Date.now() > deadline) return patchVoice(id, { state: "failed", error: MSG_TRANSCRIPT_TIMEOUT });
      const next = await CustomerCommunicationService.getTranscript(view.id);
      if (!mounted.current) return;
      if (!next.ok) {
        if (next.network && ++misses < POLL_MAX_MISSES) continue;
        return patchVoice(id, { state: "failed", error: next.error });
      }
      misses = 0;
      view = next.data;
    }
    if (view.status === "ready" && view.text) {
      const text = view.text;
      setNotes((n) => appendText(n, text));
      setComposeError(null);
      patchVoice(id, { state: "done" });
    } else {
      patchVoice(id, { state: "failed", error: view.error_message?.trim() || AI_MSG_GENERIC });
    }
  };

  const recorder = useVoiceRecorder((file, seconds) => {
    const id = newId();
    setVoice((list) => [
      ...list,
      { id, label: `Voice note ${list.length + 1}`, seconds, file: { ...file }, state: "uploading" },
    ]);
    void runVoice(id, file);
  });

  const addVoiceFiles = (files: PickedFile[]) => {
    if (!files.length) return;
    if (!online) {
      setComposeError(AI_MSG_NETWORK);
      return;
    }
    setComposeError(null);
    let room = MAX_VOICE_NOTES - voice.length;
    for (const file of files) {
      if (room <= 0) {
        setComposeError(`You can add up to ${MAX_VOICE_NOTES} voice notes.`);
        break;
      }
      const problem = checkAudio(file);
      if (problem) {
        setComposeError(problem);
        continue;
      }
      room -= 1;
      const id = newId();
      setVoice((list) => [...list, { id, label: file.name, seconds: null, file, state: "uploading" }]);
      void runVoice(id, file);
    }
  };

  /* ── documents ──────────────────────────────────────────────────────── */

  const patchDoc = (id: string, patch: Partial<DocItem>) =>
    setDocs((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const uploadDoc = async (id: string, file: PickedFile) => {
    patchDoc(id, { state: "uploading", error: undefined });
    const res = await CustomerCommunicationService.uploadFile(file, UPLOAD_PREFIX);
    if (!mounted.current) return;
    if (res.ok) patchDoc(id, { state: "ready", url: res.url });
    else patchDoc(id, { state: "failed", error: res.error });
  };

  const addFiles = (files: PickedFile[]) => {
    if (!files.length) return;
    if (!online) {
      setComposeError(AI_MSG_NETWORK);
      return;
    }
    setComposeError(null);
    let room = MAX_DOCUMENTS - docs.length;
    for (const file of files) {
      if (room <= 0) {
        setComposeError(`You can attach up to ${MAX_DOCUMENTS} documents.`);
        break;
      }
      const problem = checkDocument(file);
      if (problem) {
        setComposeError(problem);
        continue;
      }
      room -= 1;
      const id = newId();
      setDocs((list) => [...list, { id, file, state: "uploading" }]);
      void uploadDoc(id, file);
    }
  };

  /* ── draft ──────────────────────────────────────────────────────────── */

  const busyVoice = voice.some((v) => v.state === "uploading" || v.state === "transcribing");
  const busyDocs = docs.some((d) => d.state === "uploading");
  const readyDocs = docs.filter((d): d is DocItem & { url: string } => d.state === "ready" && !!d.url);
  const doneVoice = voice.filter((v): v is VoiceNote & { url: string } => v.state === "done" && !!v.url);
  const recording = recorder.state !== "idle";
  const notesTooLong = notes.length > MAX_NOTES_CHARS;
  const hasInput = notes.trim().length >= MIN_NOTES_CHARS || readyDocs.length > 0;
  const canDraft = online && !!site && hasInput && !busyVoice && !busyDocs && !recording && !notesTooLong;

  const waitingReason = !online
    ? "You're offline. Drafting needs a connection."
    : recording
      ? "Stop the recording first."
      : busyVoice
        ? "Waiting for the voice note to be transcribed…"
        : busyDocs
          ? "Waiting for the documents to upload…"
          : notesTooLong
        ? `Please keep the notes under ${thousands(MAX_NOTES_CHARS)} characters.`
        : !site
          ? "Choose the site first."
          : !hasInput
            ? recorder.supported
              ? "Describe it in a sentence or two — type or record it — or attach a document."
              : "Describe it in a sentence or two, upload a voice note, or attach a document."
            : null;

  const sourcesOf = (): string[] => {
    const out: string[] = [];
    if (doneVoice.length) out.push(doneVoice.length > 1 ? "voice notes" : "voice note");
    if (readyDocs.length) out.push(readyDocs.length > 1 ? "documents" : "document");
    if (!out.length) out.push("notes");
    return out;
  };

  const finish = (fl: CommDraftFields) => {
    runRef.current += 1;
    onDrafted({
      fields: fl,
      attachments: [...readyDocs.map((d) => d.url), ...doneVoice.map((v) => v.url)],
      sources: sourcesOf(),
    });
  };

  const startQuestions = (r: CommDraftResult) => {
    let fl: CommDraftFields = { ...r.fields };
    // Pre-select every suggested answer, so "Next" is enough when it's right.
    for (const q of r.questions) {
      if (q.kind === "choice") {
        const rec = q.options?.find((o) => o.recommended);
        if (rec) fl = { ...fl, [q.field]: rec.value };
      }
      if (q.kind === "person" && !fl.assignee) {
        const rec = r.assignee_options.find((o) => o.recommended);
        if (rec) fl = { ...fl, assignee: rec.value };
      }
    }
    setResult(r);
    setFields(fl);
    if (visibleQuestions(r.questions, fl).length === 0) {
      finish(fl);
      return;
    }
    setQuestionIndex(0);
    setStep("questions");
  };

  const draft = async () => {
    if (!canDraft) return;
    const run = ++runRef.current;
    const alive = () => mounted.current && runRef.current === run;
    const fail = (message: string) => {
      setFailure(message);
      setStep("failed");
    };

    setComposeError(null);
    setFailure(null);
    setProgressIndex(0);
    setStep("progress");

    const started = await CustomerCommunicationService.startDraft({
      site_name: site,
      notes: notes.trim(),
      documents: readyDocs.map((d) => ({ url: d.url, name: d.file.name })),
    });
    if (!alive()) return;
    if (!started.ok) return fail(started.error);

    let view = started.data;
    const deadline = Date.now() + DRAFT_TIMEOUT_MS;
    let misses = 0;
    while (view.status === "processing") {
      setProgressIndex(progressIndexFor(view.stage));
      await sleep(POLL_INTERVAL_MS);
      if (!alive()) return;
      if (Date.now() > deadline) return fail(MSG_DRAFT_TIMEOUT);
      const next = await CustomerCommunicationService.getDraft(view.id);
      if (!alive()) return;
      if (!next.ok) {
        // A patchy connection or a busy server gets a few more tries.
        if (next.network && ++misses < POLL_MAX_MISSES) continue;
        return fail(next.error);
      }
      misses = 0;
      view = next.data;
    }
    if (view.status === "ready" && view.result) {
      startQuestions(view.result);
      return;
    }
    fail(view.error_message?.trim() || AI_MSG_GENERIC);
  };

  const backToCompose = () => {
    runRef.current += 1;
    setFailure(null);
    setStep("compose");
  };

  /* ── questions ──────────────────────────────────────────────────────── */

  const visible = useMemo(
    () => (result && fields ? visibleQuestions(result.questions, fields) : []),
    [result, fields],
  );
  const question = visible[Math.min(questionIndex, Math.max(visible.length - 1, 0))];
  const position = question ? visible.indexOf(question) : -1;
  const canNext = !!question && !!fields && (!question.required || isAnswered(question, fields));

  const answer = useCallback((field: keyof CommDraftFields, value: string) => {
    setFields((fl) => (fl ? { ...fl, [field]: value } : fl));
  }, []);

  const next = () => {
    if (!fields || !question) return;
    if (position + 1 < visible.length) setQuestionIndex(position + 1);
    else finish(fields);
  };

  const siteItems: PickerItem[] = useMemo(() => {
    const names = new Set(siteNames.filter(Boolean));
    if (site) names.add(site);
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [siteNames, site]);

  const peopleItems: PickerItem[] = useMemo(
    () => people.map((p) => ({ value: p.name, label: p.name, meta: p.role || undefined })),
    [people],
  );

  /* ── render ─────────────────────────────────────────────────────────── */

  const heading =
    step === "compose" && !recorder.supported
      ? {
          ...HEADINGS.compose,
          sub: "Type it, upload a voice note, or attach the client's email or minutes. We'll fill in the entry — you check it before it's logged.",
        }
      : HEADINGS[step];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 16 }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {step === "compose" ? <Bx name="bxs-magic-wand" size={18} color={t.accentInk} /> : null}
            <Text style={[s.heading, { flexShrink: 1 }]} accessibilityRole="header">
              {heading.title}
            </Text>
          </View>
          <Text style={s.sub}>{heading.sub}</Text>
        </View>

        {step === "compose" ? (
          <>
            {!online ? <OfflineNotice text="You're offline. Describing an entry needs a connection." /> : null}
            <FieldBlock label="Site" required>
              <SelectButton value={site} placeholder="Select site" onPress={() => setPicker("site")} accessibilityLabel="Site" />
            </FieldBlock>

            <FieldBlock
              label="What was communicated?"
              hint="Voice notes are written out here so you can correct them before drafting. You can also tap the mic on your keyboard to dictate."
            >
              <TextField
                value={notes}
                onChangeText={(v) => {
                  setNotes(v);
                  setComposeError(null);
                }}
                placeholder="e.g. Dr. Rao (Medical Superintendent) called at 10 am — OT 3 has been warm since morning and he wants it fixed today. Ravi to check AHU-3."
                multiline
                minHeight={150}
                error={notesTooLong ? `Keep it under ${thousands(MAX_NOTES_CHARS)} characters.` : undefined}
                accessibilityLabel="What was communicated"
              />
              <Text
                style={[
                  f.t(11.5, notesTooLong ? 600 : 400),
                  { color: notesTooLong ? t.bad : t.faint, alignSelf: "flex-end", paddingHorizontal: 4 },
                ]}
              >
                {thousands(notes.length)} / {thousands(MAX_NOTES_CHARS)}
              </Text>
            </FieldBlock>

            {recorder.state === "recording" ? (
              <View style={s.recordBar} accessibilityLiveRegion="polite" accessibilityRole="summary">
                <View style={s.recordDot} />
                <Text style={[f.m(13, 600), { color: t.bad, flex: 1 }]}>
                  Recording {formatDuration(recorder.seconds)}
                  <Text style={[f.m(12), { color: t.muted }]}> / {formatDuration(MAX_RECORDING_SECONDS)}</Text>
                </Text>
                <TouchableOpacity onPress={() => void recorder.cancel()} hitSlop={8} accessibilityRole="button">
                  <Text style={[f.t(12.5, 600), { color: t.muted }]}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.recordStop}
                  onPress={() => void recorder.stop()}
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording"
                >
                  <Bx name="bx-stop" size={16} color="#FFFFFF" />
                  <Text style={[f.t(12.5, 600), { color: "#FFFFFF" }]}>Stop</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {recorder.supported && recorder.state !== "recording" ? (
                <TouchableOpacity
                  style={[s.add, { opacity: voice.length >= MAX_VOICE_NOTES || !online ? 0.5 : 1 }]}
                  disabled={voice.length >= MAX_VOICE_NOTES || !online || recorder.state === "requesting"}
                  onPress={() => {
                    recorder.clearError();
                    setComposeError(null);
                    void recorder.start();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Record voice note"
                >
                  {recorder.state === "requesting" ? (
                    <ActivityIndicator size="small" color={t.accentInk} />
                  ) : (
                    <Bx name="bx-microphone" size={16} color={t.accentInk} />
                  )}
                  <Text style={s.addText}>Record voice note</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[s.add, { opacity: voice.length >= MAX_VOICE_NOTES || !online || recording ? 0.5 : 1 }]}
                disabled={voice.length >= MAX_VOICE_NOTES || !online || recording}
                onPress={() => void pickDocuments(AUDIO_PICKER_TYPES).then(addVoiceFiles)}
                accessibilityRole="button"
                accessibilityLabel="Upload voice note"
              >
                <Bx name="bx-upload" size={16} color={t.accentInk} />
                <Text style={s.addText}>Upload voice note</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.add, { opacity: docs.length >= MAX_DOCUMENTS || !online ? 0.5 : 1 }]}
                disabled={docs.length >= MAX_DOCUMENTS || !online}
                onPress={() => void pickDocuments(DOC_PICKER_TYPES).then(addFiles)}
                accessibilityRole="button"
                accessibilityLabel="Attach document"
              >
                <Paperclip size={16} color={t.accentInk} />
                <Text style={s.addText}>Attach document</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.add, { opacity: docs.length >= MAX_DOCUMENTS || !online ? 0.5 : 1 }]}
                disabled={docs.length >= MAX_DOCUMENTS || !online}
                onPress={() => void pickPhotos(MAX_DOCUMENTS - docs.length).then(addFiles)}
                accessibilityRole="button"
                accessibilityLabel="Add photo"
              >
                <Camera size={16} color={t.accentInk} />
                <Text style={s.addText}>Add photo</Text>
              </TouchableOpacity>
            </View>

            {recorder.error ? <ErrorBox message={recorder.error} /> : null}

            {voice.length > 0 || docs.length > 0 ? (
              <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
                {voice.map((v) => {
                  const busy = v.state === "uploading" || v.state === "transcribing";
                  const name = v.label + (v.seconds ? ` · ${formatDuration(v.seconds)}` : "");
                  return (
                    <View key={v.id} style={s.docRow}>
                      <Bx name="bx-user-voice" size={16} color={t.muted} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[f.t(13, 500), { color: t.ink }]} numberOfLines={1}>
                          {name}
                        </Text>
                        {v.state === "failed" ? (
                          <Text style={[f.t(12), { color: t.bad, marginTop: 2 }]}>{v.error || AI_MSG_GENERIC}</Text>
                        ) : (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                            {busy ? (
                              <ActivityIndicator size="small" color={t.muted} />
                            ) : (
                              <Bx name="bx-check-circle" size={13} color={t.ok} />
                            )}
                            <Text style={[f.t(12), { color: t.muted }]}>
                              {v.state === "uploading"
                                ? "Uploading…"
                                : v.state === "transcribing"
                                  ? "Converting speech to text…"
                                  : "Added to your notes"}
                            </Text>
                          </View>
                        )}
                      </View>
                      {v.state === "failed" ? (
                        <TouchableOpacity onPress={() => void runVoice(v.id, v.file, v.url)} hitSlop={8} accessibilityRole="button">
                          <Text style={[f.t(12.5, 600), { color: t.accentInk }]}>Retry</Text>
                        </TouchableOpacity>
                      ) : null}
                      {!busy ? (
                        <TouchableOpacity
                          onPress={() => setVoice((list) => list.filter((x) => x.id !== v.id))}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${name}`}
                        >
                          <X size={16} color={t.muted} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
                {docs.map((d) => (
                  <View key={d.id} style={s.docRow}>
                    <FileIcon size={16} color={t.muted} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[f.t(13, 500), { color: t.ink }]} numberOfLines={1}>
                        {d.file.name}
                      </Text>
                      {d.state === "failed" ? (
                        <Text style={[f.t(12), { color: t.bad, marginTop: 2 }]}>{d.error || AI_MSG_GENERIC}</Text>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                          {d.state === "uploading" ? (
                            <ActivityIndicator size="small" color={t.muted} />
                          ) : (
                            <Bx name="bx-check-circle" size={13} color={t.ok} />
                          )}
                          <Text style={[f.t(12), { color: t.muted }]}>{d.state === "uploading" ? "Uploading…" : "Ready"}</Text>
                        </View>
                      )}
                    </View>
                    {d.state === "failed" ? (
                      <TouchableOpacity onPress={() => void uploadDoc(d.id, d.file)} hitSlop={8} accessibilityRole="button">
                        <Text style={[f.t(12.5, 600), { color: t.accentInk }]}>Retry</Text>
                      </TouchableOpacity>
                    ) : null}
                    {d.state !== "uploading" ? (
                      <TouchableOpacity
                        onPress={() => setDocs((list) => list.filter((x) => x.id !== d.id))}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${d.file.name}`}
                      >
                        <X size={16} color={t.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {composeError ? <ErrorBox message={composeError} /> : null}
          </>
        ) : null}

        {step === "progress" ? <DraftProgress index={progressIndex} /> : null}

        {step === "failed" && failure ? <ErrorBox message={failure} /> : null}

        {step === "questions" && question && fields && result ? (
          <QuestionStep
            key={question.id}
            question={question}
            position={position + 1}
            total={visible.length}
            fields={fields}
            result={result}
            onAnswer={answer}
            onSearchPeople={() => setPicker("person")}
          />
        ) : null}
      </ScrollView>

      <View style={[s.footer, { borderTopColor: t.line, paddingBottom: 12 + bottomInset }]}>
        {step === "compose" ? (
          <>
            {waitingReason ? (
              <Text style={[f.t(12), { color: t.muted, textAlign: "center" }]} accessibilityLiveRegion="polite">
                {waitingReason}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <SecondaryButton label="Cancel" onPress={onCancel} style={{ flex: 1 }} height={52} />
              <PrimaryButton
                label="Draft entry"
                icon="bxs-magic-wand"
                onPress={() => void draft()}
                disabled={!canDraft}
                height={52}
                style={{ flex: 1.4 }}
              />
            </View>
          </>
        ) : null}
        {step === "progress" ? <SecondaryButton label="Cancel" onPress={backToCompose} height={52} /> : null}
        {step === "failed" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SecondaryButton label="Close" onPress={onCancel} style={{ flex: 1 }} height={52} />
            <PrimaryButton label="Edit and try again" icon="bx-revision" onPress={backToCompose} height={52} style={{ flex: 1.4 }} />
          </View>
        ) : null}
        {step === "questions" && fields ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <SecondaryButton
                label="Back"
                icon="bx-left-arrow-alt"
                onPress={() => setQuestionIndex(Math.max(0, position - 1))}
                style={{ flex: 1, opacity: position <= 0 ? 0.5 : 1 }}
                height={52}
              />
              <PrimaryButton
                label={position + 1 < visible.length ? "Next" : "Review entry"}
                onPress={next}
                disabled={!canNext}
                height={52}
                style={{ flex: 1.4 }}
              />
            </View>
            <TouchableOpacity onPress={() => finish(fields)} accessibilityRole="button" style={{ alignSelf: "center", padding: 4 }}>
              <Text style={[f.t(13, 600), { color: t.accentInk }]}>Fill the rest in the form</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <PickerPanel
        visible={picker === "site"}
        title="Site"
        items={siteItems}
        value={site}
        onPick={(v) => {
          setSite(v);
          setComposeError(null);
        }}
        onClose={() => setPicker(null)}
        searchPlaceholder="Search site"
      />
      <PickerPanel
        visible={picker === "person" && !!question}
        title="Assign to"
        items={peopleItems}
        value={question && fields ? String(fields[question.field] ?? "") : ""}
        onPick={(v) => question && answer(question.field, v)}
        onClose={() => setPicker(null)}
        searchPlaceholder="Search people"
      />
    </View>
  );
}

/* ── pieces ────────────────────────────────────────────────────────────── */

function ErrorBox({ message }: { message: string }) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <View style={s.errorBox} accessibilityRole="alert">
      <Bx name="bx-error-circle" size={16} color={t.bad} />
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

function DraftProgress({ index }: { index: number }) {
  const t = useJoTheme();
  const s = useStyles();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
      {PROGRESS_STEPS.map((label, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <View key={label} style={[s.stepRow, active && { backgroundColor: t.accentTint }]}>
            <View
              style={[
                s.stepDot,
                done
                  ? { backgroundColor: t.okTint }
                  : active
                    ? { backgroundColor: t.card }
                    : { borderWidth: 1, borderColor: t.lineMid },
              ]}
            >
              {done ? (
                <Bx name="bx-check" size={15} color={t.ok} />
              ) : active ? (
                <ActivityIndicator size="small" color={t.accentInk} />
              ) : (
                <Text style={[f.t(11, 600), { color: t.faint }]}>{i + 1}</Text>
              )}
            </View>
            <Text
              style={[
                f.t(13.5, active ? 600 : 400),
                { color: active ? t.ink : done ? t.muted : t.faint, flex: 1 },
              ]}
            >
              {label}
              {done ? " — done" : ""}
            </Text>
          </View>
        );
      })}
      {seconds >= 25 ? (
        <Text style={[f.t(12.5), { color: t.muted, marginTop: 6 }]}>Still working — long documents can take up to a minute.</Text>
      ) : null}
    </View>
  );
}

function QuestionStep({
  question,
  position,
  total,
  fields,
  result,
  onAnswer,
  onSearchPeople,
}: {
  question: CommQuestion;
  position: number;
  total: number;
  fields: CommDraftFields;
  result: CommDraftResult;
  onAnswer: (field: keyof CommDraftFields, value: string) => void;
  onSearchPeople: () => void;
}) {
  const t = useJoTheme();
  const value = String(fields[question.field] ?? "");
  const cards = result.assignee_options.slice(0, 4);
  const pickedElsewhere = !!value && !cards.some((c) => c.value === value);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[f.t(12, 600), { color: t.faint, textTransform: "uppercase", letterSpacing: 0.5 }]}>
          Question {position} of {total}
        </Text>
        <View style={{ flexDirection: "row", gap: 5 }} importantForAccessibility="no-hide-descendants">
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={{
                height: 6,
                width: i + 1 === position ? 20 : 6,
                borderRadius: 3,
                backgroundColor: i + 1 <= position ? t.accent : t.lineMid,
                opacity: i + 1 < position ? 0.6 : 1,
              }}
            />
          ))}
        </View>
      </View>
      <View>
        <Text style={[f.t(17, 600), { color: t.ink, lineHeight: 23 }]} accessibilityRole="header">
          {question.title}
        </Text>
        {question.help ? <Text style={[f.t(13), { color: t.muted, marginTop: 4, lineHeight: 18 }]}>{question.help}</Text> : null}
      </View>

      {question.kind === "choice" ? (
        <OptionCards options={question.options ?? []} value={value} onPick={(v) => onAnswer(question.field, v)} />
      ) : null}
      {question.kind === "text" ? (
        <TextField
          value={value}
          onChangeText={(v) => onAnswer(question.field, v)}
          placeholder="Type your answer"
          multiline
          minHeight={110}
          accessibilityLabel={question.title}
        />
      ) : null}
      {question.kind === "date" ? (
        <DateField
          value={value}
          onChange={(v) => onAnswer(question.field, v)}
          minimumDate={fields.communication_date || undefined}
          accessibilityLabel={question.title}
        />
      ) : null}
      {question.kind === "person" ? (
        <View style={{ gap: 12 }}>
          {cards.length ? <OptionCards options={cards} value={value} onPick={(v) => onAnswer(question.field, v)} /> : null}
          <FieldBlock label={cards.length ? "Someone else" : "Search people"}>
            <SelectButton
              value={pickedElsewhere ? value : ""}
              placeholder="Search by name"
              onPress={onSearchPeople}
              icon={Search}
              accessibilityLabel={cards.length ? "Someone else" : "Search people"}
            />
          </FieldBlock>
        </View>
      ) : null}
    </View>
  );
}

function OptionCards({
  options,
  value,
  onPick,
}: {
  options: CommQuestionOption[];
  value: string;
  onPick: (value: string) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onPick(o.value)}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[
              s.option,
              { borderColor: selected ? t.accent : t.lineMid, backgroundColor: selected ? t.accentTint : t.card },
            ]}
          >
            <Bx
              name={selected ? "bx-radio-circle-marked" : "bx-radio-circle"}
              size={20}
              color={selected ? t.accentInk : t.faint}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <Text style={[f.t(13.5, 600), { color: t.ink, flexShrink: 1 }]}>{o.label}</Text>
                {o.recommended ? (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: t.okTint }}>
                    <Text style={[f.t(10.5, 600), { color: t.ok, textTransform: "uppercase" }]}>Suggested</Text>
                  </View>
                ) : null}
              </View>
              {o.hint ? <Text style={[f.t(12), { color: t.muted, marginTop: 2, lineHeight: 17 }]}>{o.hint}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
