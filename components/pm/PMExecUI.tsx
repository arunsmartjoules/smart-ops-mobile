/**
 * PM execution chrome — artboard `r_pmExec` (app.dc.html 664–703):
 * back button · asset + "PM · asset type" · 48px progress ring; dashed
 * before/after photo slots; the offline notice; and the accent
 * "Complete & Sign" CTA floating over a fade at the bottom.
 *
 * Presentation only — every handler comes from app/pm-execution.tsx.
 */
import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx, type BxName } from "@/components/jo/Bx";
import { GlossFill, IconButton, Ring, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import SignaturePad from "@/components/SignaturePad";
import SmartJoulesWordmark from "@/components/SmartJoulesWordmark";

const useStyles = makeJoStyles((t) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { ...f.t(15, 600), color: t.ink },
  headSub: { ...f.t(11.5), color: t.muted, marginTop: 2 },
  ringText: { ...f.t(11.5, 700), color: t.ink },
  slots: { flexDirection: "row", gap: 8 },
  slot: {
    flex: 1,
    height: 76,
    borderRadius: 20,
    backgroundColor: t.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.lineStrong,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  slotLabel: { ...f.t(12.5, 600), color: t.ink },
  slotTag: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: t.card,
  },
  slotTagText: { ...f.t(11, 600), color: t.ink },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  bannerText: { ...f.t(12), flex: 1, lineHeight: 16.5 },
  cfm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
  },
  cfmLabel: { ...f.t(12), color: t.muted, flex: 1 },
  cfmValue: { ...f.t(13, 600), color: t.ink },
  hint: {
    ...f.t(11.5),
    color: t.muted,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 17.25,
    paddingHorizontal: 8,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    zIndex: 5,
  },
  cta: {
    height: 54,
    borderRadius: 27,
    backgroundColor: t.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { ...f.t(15, 700), color: t.onAccent },
  blocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    alignSelf: "center",
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.badTint,
  },
  blockedText: { ...f.t(12, 600), color: t.bad },
  status: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: 27,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusText: { ...f.t(13.5, 600), flexShrink: 1, textAlign: "center" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    marginHorizontal: 8,
    height: "86%",
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
    borderRadius: 38,
    paddingTop: 12,
    overflow: "hidden",
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.handle,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
  },
  sheetTitle: { ...f.d(22, -0.02), color: t.ink },
  sheetSub: { ...f.t(12.5), color: t.muted, marginTop: 4 },
  counters: { flexDirection: "row", gap: 6, marginTop: 14, paddingHorizontal: 20 },
  counter: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
  },
  counterValue: { ...f.d(22, -0.03) },
  counterLabel: { ...f.t(11), color: t.ink3, marginTop: 4 },
  pad: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 20,
    overflow: "hidden",
  },
  saving: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.input,
    opacity: 0.96,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  savingText: { ...f.t(14, 600), color: t.ink, marginTop: 12 },
  previewBg: { flex: 1, backgroundColor: t.page, alignItems: "center", justifyContent: "center" },
  previewImg: { width: "92%", height: "80%" },
  previewClose: { position: "absolute", right: 16 },
}));

/* ── Header ───────────────────────────────────────────────────────────── */

