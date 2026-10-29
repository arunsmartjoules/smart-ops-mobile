/**
 * "Create RCA" → write an RCA in the app, modelled on a past one, and let the
 * server build the document and raise the incident.
 *
 *   site ─► past RCA ─► reading ─► incident questions ─► sections ─► review ─► done
 *
 * Online-only, like the RCA upload: the template is read by the server, the
 * text is polished by the server and the PDF is built there, so nothing is put
 * on the offline queue. Answers live in this component, so Back never loses
 * them, a failed photo upload or create never loses them, and every async
 * reply is checked against the screen it was asked for before it is applied.
 * The create call reuses one `client_request_id` for the whole session, so a
 * retry can never raise a second incident.
 *
 * No Reanimated layout animations in here (Android dead-buttons bug inside a
 * <Modal>): the Modal slides in itself and everything inside is plain Views.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { v4 as uuidv4 } from "uuid";
import type { SelectOption } from "@/components/SearchableSelect";
import { Bx, type BxName } from "@/components/jo/Bx";
import { Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { IncHeader, IncPicker, Panel } from "./IncFields";
import { StorageService } from "@/services/StorageService";
import { TicketsService } from "@/services/TicketsService";
import { IncidentsService } from "@/services/IncidentsService";
import { RcaCreateService, type RcaCreateStart, type RcaTemplate } from "@/services/RcaCreateService";
import type { RcaFields } from "@/services/RcaImportService";
import RcaQuestionStep from "./RcaQuestionStep";
import RcaCreateTemplateStep, { type TemplateList } from "./RcaCreateTemplateStep";
import RcaCreateSectionStep, { type PickedAsset } from "./RcaCreateSectionStep";
import RcaCreateReviewStep from "./RcaCreateReviewStep";
import PolishButton from "./PolishButton";
import { FooterButtons, Notice } from "./RcaImportParts";
import {
  anyUploading,
  buildCreateFields,
  buildSectionsPayload,
  collectProblems,
  emptyAnswer,
  initialFields,
  isSectionBlank,
  isSectionRequired,
  photoKey,
  planPhotoAdds,
  sectionProblem,
  totalPhotoCount,
  uploadedPhotos,
  type AnswerMap,
  type PhotoItem,
  type SectionAnswer,
} from "./rcaCreateLib";
import { isQuestionAnswered, isQuestionVisible } from "./rcaImportLib";

type Step =
  | "site"
  | "template"
  | "reading"
  | "readError"
  | "questions"
  | "sections"
  | "review"
  | "success";

/**
 * Mount with a new `key` for every open (see the incidents tab) so each RCA
 * starts from a clean slate — and gets its own client_request_id.
 */
interface Props {
  visible: boolean;
  /** The site selected on the incidents screen — the default. */
  defaultSiteCode: string;
  siteOptions: SelectOption[];
  isConnected: boolean | null;
  onClose: () => void;
  /** Called once the incident exists — refresh the list. */
  onCreated: (incident: any) => void;
  /** Open the new incident. */
  onViewIncident: (incident: any) => void;
}

const OFFLINE_MESSAGE = "You're offline. Creating an RCA needs an internet connection.";
const haptic = (t: Haptics.NotificationFeedbackType) => Haptics.notificationAsync(t).catch(() => {});

