/**
 * "Reading your report" — the friendly stepper shown while the RCA uploads
 * and the server reads it. The bar eases toward the next step while a step is
 * running, so a long AI read never looks frozen.
 */
import React, { useEffect } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Bx } from "@/components/jo/Bx";
import { Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { RcaImportStage } from "@/services/RcaImportService";

export type RcaPhase = "uploading" | RcaImportStage;

const STEPS = [
  { label: "Uploading the file", sub: "Sending it securely" },
  { label: "Checking the document", sub: "Making sure it's an RCA we can read" },
  { label: "Reading the report", sub: "Pulling out the text and photos" },
  { label: "Extracting the details", sub: "Our AI is filling in the incident" },
  { label: "Matching site & equipment", sub: "Finding the asset in JouleOps" },
] as const;

/** Where each step starts and how far the bar may creep while it runs. */
const BAR: { from: number; to: number; ms: number }[] = [
  { from: 0.03, to: 0.18, ms: 8000 },
  { from: 0.2, to: 0.32, ms: 5000 },
  { from: 0.34, to: 0.5, ms: 10000 },
  { from: 0.52, to: 0.86, ms: 45000 },
  { from: 0.88, to: 0.97, ms: 8000 },
];

export function phaseIndex(phase: RcaPhase): number {
  switch (phase) {
    case "uploading":
      return 0;
    case "queued":
    case "validating":
      return 1;
    case "reading":
      return 2;
    case "extracting":
      return 3;
    case "matching":
      return 4;
    default:
      return 5;
  }
}

export default function RcaProgress({
  phase,
  fileName,
}: {
  phase: RcaPhase;
  fileName: string;
}) {
  const styles = useStyles();
  const t = useJoTheme();
  const active = phaseIndex(phase);

  const progress = useSharedValue(0);
  useEffect(() => {
    const seg = BAR[Math.min(active, BAR.length - 1)]!;
    if (active >= BAR.length) {
      progress.value = withTiming(1, { duration: 300 });
      return;
    }
    progress.value = withSequence(
      withTiming(Math.max(progress.value, seg.from), { duration: 450, easing: Easing.out(Easing.cubic) }),
      withTiming(seg.to, { duration: seg.ms, easing: Easing.out(Easing.quad) }),
    );
  }, [active, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const current = STEPS[Math.min(active, STEPS.length - 1)]!;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Animated.View style={[styles.heroIcon, pulseStyle]}>
          <Bx name="bxs-magic-wand" size={30} color={t.accentInk} />
        </Animated.View>
        <Text style={styles.heroTitle} accessibilityRole="header">
          Reading your report
        </Text>
        <View style={styles.fileRow}>
          <Bx name="bx-file" size={14} color={t.muted} />
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${Math.min(active + 1, STEPS.length)} of ${STEPS.length}: ${current.label}`}
      >
        <Animated.View style={[styles.fill, barStyle]} />
      </View>
      <Text style={styles.reassure}>This usually takes under a minute.</Text>

      <Card style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        {STEPS.map((s, i) => {
          const done = i < active;
          const now = i === active;
          return (
            <View
              key={s.label}
              style={[styles.stepRow, i > 0 && styles.stepDivider]}
              accessibilityLabel={`${s.label}: ${done ? "done" : now ? "in progress" : "waiting"}`}
            >
              <View
                style={[
                  styles.stepIcon,
                  done && { backgroundColor: t.ok, borderColor: t.ok },
                  now && { borderColor: t.accent },
                ]}
              >
                {done ? (
                  <Bx name="bx-check" size={16} color={t.onAccent} />
                ) : now ? (
                  <ActivityIndicator size="small" color={t.accentInk} />
                ) : (
                  <Text style={styles.stepNum}>{i + 1}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[
                    styles.stepLabel,
                    !done && !now && styles.stepLabelIdle,
                  ]}
                >
                  {s.label}
                </Text>
                {now ? <Text style={styles.stepSub}>{s.sub}</Text> : null}
              </View>
            </View>
          );
        })}
      </Card>
      <Text style={styles.footnote}>
        You can keep this screen open — we&apos;ll show you what we found as soon as it&apos;s ready.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 24 },
  hero: { alignItems: "center", marginBottom: 22 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: t.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: { ...f.d(22, -0.02), color: t.ink },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    maxWidth: "90%",
  },
  fileName: { ...f.t(12.5), color: t.muted, flexShrink: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: t.track, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: t.accent },
  reassure: { ...f.t(12.5), color: t.muted, textAlign: "center", marginTop: 10, marginBottom: 18 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  stepDivider: { borderTopWidth: 1, borderTopColor: t.line },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { ...f.t(12, 700), color: t.faint },
  stepLabel: { ...f.t(14, 600), color: t.ink },
  stepLabelIdle: { ...f.t(14, 500), color: t.faint },
  stepSub: { ...f.t(12), color: t.muted, marginTop: 2 },
  footnote: { ...f.t(12), lineHeight: 17, color: t.muted, textAlign: "center", marginTop: 12, paddingHorizontal: 12 },
}));
