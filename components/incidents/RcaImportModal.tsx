/**
 * "Upload RCA report" → the server reads the report and drafts the incident.
 *
 *   upload ─► progress (upload + poll) ─► duplicate? ─► questions? ─► review ─► done
 *
 * Online-only: the file goes to S3 through the usual presigned PUT, the read
 * runs on the server, and nothing is put on the offline queue. Every message
 * a person sees is plain language — the server's own copy when it sent one.
 * Polling stops the moment the screen closes, and gives up after 3 minutes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import {
  CircleAlert,
  CircleCheck,
  CloudUpload,
  CopyCheck,
  FileText,
  Image as ImageIcon,
  Paperclip,
  RefreshCw,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react-native";
import { v4 as uuidv4 } from "uuid";
import PressableScale from "@/components/PressableScale";
import FullscreenPicker from "@/components/FullscreenPicker";
import RequiredMark from "@/components/RequiredMark";
import type { SelectOption } from "@/components/SearchableSelect";
import { DetailCard, DetailHeader, soRadius } from "@/components/tickets/TicketDetailUI";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { StorageService } from "@/services/StorageService";
import { TicketsService } from "@/services/TicketsService";
import { IncidentsService } from "@/services/IncidentsService";
import {
  RCA_GENERIC_ERROR,
  RCA_NETWORK_ERROR,
  RcaImportService,
  type RcaCreateFields,
  type RcaFields,
  type RcaImportResult,
  type RcaImportView,
} from "@/services/RcaImportService";
import RcaProgress, { type RcaPhase } from "./RcaProgress";
import RcaQuestionStep from "./RcaQuestionStep";
import RcaReviewStep from "./RcaReviewStep";
import { FooterButtons, InlineError, Notice } from "./RcaImportParts";
import {
  FIELD_ORDER,
  FILE_KIND_LABEL,
  RCA_PICKER_TYPES,
  checkRcaFile,
  formatBytes,
  isFullLocal,
  isQuestionAnswered,
  isQuestionVisible,
  localToIso,
  validateRcaFields,
  type PickedRcaFile,
} from "./rcaImportLib";

const POLL_MS = 1500;
const GIVE_UP_MS = 3 * 60 * 1000;
/** Consecutive failed polls tolerated on a patchy connection. */
const POLL_MISSES = 4;

type Step = "upload" | "progress" | "error" | "duplicate" | "questions" | "review" | "success";

/**
 * Mount with a new `key` for every open (see the incidents tab) so each
 * upload starts from a clean slate.
 */