export default function RcaCreateModal({
  visible,
  defaultSiteCode,
  siteOptions,
  isConnected,
  onClose,
  onCreated,
  onViewIncident,
}: Props) {
  const t = useJoTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const offline = isConnected === false;

  const [step, setStep] = useState<Step>("site");
  const [siteCode, setSiteCode] = useState(defaultSiteCode);
  const [templates, setTemplates] = useState<TemplateList>({ status: "loading" });
  const [choice, setChoice] = useState<{ url: string | null; name: string | null }>({ url: null, name: null });
  const [failure, setFailure] = useState<{ message: string; network: boolean } | null>(null);
  const [started, setStarted] = useState<{ key: string; data: RcaCreateStart } | null>(null);
  const [fields, setFields] = useState<RcaFields | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  /** Jumped here from the review: finishing goes straight back to it. */
  const [fromReview, setFromReview] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<any | null>(null);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<SelectOption[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<SelectOption[]>([]);

  /** One id for the whole wizard session — every create retry carries it. */
  const [clientRequestId] = useState(() => uuidv4());
  /** Bumped to abandon an in-flight start (back, cancel, close, unmount). */
  const startRunRef = useRef(0);
  const templatesRunRef = useRef(0);
  const templatesSiteRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startRunRef.current += 1;
      templatesRunRef.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!visible) {
      startRunRef.current += 1;
      templatesRunRef.current += 1;
    }
  }, [visible]);

  const result = started?.data.result ?? null;
  const sections = useMemo(() => started?.data.sections ?? [], [started]);
  const fieldSite = siteCode;
  const inForm = step === "questions" || step === "review";

  /* ── details fields ─────────────────────────────────────────────────── */

  const setField = useCallback(<K extends keyof RcaFields>(field: K, value: RcaFields[K]) => {
    setFields((prev) => (prev ? { ...prev, [field]: value } : prev));
    setCreateError(null);
  }, []);

  // Assets for the chosen site — remote search, debounced (same as the upload flow).
  useEffect(() => {
    if (!inForm || !fieldSite) return;
    let stale = false;
    const timer = setTimeout(
      async () => {
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
      },
      assetSearch ? 300 : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
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
  const editableFields = useMemo(
    () => new Set<keyof RcaFields>(visibleQuestions.map((q) => q.field)),
    [visibleQuestions],
  );

  const candidates = useMemo(() => result?.asset_options?.[fieldSite] ?? [], [result, fieldSite]);
  const personCandidates = useMemo(() => result?.assignee_options?.[fieldSite] ?? [], [result, fieldSite]);

  const goToSections = () => {
    setSectionIndex(0);
    setStep("sections");
  };

  const nextQuestion = () => {
    if (fromReview) {
      setFromReview(false);
      setStep("review");
      return;
    }
    const next = visibleQuestions[qIndex + 1];
    if (next) setQuestionId(next.id);
    else goToSections();
  };
  const prevQuestion = () => {
    const prev = visibleQuestions[qIndex - 1];
    if (prev) setQuestionId(prev.id);
    else setStep("template");
  };

  /* ── sections ───────────────────────────────────────────────────────── */

  const section = sections[sectionIndex] ?? null;
  const answerOf = (id: string): SectionAnswer => answers[id] ?? emptyAnswer();

  const setAnswerText = useCallback((id: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyAnswer()), text } }));
    setCreateError(null);
  }, []);

  /** Updates one photo by id; a photo that was removed meanwhile is simply not found. */
  const patchPhoto = useCallback((sectionId: string, photoId: string, patch: Partial<PhotoItem>) => {
    setAnswers((prev) => {
      const a = prev[sectionId];
      if (!a || !a.photos.some((p) => p.id === photoId)) return prev;
      return {
        ...prev,
        [sectionId]: { ...a, photos: a.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) },
      };
    });
  }, []);

  const uploadPhoto = useCallback(
    async (sectionId: string, photo: { id: string; localUri: string; ext: "jpg" | "png" }) => {
      patchPhoto(sectionId, photo.id, { status: "uploading" });
      let url: string | null = null;
      try {
        const up = await StorageService.uploadFileDetailed(
          photoKey(siteCode, uuidv4(), photo.ext),
          photo.localUri,
        );
        url = up.url;
      } catch {
        url = null;
      }
      if (!mountedRef.current) return;
      patchPhoto(sectionId, photo.id, url ? { status: "done", url } : { status: "failed" });
    },
    [patchPhoto, siteCode],
  );

  const addPhotos = (sectionId: string, assets: PickedAsset[]): string[] => {
    const plan = planPhotoAdds(assets, answerOf(sectionId).photos.length, totalPhotoCount(answers));
    if (plan.accepted.length) {
      const items: PhotoItem[] = plan.accepted.map((a) => ({
        id: uuidv4(),
        localUri: a.uri,
        ext: a.ext,
        url: null,
        caption: "",
        status: "uploading",
      }));
      setAnswers((prev) => {
        const cur = prev[sectionId] ?? emptyAnswer();
        return { ...prev, [sectionId]: { ...cur, photos: [...cur.photos, ...items] } };
      });
      setCreateError(null);
      items.forEach((p) => void uploadPhoto(sectionId, p));
    }
    if (plan.messages.length) haptic(Haptics.NotificationFeedbackType.Warning);
    return plan.messages;
  };

  const sectionStepProblem = section ? sectionProblem(section, answers[section.id]) : null;
  // "Please answer X" on an untouched required section is shown by the Required
  // tag; the footer only speaks up for things the person has to act on.
  const sectionNote =
    section && sectionStepProblem && !(isSectionRequired(section) && isSectionBlank(answers[section.id]))
      ? sectionStepProblem
      : null;

  const nextSection = () => {
    if (!section || sectionStepProblem) return;
    if (fromReview) {
      setFromReview(false);
      setStep("review");
      return;
    }
    if (sectionIndex < sections.length - 1) setSectionIndex(sectionIndex + 1);
    else setStep("review");
  };
  const prevSection = () => {
    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1);
      return;
    }
    const last = visibleQuestions[visibleQuestions.length - 1];
    if (last) {
      setQuestionId(last.id);
      setStep("questions");
    } else {
      setStep("template");
    }
  };

  /* ── templates + reading ────────────────────────────────────────────── */

  const loadTemplates = useCallback(async (site: string) => {
    const run = ++templatesRunRef.current;
    templatesSiteRef.current = site;
    setTemplates({ status: "loading" });
    const res = await RcaCreateService.templates(site);
    if (run !== templatesRunRef.current || !mountedRef.current) return;
    if (!res.ok) {
      templatesSiteRef.current = null;
      setTemplates({ status: "error", message: res.error });
      return;
    }
    const items = Array.isArray(res.data?.templates) ? res.data.templates : [];
    setTemplates({ status: "ready", items });
  }, []);

  const goToTemplates = () => {
    if (!siteCode || offline) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep("template");
    if (templatesSiteRef.current !== siteCode || templates.status !== "ready") void loadTemplates(siteCode);
  };

  const startReading = async (url: string | null, name: string | null) => {
    if (!siteCode) return;
    const key = `${siteCode}|${url ?? ""}`;
    setChoice({ url, name });
    // Same site and template as the answers already in progress: keep them.
    if (started && started.key === key && fields) {
      const first = visibleQuestions[0];
      if (first) {
        setQuestionId(first.id);
        setStep("questions");
      } else {
        goToSections();
      }
      return;
    }
    if (offline) {
      setFailure({ message: OFFLINE_MESSAGE, network: true });
      setStep("readError");
      return;
    }
    const run = ++startRunRef.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFailure(null);
    setStep("reading");
    const res = await RcaCreateService.start({ site_code: siteCode, ...(url ? { template_url: url } : {}) });
    if (run !== startRunRef.current || !mountedRef.current) return;
    if (!res.ok) {
      haptic(Haptics.NotificationFeedbackType.Error);
      setFailure({ message: res.error, network: res.network });
      setStep("readError");
      return;
    }
    const data = res.data;
    if (!data || !Array.isArray(data.sections) || data.sections.length === 0 || !data.result?.questions) {
      haptic(Haptics.NotificationFeedbackType.Error);
      setFailure({ message: "Something went wrong. Please try again.", network: false });
      setStep("readError");
      return;
    }
    const f0 = initialFields(data.result, siteCode);
    setStarted({ key, data });
    setFields(f0);
    setAnswers({});
    setShowProblems(false);
    setCreateError(null);
    setFromReview(false);
    setAssetSearch("");
    haptic(Haptics.NotificationFeedbackType.Success);
    const first = data.result.questions.find((q) => isQuestionVisible(q, f0));
    if (first) {
      setQuestionId(first.id);
      setStep("questions");
    } else {
      setSectionIndex(0);
      setStep("sections");
    }
  };

  const pickTemplate = (tpl: RcaTemplate) => void startReading(tpl.file_url, tpl.file_name);

  /* ── review + create ────────────────────────────────────────────────── */

  const problems = useMemo(
    () => (fields ? collectProblems(fields, sections, answers) : []),
    [fields, sections, answers],
  );
  const uploading = anyUploading(answers);
  const firstProblem = problems[0]?.message ?? (uploading ? "Please wait for the photos to finish uploading." : null);

  const editField = (field: keyof RcaFields) => {
    const q = visibleQuestions.find((x) => x.field === field);
    if (!q) return;
    setQuestionId(q.id);
    setFromReview(true);
    setStep("questions");
  };
  const editSection = (id: string) => {
    const i = sections.findIndex((s) => s.id === id);
    if (i < 0) return;
    setSectionIndex(i);
    setFromReview(true);
    setStep("sections");
  };

  const createRca = async () => {
    if (!fields || !started || creatingRef.current) return;
    if (offline) {
      setCreateError(OFFLINE_MESSAGE);
      haptic(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (firstProblem) {
      setShowProblems(true);
      haptic(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    const res = await RcaCreateService.create({
      client_request_id: clientRequestId,
      fields: buildCreateFields(fields),
      sections: buildSectionsPayload(sections, answers),
    });
    creatingRef.current = false;
    if (mountedRef.current) setCreating(false);
    if (!res.ok) {
      // Answers are all still here: the person fixes the message and retries.
      if (mountedRef.current) setCreateError(res.error);
      haptic(Haptics.NotificationFeedbackType.Error);
      return;
    }
    haptic(Haptics.NotificationFeedbackType.Success);
    onCreated(res.data);
    if (!mountedRef.current) return;
    setCreated(res.data);
    setStep("success");
  };

  /* ── closing ────────────────────────────────────────────────────────── */

  const close = useCallback(() => {
    startRunRef.current += 1;
    templatesRunRef.current += 1;
    onClose();
  }, [onClose]);

  const requestClose = () => {
    if (creating) return; // the request is already on its way — let it finish
    const hasWork = step === "questions" || step === "sections" || step === "review";
    if (hasWork) {
      Alert.alert("Discard this RCA?", "Your answers and photos will be lost.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: close },
      ]);
      return;
    }
    close();
  };

  /* ── render ─────────────────────────────────────────────────────────── */

  const subtitle =
    step === "site"
      ? "Based on a past RCA"
      : step === "template"
        ? "Choose what to follow"
        : step === "reading" || step === "readError"
          ? "Reading the RCA…"
          : step === "questions"
            ? "Incident details"
            : step === "sections"
              ? "The RCA"
              : step === "review"
                ? "Check the details, then create"
                : step === "success"
                  ? "All done"
                  : undefined;

  const siteLabel = siteOptions.find((o) => o.value === siteCode)?.label ?? siteCode;
  const assigneeLabel = fields?.assigned_to
    ? (assigneeOptions.find((o) => o.value === fields.assigned_to)?.label ?? "Selected person")
    : "";

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === "site") {
    body = (
      <SiteStep siteCode={siteCode} onSiteChange={setSiteCode} siteOptions={siteOptions} offline={offline} />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        primaryLabel="Continue"
        onPrimary={goToTemplates}
        primaryDisabled={!siteCode || offline}
        note={!siteCode ? "Choose the site first." : null}
      />
    );
  } else if (step === "template") {
    body = (
      <RcaCreateTemplateStep
        list={templates}
        offline={offline}
        hasAnswers={!!started}
        onPick={pickTemplate}
        onStandard={() => void startReading(null, null)}
        onRetry={() => void loadTemplates(siteCode)}
      />
    );
    footer = <FooterButtons bottomInset={insets.bottom} primaryLabel="Back" onPrimary={() => setStep("site")} quiet />;
  } else if (step === "reading") {
    body = <ReadingScreen name={choice.name} />;
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        primaryLabel="Cancel"
        onPrimary={() => {
          startRunRef.current += 1;
          setStep("template");
        }}
        quiet
      />
    );
  } else if (step === "readError" && failure) {
    body = (
      <StatusScreen
        icon={failure.network ? "bx-wifi-off" : "bx-error-circle"}
        tone="warn"
        title={failure.network ? "No connection" : "Couldn't read this RCA"}
        message={failure.message}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel="Pick another"
        onSecondary={() => setStep("template")}
        primaryLabel="Try again"
        onPrimary={() => void startReading(choice.url, choice.name)}
        tertiaryLabel={choice.url ? "Use standard sections" : undefined}
        onTertiary={choice.url ? () => void startReading(null, null) : undefined}
      />
    );
  } else if (step === "questions" && question && fields && result) {
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
        renderTextAccessory={({ value, setValue }) => (
          <PolishButton value={value} onChange={setValue} offline={offline} />
        )}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel={fromReview ? undefined : "Back"}
        onSecondary={fromReview ? undefined : prevQuestion}
        primaryLabel={fromReview ? "Back to review" : last ? "Next: the RCA" : "Next"}
        onPrimary={nextQuestion}
        primaryDisabled={question.required && !answered}
        tertiaryLabel={!question.required && !fromReview ? "Skip this question" : undefined}
        onTertiary={!question.required && !fromReview ? nextQuestion : undefined}
      />
    );
  } else if (step === "sections" && section) {
    const skip = !isSectionRequired(section) && isSectionBlank(answers[section.id]);
    const last = sectionIndex === sections.length - 1;
    body = (
      <RcaCreateSectionStep
        key={section.id}
        section={section}
        index={sectionIndex}
        count={sections.length}
        answer={answerOf(section.id)}
        totalPhotos={totalPhotoCount(answers)}
        offline={offline}
        onText={(text) => setAnswerText(section.id, text)}
        onPhotosPicked={(assets) => addPhotos(section.id, assets)}
        onCaption={(id, caption) => patchPhoto(section.id, id, { caption })}
        onRemovePhoto={(id) =>
          setAnswers((prev) => {
            const a = prev[section.id];
            if (!a) return prev;
            return { ...prev, [section.id]: { ...a, photos: a.photos.filter((p) => p.id !== id) } };
          })
        }
        onRetryPhoto={(id) => {
          const p = answerOf(section.id).photos.find((x) => x.id === id);
          if (p) void uploadPhoto(section.id, p);
        }}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel={fromReview ? undefined : "Back"}
        onSecondary={fromReview ? undefined : prevSection}
        primaryLabel={fromReview ? "Back to review" : skip ? "Skip this section" : last ? "Review" : "Next"}
        onPrimary={nextSection}
        primaryDisabled={!!sectionStepProblem}
        note={sectionNote}
      />
    );
  } else if (step === "review" && fields) {
    body = (
      <RcaCreateReviewStep
        fields={fields}
        siteLabel={siteLabel}
        assigneeLabel={assigneeLabel}
        sections={sections}
        answers={answers}
        problems={problems}
        showProblems={showProblems}
        serverError={createError}
        editableFields={editableFields}
        onEditField={editField}
        onEditSection={editSection}
      />
    );
    footer = (
      <>
        {creating ? (
          <View style={styles.buildingBar}>
            <Notice icon="bx-time-five" tone="info">
              Building the RCA… this can take up to a minute. Please keep this screen open.
            </Notice>
          </View>
        ) : null}
        <FooterButtons
          bottomInset={insets.bottom}
          secondaryLabel="Back"
          onSecondary={() => {
            setSectionIndex(Math.max(0, sections.length - 1));
            setStep("sections");
          }}
          primaryLabel="Create RCA & incident"
          onPrimary={() => void createRca()}
          busy={creating}
          primaryDisabled={uploading}
          note={createError ? null : showProblems ? firstProblem : null}
        />
      </>
    );
  } else if (step === "success" && created) {
    const photos = sections.reduce((n, s) => n + uploadedPhotos(answers[s.id]).length, 0);
    body = <SuccessScreen incident={created} photos={photos} />;
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel="Done"
        onSecondary={close}
        primaryLabel="View incident"
        onPrimary={() => {
          const inc = created;
          close();
          onViewIncident(inc);
        }}
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
      <View style={{ flex: 1, backgroundColor: t.page }}>
        <IncHeader title="Create RCA" subtitle={subtitle} onBack={requestClose} backIcon="bx-x" />
        {/* keyboard-controller's KAV, not RN's — see IncidentDetailModal. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {body}
          {footer}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Site step ───────────────────────────────────────────────────────────── */

function SiteStep({
  siteCode,
  onSiteChange,
  siteOptions,
  offline,
}: {
  siteCode: string;
  onSiteChange: (v: string) => void;
  siteOptions: SelectOption[];
  offline: boolean;
}) {
  const t = useJoTheme();
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
          <Bx name="bx-edit" size={20} color={t.accentInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.introTitle}>Write the RCA here</Text>
          <Text style={styles.introText}>
            Follow a past RCA. We&apos;ll ask about the incident, then walk you through each section —
            with photos if you like. We build the document and raise the incident for you.
          </Text>
        </View>
      </View>

      <Panel style={{ marginTop: 6 }}>
        <IncPicker
          label="Site"
          required
          placeholder="Select site"
          options={siteOptions}
          value={siteCode}
          onChange={onSiteChange}
          searchPlaceholder="Search sites"
          style={{ marginTop: 0 }}
        />
      </Panel>

      {offline ? (
        <Notice icon="bx-wifi-off" tone="warn" style={{ marginTop: 10 }}>
          {OFFLINE_MESSAGE}
        </Notice>
      ) : null}
    </ScrollView>
  );
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

function ReadingScreen({ name }: { name: string | null }) {
  const t = useJoTheme();
  const styles = useStyles();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.statusBody}>
      <View style={[styles.statusIcon, { backgroundColor: t.accentTint }]}>
        <ActivityIndicator size="large" color={t.accentInk} />
      </View>
      <Text style={styles.statusTitle} accessibilityRole="header" accessibilityLiveRegion="polite">
        {name ? "Reading the RCA…" : "Getting ready…"}
      </Text>
      {name ? (
        <View style={styles.fileRow}>
          <Bx name="bx-file" size={14} color={t.muted} />
          <Text style={styles.fileName} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ) : null}
      <Text style={styles.statusMessage}>
        {name
          ? "We're picking out its sections so you can answer them one by one. The first time can take up to a minute."
          : "Setting up the standard sections."}
      </Text>
    </ScrollView>
  );
}

