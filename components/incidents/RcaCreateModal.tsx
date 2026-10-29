/**
 * "Create RCA" → write an RCA in the app and let the server build the document
 * and raise the incident.
 *
 *   site ─► one form (incident details + the RCA sections) ─► done
 *
 * Online-only, like the RCA upload: the standard sections come from the
 * server, the text is polished and the recordings typed up there, and the PDF
 * is built there, so nothing is put on the offline queue. Answers live in this
 * component, so a failed photo upload or create never loses them, and every
 * async reply is checked against what it was asked for before it is applied.
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { RcaCreateService, type RcaCreateStart } from "@/services/RcaCreateService";
import type { RcaFields } from "@/services/RcaImportService";
import RcaCreateForm from "./RcaCreateForm";
import type { PickedAsset } from "./RcaCreateSectionBlock";
import { useRcaDictation } from "./useRcaDictation";
import { FooterButtons, Notice } from "./RcaImportParts";
import {
  SECTION_TEXT_MAX,
  buildCreateFields,
  buildSectionsPayload,
  collectProblems,
  emptyAnswer,
  initialFields,
  maxForField,
  photoKey,
  planPhotoAdds,
  problemAnchor,
  totalPhotoCount,
  uploadedPhotos,
  type AnswerMap,
  type PhotoItem,
} from "./rcaCreateLib";
import { isQuestionVisible } from "./rcaImportLib";

type Step = "site" | "starting" | "startError" | "form" | "success";

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
  const [startError, setStartError] = useState<string | null>(null);
  const [started, setStarted] = useState<RcaCreateStart | null>(null);
  const [fields, setFields] = useState<RcaFields | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [showProblems, setShowProblems] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<any | null>(null);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<SelectOption[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<SelectOption[]>([]);

  /** One id for the whole session — every create retry carries it. */
  const [clientRequestId] = useState(() => uuidv4());
  /** Bumped to abandon an in-flight start (back, close, unmount). */
  const startRunRef = useRef(0);
  const creatingRef = useRef(false);
  const mountedRef = useRef(true);

  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const anchorsRef = useRef(new Map<string, View>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startRunRef.current += 1;
    };
  }, []);

  const sections = useMemo(() => started?.sections ?? [], [started]);
  const result = started?.result ?? null;
  const inForm = step === "form";

  /* ── details fields ─────────────────────────────────────────────────── */

  const setField = useCallback(<K extends keyof RcaFields>(field: K, value: RcaFields[K]) => {
    setFields((prev) => (prev ? { ...prev, [field]: value } : prev));
    setCreateError(null);
  }, []);

  // Assets for the chosen site — remote search, debounced (same as the upload flow).
  useEffect(() => {
    if (!inForm || !siteCode) return;
    let stale = false;
    const timer = setTimeout(
      async () => {
        setAssetsLoading(true);
        try {
          const res = await TicketsService.getAssets(siteCode, {
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
  }, [inForm, siteCode, assetSearch]);

  // Site users for "Assigned to".
  useEffect(() => {
    if (!inForm || !siteCode) return;
    let stale = false;
    IncidentsService.getSiteUsers(siteCode)
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
  }, [inForm, siteCode]);

  const visibleQuestions = useMemo(
    () => (result && fields ? result.questions.filter((q) => isQuestionVisible(q, fields)) : []),
    [result, fields],
  );

  /* ── section answers + photos ───────────────────────────────────────── */

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
    const plan = planPhotoAdds(assets, (answers[sectionId] ?? emptyAnswer()).photos.length, totalPhotoCount(answers));
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

  /* ── dictation (one controller for the whole form) ──────────────────── */

  const fieldsRef = useRef<RcaFields | null>(null);
  const answersRef = useRef<AnswerMap>({});
  useEffect(() => {
    fieldsRef.current = fields;
    answersRef.current = answers;
  }, [fields, answers]);

  const dictation = useRcaDictation({
    siteCode,
    getValue: useCallback((id: string) => {
      if (id.startsWith("q:")) return String(fieldsRef.current?.[id.slice(2) as keyof RcaFields] ?? "");
      if (id.startsWith("s:")) return answersRef.current[id.slice(2)]?.text ?? "";
      return "";
    }, []),
    maxFor: useCallback(
      (id: string) => (id.startsWith("q:") ? maxForField(id.slice(2) as keyof RcaFields) : SECTION_TEXT_MAX),
      [],
    ),
    apply: useCallback(
      (id: string, text: string) => {
        if (id.startsWith("q:")) setField(id.slice(2) as keyof RcaFields, text as never);
        else if (id.startsWith("s:")) setAnswerText(id.slice(2), text);
      },
      [setField, setAnswerText],
    ),
  });
  const { cancelAll: cancelDictation } = dictation;

  useEffect(() => {
    if (!visible) {
      startRunRef.current += 1;
      cancelDictation();
    }
  }, [visible, cancelDictation]);

  /* ── starting the form ──────────────────────────────────────────────── */

  const startForm = async () => {
    if (!siteCode) return;
    if (offline) {
      setStartError(OFFLINE_MESSAGE);
      setStep("startError");
      return;
    }
    const run = ++startRunRef.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStartError(null);
    setStep("starting");
    const res = await RcaCreateService.start({ site_code: siteCode });
    if (run !== startRunRef.current || !mountedRef.current) return;
    const data = res.ok ? res.data : null;
    if (!res.ok || !data || !Array.isArray(data.sections) || data.sections.length === 0 || !data.result?.questions) {
      haptic(Haptics.NotificationFeedbackType.Error);
      setStartError(res.ok ? "Something went wrong. Please try again." : res.error);
      setStep("startError");
      return;
    }
    setStarted(data);
    setFields(initialFields(data.result, siteCode));
    setAnswers({});
    setShowProblems(false);
    setCreateError(null);
    setAssetSearch("");
    setStep("form");
  };

  /* ── validation + scrolling ─────────────────────────────────────────── */

  const problems = useMemo(
    () => (fields ? collectProblems(fields, sections, answers) : []),
    [fields, sections, answers],
  );
  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    if (!showProblems) return map;
    for (const p of problems) {
      const key = problemAnchor(p);
      if (!map[key]) map[key] = p.message;
    }
    return map;
  }, [problems, showProblems]);

  const anchorRef = useCallback(
    (id: string) => (node: View | null) => {
      if (node) anchorsRef.current.set(id, node);
      else anchorsRef.current.delete(id);
    },
    [],
  );
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const scrollToAnchor = useCallback((id: string) => {
    const node = anchorsRef.current.get(id);
    const sv = scrollRef.current as unknown as View | null;
    if (!node || !sv) return;
    // Window coordinates for both, so no layout bookkeeping across nested views.
    sv.measureInWindow((_x, scrollTop) => {
      node.measureInWindow((_nx, nodeTop) => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollYRef.current + (nodeTop - scrollTop) - 12),
          animated: true,
        });
      });
    });
  }, []);

  /* ── create ─────────────────────────────────────────────────────────── */

  const createRca = async () => {
    if (!fields || !started || creatingRef.current) return;
    if (offline) {
      setCreateError(OFFLINE_MESSAGE);
      haptic(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (dictation.phase !== "idle") {
      setCreateError("Please wait for the voice typing to finish, then create the RCA.");
      haptic(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setShowProblems(true);
    if (problems.length > 0) {
      haptic(Haptics.NotificationFeedbackType.Warning);
      const first = problems.find((p) => anchorsRef.current.has(problemAnchor(p)));
      if (first) scrollToAnchor(problemAnchor(first));
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
    cancelDictation();
    onClose();
  }, [onClose, cancelDictation]);

  const requestClose = () => {
    if (creating) return; // the request is already on its way — let it finish
    if (step === "form") {
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
      ? "Write it here, we build the document"
      : step === "form"
        ? "Fill in the details and the RCA"
        : step === "success"
          ? "All done"
          : undefined;

  const siteLabel = siteOptions.find((o) => o.value === siteCode)?.label ?? siteCode;

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
        onPrimary={() => void startForm()}
        primaryDisabled={!siteCode || offline}
        note={!siteCode ? "Choose the site first." : null}
      />
    );
  } else if (step === "starting") {
    body = <StartingScreen />;
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        primaryLabel="Cancel"
        onPrimary={() => {
          startRunRef.current += 1;
          setStep("site");
        }}
        quiet
      />
    );
  } else if (step === "startError") {
    const noNet = startError === OFFLINE_MESSAGE;
    body = (
      <StatusScreen
        icon={noNet ? "bx-wifi-off" : "bx-error-circle"}
        tone="warn"
        title={noNet ? "No connection" : "Couldn't get the form ready"}
        message={startError ?? "Something went wrong. Please try again."}
      />
    );
    footer = (
      <FooterButtons
        bottomInset={insets.bottom}
        secondaryLabel="Back"
        onSecondary={() => setStep("site")}
        primaryLabel="Try again"
        onPrimary={() => void startForm()}
      />
    );
  } else if (step === "form" && fields && result) {
    const shownProblems = showProblems ? problems : [];
    body = (
      <RcaCreateForm
        scrollRef={scrollRef}
        onScroll={onScroll}
        anchorRef={anchorRef}
        siteLabel={siteLabel}
        fields={fields}
        setField={setField}
        questions={visibleQuestions}
        sections={sections}
        answers={answers}
        errors={errors}
        assetSearchOptions={assetResults}
        assetsLoading={assetsLoading}
        assetSearch={assetSearch}
        onAssetSearch={setAssetSearch}
        peopleOptions={assigneeOptions}
        dictation={dictation}
        offline={offline}
        onText={setAnswerText}
        onPhotosPicked={addPhotos}
        onCaption={(sid, id, caption) => patchPhoto(sid, id, { caption })}
        onRemovePhoto={(sid, id) =>
          setAnswers((prev) => {
            const a = prev[sid];
            if (!a) return prev;
            return { ...prev, [sid]: { ...a, photos: a.photos.filter((p) => p.id !== id) } };
          })
        }
        onRetryPhoto={(sid, id) => {
          const p = (answers[sid] ?? emptyAnswer()).photos.find((x) => x.id === id);
          if (p) void uploadPhoto(sid, p);
        }}
      />
    );
    footer = (
      <View style={styles.footerWrap}>
        {shownProblems.length > 0 ? (
          <View style={[styles.summary, { backgroundColor: t.badTint }]} accessibilityLiveRegion="polite">
            <Text style={[styles.summaryTitle, { color: t.bad }]}>
              {shownProblems.length === 1 ? "1 thing needs fixing" : `${shownProblems.length} things need fixing`}
            </Text>
            {shownProblems.slice(0, 3).map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => scrollToAnchor(problemAnchor(p))}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`${p.message} Tap to go to it`}
              >
                <Text style={[styles.summaryLine, { color: t.ink2 }]} numberOfLines={2}>
                  • {p.message}
                </Text>
              </TouchableOpacity>
            ))}
            {shownProblems.length > 3 ? (
              <Text style={[styles.summaryLine, { color: t.muted }]}>+ {shownProblems.length - 3} more</Text>
            ) : null}
          </View>
        ) : null}
        {creating ? (
          <View style={styles.buildingBar}>
            <Notice icon="bx-time-five" tone="info">
              Building the RCA… this can take up to a minute. Please keep this screen open.
            </Notice>
          </View>
        ) : null}
        <FooterButtons
          bottomInset={insets.bottom}
          primaryLabel="Create RCA & incident"
          onPrimary={() => void createRca()}
          busy={creating}
          note={createError}
        />
      </View>
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
            Fill in the incident details and each section of the RCA — with photos and voice typing
            if you like. We build the document and raise the incident for you.
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

/* ── Starting ────────────────────────────────────────────────────────────── */

function StartingScreen() {
  const t = useJoTheme();
  const styles = useStyles();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.statusBody}>
      <View style={[styles.statusIcon, { backgroundColor: t.accentTint }]}>
        <ActivityIndicator size="large" color={t.accentInk} />
      </View>
      <Text style={styles.statusTitle} accessibilityRole="header" accessibilityLiveRegion="polite">
        Getting the form ready…
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
  footerWrap: { backgroundColor: t.page },
  summary: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 18 },
  summaryTitle: { ...f.t(13, 700), marginBottom: 4 },
  summaryLine: { ...f.t(12.5, 500), lineHeight: 18, paddingVertical: 2 },

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