interface Props {
  visible: boolean;
  /** The site selected on the incidents screen — the upload's default. */
  defaultSiteCode: string;
  siteOptions: SelectOption[];
  isConnected: boolean | null;
  onClose: () => void;
  /** Called once the incident exists — refresh the list. */
  onCreated: (incident: any) => void;
  /** Open an incident (the new one, or the one a duplicate points at). */
  onViewIncident: (incident: any) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const haptic = (t: Haptics.NotificationFeedbackType) => Haptics.notificationAsync(t).catch(() => {});

export default function RcaImportModal({
  visible,
  defaultSiteCode,
  siteOptions,
  isConnected,
  onClose,
  onCreated,
  onViewIncident,
}: Props) {
  const ds = useDs();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const offline = isConnected === false;

  const [step, setStep] = useState<Step>("upload");
  const [siteCode, setSiteCode] = useState(defaultSiteCode);
  const [file, setFile] = useState<PickedRcaFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [phase, setPhase] = useState<RcaPhase>("uploading");
  const [failure, setFailure] = useState<{
    title: string;
    message: string;
    /** Connection/timeout trouble — the same file is worth another go. */
    retry: boolean;
  } | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [result, setResult] = useState<RcaImportResult | null>(null);
  const [fields, setFields] = useState<RcaFields | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<any | null>(null);
  const [dupBusy, setDupBusy] = useState(false);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<SelectOption[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<SelectOption[]>([]);

  /** Bumped to abandon an in-flight upload/poll (close, cancel, unmount). */
  const runRef = useRef(0);
  const creatingRef = useRef(false);
  const resultRef = useRef<RcaImportResult | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Closing (or unmounting) abandons any upload/poll still running. The
  // parent remounts this screen with a fresh key on every open, so there is
  // no state to reset here.
  useEffect(() => {
    if (!visible) runRef.current += 1;
  }, [visible]);
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  /* ── fields ─────────────────────────────────────────────────────────── */

  const setField = useCallback(<K extends keyof RcaFields>(field: K, value: RcaFields[K]) => {
    setFields((prev) => {
      if (!prev) return prev;
      if (field === "site_code" && value !== prev.site_code) {
        const code = value as string;
        return {
          ...prev,
          site_code: code,
          asset_location: resultRef.current?.asset_auto[code] ?? null,
          assigned_to: resultRef.current?.assignee_auto?.[code] ?? null,
        };
      }
      return { ...prev, [field]: value };
    });
    if (field === "site_code") setAssetSearch("");
    setCreateError(null);
  }, []);

  const fieldSite = fields?.site_code ?? "";
  const inForm = step === "questions" || step === "review";

  // Assets for the chosen site — remote search, debounced.
  useEffect(() => {
    if (!inForm || !fieldSite) return;
    let stale = false;
    const t = setTimeout(async () => {
      setAssetsLoading(true);
      try {
        const res = await TicketsService.getAssets(fieldSite, {
          page: 1,
          limit: 100,
          search: assetSearch.trim() || undefined,
        });
        if (stale) return;
        setAssetResults(
          res?.success
            ? (res.data || []).map((a: any) => ({
                value: a.asset_name || a.asset_id || "",
                label: a.asset_name || a.asset_id || "",
                description: `${a.asset_type || ""} ${a.location ? `- ${a.location}` : ""}`.trim(),
              }))
            : [],
        );
      } catch {
        if (!stale) setAssetResults([]);
      } finally {
        if (!stale) setAssetsLoading(false);
      }
    }, assetSearch ? 300 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [inForm, fieldSite, assetSearch]);

  // Site users for "Assigned to".
  useEffect(() => {
    if (!inForm || !fieldSite) return;
    let stale = false;
    IncidentsService.getSiteUsers(fieldSite)
      .then((res: any) => {
        if (stale || !res?.success || !Array.isArray(res.data)) return;
        setAssigneeOptions(
          res.data
            .filter((u: any) => u?.user_id)
            .map((u: any) => ({
              value: u.user_id,
              label: u.user_name || u.user_employee_code || u.user_id,
              description: u.user_designation || u.user_department || "",
            })),
        );
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [inForm, fieldSite]);

  const candidates = useMemo(
    () => (result && fieldSite ? (result.asset_options[fieldSite] ?? []) : []),
    [result, fieldSite],
  );
  const personCandidates = useMemo(
    () => (result && fieldSite ? (result.assignee_options?.[fieldSite] ?? []) : []),
    [result, fieldSite],
  );

  /** Review "Assigned to": the people the report names first, then everyone at the site. */
  const reviewAssigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: SelectOption[] = [];
    personCandidates.forEach((c) => {
      if (!c.value || seen.has(c.value)) return;
      seen.add(c.value);
      out.push({
        value: c.value,
        label: c.label,
        description: c.recommended ? `Recommended${c.hint ? ` · ${c.hint}` : ""}` : c.hint,
      });
    });
    assigneeOptions.forEach((o) => {
      if (!o.value || seen.has(o.value)) return;
      seen.add(o.value);
      out.push(o);
    });
    return out;
  }, [personCandidates, assigneeOptions]);

  /** Review picker: the report's best matches first, then the search results. */
  const reviewAssetOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: SelectOption[] = [];
    const push = (o: SelectOption) => {
      if (!o.value || seen.has(o.value)) return;
      seen.add(o.value);
      out.push(o);
    };
    if (!assetSearch.trim()) {
      candidates.forEach((c) =>
        push({ value: c.value, label: c.label, description: c.recommended ? `Recommended · ${c.hint}` : c.hint }),
      );
    }
    assetResults.forEach(push);
    return out;
  }, [candidates, assetResults, assetSearch]);

  /* ── questions ──────────────────────────────────────────────────────── */

  const visibleQuestions = useMemo(
    () => (result && fields ? result.questions.filter((q) => isQuestionVisible(q, fields)) : []),
    [result, fields],
  );
  const qIndex = Math.max(
    0,
    visibleQuestions.findIndex((q) => q.id === questionId),
  );
  const question = visibleQuestions[qIndex] ?? null;

  const goToQuestionsOrReview = useCallback(
    (r: RcaImportResult, f: RcaFields) => {
      const first = r.questions.find((q) => isQuestionVisible(q, f));
      if (first) {
        setQuestionId(first.id);
        setStep("questions");
      } else {
        setStep("review");
      }
    },
    [],
  );

  const nextQuestion = () => {
    const next = visibleQuestions[qIndex + 1];
    if (next) setQuestionId(next.id);
    else setStep("review");
  };
  const prevQuestion = () => {
    const prev = visibleQuestions[qIndex - 1];
    if (prev) setQuestionId(prev.id);
  };

  /* ── reading the report ─────────────────────────────────────────────── */

  const fail = (title: string, message: string, retry = false) => {
    haptic(Haptics.NotificationFeedbackType.Error);
    setFailure({ title, message, retry });
    setStep("error");
  };

  const applyResult = (view: RcaImportView) => {
    const r = view.result!;
    const f: RcaFields = { ...r.fields };
    // Pre-select every Recommended answer, and pre-fill full defaults.
    for (const q of r.questions) {
      if (q.kind === "choice") {
        const rec = q.options?.find((o) => o.recommended);
        if (!rec) continue;
        if (q.field === "site_code") {
          if (rec.value !== f.site_code) {
            f.site_code = rec.value;
            f.asset_location = r.asset_auto[rec.value] ?? null;
            f.assigned_to = r.assignee_auto?.[rec.value] ?? null;
          }
        } else {
          (f as any)[q.field] = rec.value;
        }
      } else if (q.kind === "datetime") {
        if (q.default && isFullLocal(q.default) && !isFullLocal(f[q.field] as string | null)) {
          (f as any)[q.field] = q.default;
        }
      } else if (q.kind === "text") {
        if (q.default && !String(f[q.field] ?? "").trim()) (f as any)[q.field] = q.default;
      }
    }
    setImportId(view.id);
    setResult(r);
    setFields(f);
    setSelectedImages(r.images.map((i) => i.url));
    setShowErrors(false);
    haptic(Haptics.NotificationFeedbackType.Success);
    if (r.duplicate) setStep("duplicate");
    else goToQuestionsOrReview(r, f);
  };

  const readReport = async () => {
    if (!file || !siteCode) return;
    if (offline) {
      return fail(
        "You're offline",
        "You're offline. Uploading an RCA needs an internet connection.",
        true,
      );
    }
    const run = ++runRef.current;
    const alive = () => run === runRef.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFailure(null);
    setPhase("uploading");
    setStep("progress");

    // 1. The file → S3. The key's extension sets the content type.
    const key = `incidents/${siteCode}/rca/${Date.now()}_${uuidv4()}.${file.ext}`;
    let uploadedUrl: string | null = null;
    try {
      const up = await StorageService.uploadFileDetailed(key, file.uri);
      if (!alive()) return;
      uploadedUrl = up.url;
      if (!uploadedUrl) {
        if (up.permanent && up.error === "Local file unreadable") {
          return fail("Couldn't open the file", "We couldn't open this file. Please choose it again.");
        }
        return up.permanent
          ? fail("Upload failed", RCA_GENERIC_ERROR)
          : fail("Upload failed", RCA_NETWORK_ERROR, true);
      }
    } catch {
      if (!alive()) return;
      return fail("Upload failed", RCA_NETWORK_ERROR, true);
    }

    // 2. Start the read.
    setPhase("queued");
    const started = await RcaImportService.start({
      site_code: siteCode,
      file_url: uploadedUrl,
      file_name: file.name,
    });
    if (!alive()) return;
    if (!started.ok) {
      return fail(
        started.network ? "No connection" : "Couldn't start reading",
        started.error,
        started.network,
      );
    }

    // 3. Poll until it's done.
    let view = started.data;
    const deadline = Date.now() + GIVE_UP_MS;
    let misses = 0;
    while (view.status === "processing") {
      setPhase(view.stage);
      if (Date.now() > deadline) {
        return fail(
          "This is taking too long",
          "Reading this report is taking longer than usual. Please try again in a few minutes.",
          true,
        );
      }
      await sleep(POLL_MS);
      if (!alive()) return;
      const next = await RcaImportService.get(view.id);
      if (!alive()) return;
      if (!next.ok) {
        misses += 1;
        if (next.network && misses < POLL_MISSES) continue;
        return fail(
          next.network ? "No connection" : "Something went wrong",
          next.error,
          next.network,
        );
      }
      misses = 0;
      view = next.data;
    }

    if ((view.status === "ready" || view.status === "completed") && view.result) {
      setPhase("done");
      // Let the last tick of the stepper land before moving on.
      await sleep(350);
      if (!alive()) return;
      applyResult(view);
      return;
    }
    if (view.status === "rejected") {
      return fail("This file can't be used", view.error_message || RCA_GENERIC_ERROR);
    }
    return fail("We couldn't read this report", view.error_message || RCA_GENERIC_ERROR);
  };

  const pickFile = async () => {
    if (offline) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: RCA_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset) return;
      const checked = checkRcaFile(asset);
      if (!checked.ok) {
        setFile(null);
        setFileError(checked.error);
        haptic(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      setFile(checked.file);
      setFileError(null);
    } catch {
      setFileError("We couldn't open the file picker. Please try again.");
    }
  };

  /* ── duplicate ──────────────────────────────────────────────────────── */

  const viewDuplicate = async () => {
    const dup = result?.duplicate;
    if (!dup || dupBusy) return;
    setDupBusy(true);
    const res = await RcaImportService.getIncident(dup.id);
    setDupBusy(false);
    runRef.current += 1;
    onClose();
    if (res.ok && res.data) onViewIncident(res.data);
  };

  /* ── create ─────────────────────────────────────────────────────────── */

  const errors = useMemo(() => (fields ? validateRcaFields(fields) : {}), [fields]);
  const firstError = FIELD_ORDER.map((k) => errors[k]).find(Boolean) ?? null;

  const createIncident = async () => {
    if (!fields || !result || !importId || creatingRef.current) return;
    if (firstError) {
      setShowErrors(true);
      haptic(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    const payload: RcaCreateFields = {
      ...fields,
      fault_symptom: fields.fault_symptom.trim(),
      asset_location: (fields.asset_location ?? "").trim() || null,
      incident_created_time: localToIso(fields.incident_created_time)!,
      incident_updated_time: localToIso(fields.incident_updated_time),
      incident_resolved_time:
        fields.status === "Resolved" ? localToIso(fields.incident_resolved_time) : null,
    };
    const keep = new Set(selectedImages);
    const res = await RcaImportService.create(importId, {
      fields: payload,
      image_urls: result.images.map((i) => i.url).filter((u) => keep.has(u)),
    });
    creatingRef.current = false;
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.error);
      haptic(Haptics.NotificationFeedbackType.Error);
      return;
    }
    haptic(Haptics.NotificationFeedbackType.Success);
    setCreated(res.data);
    setStep("success");
    onCreated(res.data);
  };

  /* ── closing ────────────────────────────────────────────────────────── */

  const close = useCallback(() => {
    runRef.current += 1;
    onClose();
  }, [onClose]);

  const requestClose = () => {
    if (step === "questions" || step === "review") {
      Alert.alert("Discard this upload?", "The details read from the report will be lost.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: close },
      ]);
      return;
    }
    close();
  };

  const tryAnother = () => {
    runRef.current += 1;
    setFile(null);
    setFileError(null);
    setFailure(null);
    setStep("upload");
  };

  /* ── render ─────────────────────────────────────────────────────────── */

  const subtitle =
    step === "upload"
      ? "We'll fill in the incident for you"
      : step === "progress"
        ? "Reading the report…"
        : step === "questions"
          ? "A few quick questions"
          : step === "review"
            ? "Check the details, then create"
            : step === "duplicate"
              ? "Already used"
              : step === "success"
                ? "All done"
                : undefined;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === "upload") {
    body = (
      <UploadStep
        siteCode={siteCode}
        onSiteChange={setSiteCode}
        siteOptions={siteOptions}
        file={file}
        fileError={fileError}
        offline={offline}
        onPick={pickFile}
        onRemove={() => {
          setFile(null);
          setFileError(null);
        }}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        primaryLabel="Read report"
        onPrimary={readReport}
        primaryDisabled={!file || !siteCode || offline}
        note={!siteCode ? "Choose the site first." : null}
      />
    );
  } else if (step === "progress") {
    body = <RcaProgress phase={phase} fileName={file?.name ?? "RCA report"} />;
    footer = (
      <FooterButtons bottomInset={insets.bottom} primaryLabel="Cancel" onPrimary={close} quiet />
    );
  } else if (step === "error" && failure) {
    body = (
      <StatusScreen
        icon={failure.retry && failure.title !== "This is taking too long" ? WifiOff : CircleAlert}
        tone="warn"
        title={failure.title}
        message={failure.message}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel={failure.retry ? "Other file" : "Close"}
        onSecondary={failure.retry ? tryAnother : close}
        primaryLabel={failure.retry ? "Try again" : "Try another file"}
        onPrimary={failure.retry ? () => void readReport() : tryAnother}
      />
    );
  } else if (step === "duplicate" && result?.duplicate) {
    body = (
      <StatusScreen
        icon={CopyCheck}
        tone="warn"
        title="Already used"
        message={`This RCA was already used for incident ${result.duplicate.incident_id}.`}
        detail="Continuing will create a second incident from the same report."
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel="View incident"
        onSecondary={viewDuplicate}
        primaryLabel="Continue anyway"
        onPrimary={() => fields && goToQuestionsOrReview(result, fields)}
        busy={dupBusy}
      />
    );
  } else if (step === "questions" && question && fields) {
    const answered = isQuestionAnswered(question, fields);
    const last = qIndex === visibleQuestions.length - 1;
    body = (
      <RcaQuestionStep
        key={question.id}
        question={question}
        index={qIndex}
        count={visibleQuestions.length}
        fields={fields}
        setField={setField}
        assetCandidates={candidates}
        personCandidates={personCandidates}
        peopleOptions={assigneeOptions}
        assetSearchOptions={assetResults}
        assetsLoading={assetsLoading}
        assetSearch={assetSearch}
        onAssetSearch={setAssetSearch}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel={qIndex > 0 ? "Back" : undefined}
        onSecondary={qIndex > 0 ? prevQuestion : undefined}
        primaryLabel={last ? "Review details" : "Next"}
        onPrimary={nextQuestion}
        primaryDisabled={question.required && !answered}
        tertiaryLabel={!question.required ? "Skip this question" : undefined}
        onTertiary={!question.required ? nextQuestion : undefined}
      />
    );
  } else if (step === "review" && result && fields) {
    body = (
      <RcaReviewStep
        result={result}
        fields={fields}
        setField={setField}
        errors={errors}
        showErrors={showErrors}
        siteOptions={siteOptions}
        assetOptions={reviewAssetOptions}
        assetsLoading={assetsLoading}
        assetSearch={assetSearch}
        onAssetSearch={setAssetSearch}
        assigneeOptions={reviewAssigneeOptions}
        selectedImages={selectedImages}
        onToggleImage={(url) =>
          setSelectedImages((prev) =>
            prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
          )
        }
        onSetAllImages={(all) => setSelectedImages(all ? result.images.map((i) => i.url) : [])}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel={visibleQuestions.length ? "Back" : undefined}
        onSecondary={
          visibleQuestions.length
            ? () => {
                setQuestionId(visibleQuestions[visibleQuestions.length - 1]!.id);
                setStep("questions");
              }
            : undefined
        }
        primaryLabel="Create incident"
        onPrimary={createIncident}
        busy={creating}
        note={createError || (showErrors ? firstError : null)}
      />
    );
  } else if (step === "success" && created) {
    const photos = result
      ? result.images.filter((i) => selectedImages.includes(i.url)).length
      : 0;
    body = (
      <StatusScreen
        icon={CircleCheck}
        tone="ok"
        title="Incident created"
        badge={created.incident_id}
        message="Your RCA report has been turned into an incident."
        lines={[
          { icon: Paperclip, text: "RCA report saved to the RCA attachments" },
          ...(photos
            ? [{ icon: ImageIcon, text: `${photos} ${photos === 1 ? "photo" : "photos"} attached` }]
            : []),
          ...(result?.rca_status_on_create === "RCA Under Review"
            ? [{ icon: RefreshCw, text: "A manager will review the RCA" }]
            : []),
        ]}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel="View incident"
        onSecondary={() => {
          const inc = created;
          close();
          onViewIncident(inc);
        }}
        primaryLabel="Done"
        onPrimary={close}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={requestClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
        <DetailHeader
          topInset={insets.top}
          title="Upload RCA report"
          subtitle={subtitle}
          onBack={requestClose}
        />
        {/* keyboard-controller's KAV, not RN's — see IncidentDetailModal. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {body}
          {footer}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Upload step ─────────────────────────────────────────────────────────── */

function UploadStep({
  siteCode,
  onSiteChange,
  siteOptions,
  file,
  fileError,
  offline,
  onPick,
  onRemove,
}: {
  siteCode: string;
  onSiteChange: (v: string) => void;
  siteOptions: SelectOption[];
  file: PickedRcaFile | null;
  fileError: string | null;
  offline: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  const ds = useDs();
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Sparkles size={20} color={ds.flame[100]} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.introTitle}>Let us fill it in</Text>
          <Text style={styles.introText}>
            Upload the RCA report. We&apos;ll read it, ask about anything unclear, and you check
            everything before the incident is created.
          </Text>
        </View>
      </View>

      <DetailCard style={{ padding: 16 }}>
        <FullscreenPicker
          label="Site *"
          placeholder="Select site"
          options={siteOptions}
          value={siteCode}
          onChange={onSiteChange}
        />

        <Text style={styles.label}>
          <RequiredMark label="RCA report *" />
        </Text>
        {file ? (
          <View style={styles.fileChip}>
            <View style={styles.fileIcon}>
              {file.kind === "photo" ? (
                <ImageIcon size={20} color={ds.sky[100]} strokeWidth={2} />
              ) : (
                <FileText size={20} color={ds.sky[100]} strokeWidth={2} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.fileName} numberOfLines={2}>
                {file.name}
              </Text>
              <Text style={styles.fileMeta}>
                {[FILE_KIND_LABEL[file.kind], formatBytes(file.size)].filter(Boolean).join(" · ")}
              </Text>
              <TouchableOpacity
                onPress={onPick}
                hitSlop={8}
                style={{ alignSelf: "flex-start", marginTop: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Choose a different file"
              >
                <Text style={styles.link}>Choose a different file</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={onRemove}
              hitSlop={10}
              style={styles.removeBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${file.name}`}
            >
              <X size={16} color={ds.carbon[400]} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        ) : (
          <PressableScale
            onPress={onPick}
            disabled={offline}
            scaleTo={0.98}
            style={[styles.drop, offline && { opacity: 0.55 }, !!fileError && { borderColor: ds.flame[100] }]}
            accessibilityRole="button"
            accessibilityLabel="Choose file"
            accessibilityState={{ disabled: offline }}
          >
            <View style={styles.dropIcon}>
              <CloudUpload size={26} color={ds.sky[100]} strokeWidth={2} />
            </View>
            <Text style={styles.dropTitle}>Choose file</Text>
            <Text style={styles.dropSub}>Tap to pick the RCA report from your phone</Text>
          </PressableScale>
        )}
        <InlineError text={fileError} style={{ marginTop: 10 }} />
        <Text style={styles.hint}>PDF, Word, PowerPoint or a photo · up to 15 MB</Text>
      </DetailCard>

      {offline ? (
        <Notice icon={WifiOff} tone="warn" style={{ marginBottom: 12 }}>
          You&apos;re offline. Uploading an RCA needs an internet connection.
        </Notice>
      ) : null}

      <View style={styles.howRow}>
        {["Upload the report", "Answer a few questions", "Check & create"].map((t, i) => (
          <View key={t} style={styles.howItem}>
            <View style={styles.howNum}>
              <Text style={styles.howNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.howText}>{t}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/* ── Centered status screens (error, duplicate, success) ─────────────────── */

function StatusScreen({
  icon: Icon,
  tone,
  title,
  message,
  detail,
  badge,
  lines,
}: {
  icon: typeof CircleAlert;
  tone: "ok" | "warn";
  title: string;
  message: string;
  detail?: string;
  badge?: string;
  lines?: { icon: typeof CircleAlert; text: string }[];
}) {
  const ds = useDs();
  const styles = useStyles();
  const ok = tone === "ok";
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.statusBody}>
      <View
        style={[styles.statusIcon, { backgroundColor: ok ? ds.sky[1000] : ds.flame[1000] }]}
      >
        <Icon size={36} color={ok ? ds.sky[100] : ds.flame[100]} strokeWidth={2} />
      </View>
      <Text style={styles.statusTitle} accessibilityRole="header">
        {title}
      </Text>
      {badge ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.statusMessage}>{message}</Text>
      {detail ? <Text style={styles.statusDetail}>{detail}</Text> : null}
      {lines?.length ? (
        <DetailCard style={{ alignSelf: "stretch", marginTop: 22, paddingVertical: 4 }}>
          {lines.map((l, i) => {
            const LineIcon = l.icon;
            return (
              <View key={l.text} style={[styles.statusLine, i > 0 && styles.statusLineDivider]}>
                <LineIcon size={16} color={ds.carbon[400]} strokeWidth={2} />
                <Text style={styles.statusLineText}>{l.text}</Text>
              </View>
            );
          })}
        </DetailCard>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 },

  intro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ds.flame[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: { fontSize: 16, fontWeight: "700", color: ds.carbon[100] },
  introText: { fontSize: 13, lineHeight: 19, color: ds.carbon[500], marginTop: 3 },

  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 8,
  },
  drop: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 170,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: soRadius.card,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: ds.carbon[800],
    backgroundColor: ds.field,
  },
  dropIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ds.sky[1000],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  dropTitle: { fontSize: 16, fontWeight: "700", color: ds.carbon[100] },
  dropSub: { fontSize: 12.5, color: ds.carbon[500], marginTop: 4, textAlign: "center" },
  hint: { fontSize: 12, color: ds.carbon[500], marginTop: 10 },

  fileChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: soRadius.card,
    borderWidth: 1.5,
    borderColor: ds.controlOn,
    backgroundColor: ds.sky[1000],
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: soRadius.sm,
    backgroundColor: ds.white,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 14, fontWeight: "600", color: ds.carbon[100] },
  fileMeta: { fontSize: 12, color: ds.carbon[500], marginTop: 2 },
  link: { fontSize: 12.5, fontWeight: "600", color: ds.sky[100] },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ds.white,
    alignItems: "center",
    justifyContent: "center",
  },

  howRow: { flexDirection: "row", gap: 8, marginTop: 4, paddingHorizontal: 2 },
  howItem: { flex: 1, alignItems: "center", gap: 6 },
  howNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  howNumText: { fontSize: 11.5, fontWeight: "700", color: ds.carbon[400] },
  howText: { fontSize: 11.5, lineHeight: 15, color: ds.carbon[500], textAlign: "center" },

  statusBody: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  statusIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  statusTitle: { fontSize: 21, fontWeight: "700", color: ds.carbon[100], textAlign: "center" },
  statusBadge: {
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
  },
  statusBadgeText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.4, color: ds.carbon[200] },
  statusMessage: {
    fontSize: 14.5,
    lineHeight: 21,
    color: ds.carbon[300],
    textAlign: "center",
    marginTop: 10,
  },
  statusDetail: {
    fontSize: 13,
    lineHeight: 19,
    color: ds.carbon[500],
    textAlign: "center",
    marginTop: 8,
  },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  statusLineDivider: { borderTopWidth: 1, borderTopColor: ds.carbon[1000] },
  statusLineText: { flex: 1, fontSize: 13.5, color: ds.carbon[200] },
}));