/* ── Centered status screens (error, success) ────────────────────────────── */

function StatusScreen({
  icon,
  tone,
  title,
  message,
}: {
  icon: BxName;
  tone: "ok" | "warn";
  title: string;
  message: string;
}) {
  const t = useJoTheme();
  const styles = useStyles();
  const ok = tone === "ok";
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.statusBody}>
      <View style={[styles.statusIcon, { backgroundColor: ok ? t.okTint : t.warnTint }]}>
        <Bx name={icon} size={38} color={ok ? t.ok : t.warn} />
      </View>
      <Text style={styles.statusTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.statusMessage}>{message}</Text>
    </ScrollView>
  );
}

function SuccessScreen({ incident, photos }: { incident: any; photos: number }) {
  const t = useJoTheme();
  const styles = useStyles();
  const [openError, setOpenError] = useState<string | null>(null);
  const rcaUrl: string | null = typeof incident?.rca_url === "string" && incident.rca_url ? incident.rca_url : null;

  const openRca = async () => {
    if (!rcaUrl) return;
    setOpenError(null);
    try {
      await Linking.openURL(rcaUrl);
    } catch {
      setOpenError("We couldn't open the RCA document. You can find it on the incident.");
    }
  };

  const lines: { icon: BxName; text: string }[] = [
    { icon: "bx-paperclip", text: "RCA document attached to the incident" },
    ...(photos ? [{ icon: "bx-image" as BxName, text: `${photos} ${photos === 1 ? "photo" : "photos"} included` }] : []),
  ];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.statusBody}>
      <View style={[styles.statusIcon, { backgroundColor: t.okTint }]}>
        <Bx name="bx-check-circle" size={38} color={t.ok} />
      </View>
      <Text style={styles.statusTitle} accessibilityRole="header">
        Incident created
      </Text>
      {incident?.incident_id ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{incident.incident_id}</Text>
        </View>
      ) : null}
      <Text style={styles.statusMessage}>Your RCA has been built and the incident raised.</Text>
      <Card style={{ alignSelf: "stretch", marginTop: 22, paddingVertical: 4, paddingHorizontal: 16 }}>
        {lines.map((l, i) => (
          <View key={l.text} style={[styles.statusLine, i > 0 && styles.statusLineDivider]}>
            <Bx name={l.icon} size={17} color={t.muted} />
            <Text style={styles.statusLineText}>{l.text}</Text>
          </View>
        ))}
      </Card>
      {rcaUrl ? (
        <TouchableOpacity
          onPress={() => void openRca()}
          activeOpacity={0.85}
          style={styles.openBtn}
          accessibilityRole="link"
          accessibilityLabel="Open the RCA document"
        >
          <Bx name="bxs-file-pdf" size={19} color={t.accentInk} />
          <Text style={styles.openBtnText}>Open the RCA (PDF)</Text>
          <Bx name="bx-link-external" size={16} color={t.accentInk} />
        </TouchableOpacity>
      ) : null}
      {openError ? <Text style={[styles.statusDetail, { color: t.bad }]}>{openError}</Text> : null}
    </ScrollView>
  );
}