export function PMExecHeader({
  title,
  sub,
  answered,
  total,
  onBack,
}: {
  title: string;
  sub: string;
  answered: number;
  total: number;
  onBack: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <View style={s.header}>
      <IconButton icon="bx-chevron-left" iconSize={24} label="Go back" onPress={onBack} />
      <View style={s.headText}>
        {/* The title is usually the asset path — let it wrap to a second line. */}
        <Text style={s.headTitle} numberOfLines={2}>
          {title}
        </Text>
        {sub ? (
          <Text style={s.headSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${answered} of ${total} tasks answered`}
      >
        <Ring size={48} stroke={5} radius={20} pct={total > 0 ? answered / total : 0} color={t.accent}>
          <Text style={s.ringText}>
            {answered}/{total}
          </Text>
        </Ring>
      </View>
    </View>
  );
}

/* ── Before / after photo slots ───────────────────────────────────────── */

export function EvidenceSlot({
  label,
  uri,
  required,
  missing,
  highlight,
  onPress,
  onImageError,
}: {
  label: string;
  uri?: string | null;
  required?: boolean;
  /** Completion was attempted without it. */
  missing?: boolean;
  /** The next photo to take — its camera icon takes the accent. */
  highlight?: boolean;
  onPress: () => void;
  onImageError?: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  // Still on-device: saved, waiting for signal to upload.
  const queued = !!uri && !/^https?:/i.test(uri);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        s.slot,
        uri ? { borderStyle: "solid", borderColor: t.cardBorder } : null,
        missing ? { borderStyle: "solid", borderColor: t.bad } : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}${required ? ", required" : ""}. ${uri ? "Tap to preview or retake" : "Tap to take photo"}`}
    >
      {uri ? (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={onImageError}
          />
          <View style={s.slotTag}>
            {queued ? (
              <Bx name="bx-time-five" size={13} color={t.warn} />
            ) : (
              <Bx name="bx-check" size={14} color={t.ok} />
            )}
            <Text style={s.slotTagText}>
              {label}
              {queued ? " · Queued" : ""}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Bx
            name="bx-camera"
            size={20}
            color={missing ? t.bad : highlight ? t.accentInk : t.muted}
          />
          <Text style={[s.slotLabel, missing && { color: t.bad }]}>
            {label}
            {required ? <Text style={{ color: t.bad }}> *</Text> : null}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function EvidenceRow({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  return <View style={s.slots}>{children}</View>;
}

/* ── Inline notices ───────────────────────────────────────────────────── */

export function ExecBanner({
  icon,
  text,
  tone,
}: {
  icon: BxName;
  text: string;
  tone: "warn" | "mute" | "ok";
}) {
  const t = useJoTheme();
  const s = useStyles();
  const fg = tone === "warn" ? t.warn : tone === "ok" ? t.ok : t.ink2;
  const bg = tone === "warn" ? t.warnTint : tone === "ok" ? t.okTint : t.muteTint;
  return (
    <View style={[s.banner, { backgroundColor: bg, borderColor: bg }]} accessibilityRole="alert">
      <Bx name={icon} size={17} color={fg} />
      <Text style={[s.bannerText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** Commissioning airflow for the asset — only rendered when on record. */
export function CfmRow({ value }: { value: string }) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <View style={s.cfm}>
      <Bx name="bx-wind" size={17} color={t.info} />
      <Text style={s.cfmLabel}>Commissioning airflow</Text>
      <Text style={s.cfmValue}>{value} CFM</Text>
    </View>
  );
}

export function ExecHint({ text }: { text: string }) {
  const s = useStyles();
  return <Text style={s.hint}>{text}</Text>;
}

/* ── Bottom action area ───────────────────────────────────────────────── */

/** Fade + bottom padding shared by the CTA and the status bars. */
function FooterShell({ children }: { children: React.ReactNode }) {
  const t = useJoTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // #RRGGBB + "00" — the page colour at zero alpha, so the fade is token-built.
  const clear = /^#[0-9a-f]{6}$/i.test(t.page) ? `${t.page}00` : "transparent";
  return (
    <View
      style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}
      pointerEvents="box-none"
    >
      <LinearGradient
        pointerEvents="none"
        colors={[clear, t.page]}
        locations={[0, 0.34]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

export function CompleteFooter({
  ready,
  blockedMessage,
  onPress,
}: {
  ready: boolean;
  blockedMessage: string;
  onPress: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <FooterShell>
      {blockedMessage ? (
        <View style={s.blocked} accessibilityLiveRegion="polite">
          <Bx name="bx-error-circle" size={15} color={t.bad} />
          <Text style={s.blockedText}>{blockedMessage}</Text>
        </View>
      ) : null}
      {/* Stays pressable while not ready: a tap scrolls to the first task that
          still needs attention instead of doing nothing. */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[s.cta, !ready && { opacity: 0.55 }]}
        accessibilityRole="button"
        accessibilityLabel="Complete and sign"
        accessibilityHint={ready ? undefined : "Shows what is still missing"}
      >
        <GlossFill color={t.accent} fg={t.onAccent} radius={27} glow={12} />
        <Bx name="bx-pen" size={19} color={t.onAccent} />
        <Text style={s.ctaText}>Complete &amp; Sign</Text>
      </TouchableOpacity>
    </FooterShell>
  );
}

export function StatusFooter({
  icon,
  text,
  tone,
}: {
  icon: BxName;
  text: string;
  tone: "ok" | "mute";
}) {
  const t = useJoTheme();
  const s = useStyles();
  const fg = tone === "ok" ? t.ok : t.ink2;
  return (
    <FooterShell>
      <View style={[s.status, { backgroundColor: tone === "ok" ? t.okTint : t.raised }]}>
        <Bx name={icon} size={19} color={fg} />
        <Text style={[s.statusText, { color: fg }]}>{text}</Text>
      </View>
    </FooterShell>
  );
}

/* ── Signature sheet ──────────────────────────────────────────────────── */

export function SignatureSheet({
  visible,
  onClose,
  onSign,
  saving,
  doneCount,
  notDoneCount,
  photoCount,
}: {
  visible: boolean;
  onClose: () => void;
  onSign: (signature: string) => void;
  saving: boolean;
  doneCount: number;
  notDoneCount: number;
  photoCount: number;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const counters: { value: number; label: string; color: string }[] = [
    { value: doneCount, label: "Tasks done", color: t.ok },
    { value: notDoneCount, label: "Not done", color: notDoneCount ? t.bad : t.ink },
    { value: photoCount, label: "Photos", color: t.ink },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}
        onPress={saving ? undefined : onClose}
        accessibilityLabel="Close"
      />
      <View style={s.sheetWrap} pointerEvents="box-none">
        <View style={[s.sheet, { marginBottom: 8 + insets.bottom }]}>
          <View style={s.grabber} />
          <View style={s.sheetHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.sheetTitle}>Complete PM</Text>
              <Text style={s.sheetSub}>Client signature confirms the work below.</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 10 }}>
              <IconButton icon="bx-x" label="Close" size={36} iconSize={18} onPress={saving ? undefined : onClose} />
            </View>
          </View>

          <View style={s.counters}>
            {counters.map((c) => (
              <View key={c.label} style={s.counter}>
                <Text style={[s.counterValue, { color: c.color }]}>{c.value}</Text>
                <Text style={s.counterLabel} numberOfLines={1}>
                  {c.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
            <SmartJoulesWordmark width={104} />
          </View>

          <View style={s.pad}>
            <SignaturePad
              standalone
              onOK={onSign}
              description="Sign here to confirm PM completion"
              okText="Confirm & Complete"
              // SignaturePad paints its label white, so the fill must stay
              // dark in both modes — the light accents can't carry white text.
              accentColor={t.isDark ? t.raised : t.ink}
              clearVariant="outlined"
            />
          </View>

          {saving ? (
            <View style={s.saving}>
              <ActivityIndicator size="large" color={t.accent} />
              <Text style={s.savingText}>Processing completion…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ── Full-screen photo preview ────────────────────────────────────────── */

export function PhotoPreview({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.previewBg} onPress={onClose} accessibilityLabel="Close preview">
        {uri ? <Image source={{ uri }} style={s.previewImg} resizeMode="contain" /> : null}
        <View style={[s.previewClose, { top: insets.top + 12 }]}>
          <IconButton icon="bx-x" label="Close preview" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}