const useStyles = makeJoStyles((t) => ({
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  buildingBar: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: t.page },

  intro: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 6, paddingHorizontal: 4 },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: { ...f.t(15, 600), color: t.ink },
  introText: { ...f.t(13), lineHeight: 19, color: t.muted, marginTop: 3 },

  fileRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, maxWidth: "90%" },
  fileName: { ...f.t(12.5), color: t.muted, flexShrink: 1 },

  statusBody: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
  statusTitle: { ...f.d(24, -0.02), color: t.ink, textAlign: "center" },
  statusBadge: {
    marginTop: 10,
    height: 26,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: t.raised,
  },
  statusBadgeText: { ...f.m(12.5, 600), color: t.ink2 },
  statusMessage: { ...f.t(14.5), lineHeight: 21, color: t.ink2, textAlign: "center", marginTop: 10 },
  statusDetail: { ...f.t(13), lineHeight: 19, color: t.muted, textAlign: "center", marginTop: 8 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  statusLineDivider: { borderTopWidth: 1, borderTopColor: t.line },
  statusLineText: { ...f.t(13.5), flex: 1, color: t.ink2 },

  openBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    marginTop: 16,
    paddingHorizontal: 16,
    borderRadius: 27,
    backgroundColor: t.accentTint,
    borderWidth: 1,
    borderColor: t.accent,
  },
  openBtnText: { ...f.t(14.5, 600), color: t.accentInk },
}));
