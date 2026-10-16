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
import { Check, FileText, Sparkles } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { DetailCard, soRadius } from "@/components/tickets/TicketDetailUI";
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
  const ds = useDs();
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
          <Sparkles size={30} color={ds.flame[100]} strokeWidth={2} />
        </Animated.View>
        <Text style={styles.heroTitle} accessibilityRole="header">
          Reading your report
        </Text>
        <View style={styles.fileRow}>
          <FileText size={13} color={ds.carbon[500]} strokeWidth={2} />
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

      <DetailCard style={{ paddingVertical: 6 }}>
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
                  done && { backgroundColor: ds.sky[100], borderColor: ds.sky[100] },
                  now && { borderColor: ds.flame[100] },
                ]}
              >
                {done ? (
                  <Check size={14} color={ds.onAccent} strokeWidth={3} />
                ) : now ? (
                  <ActivityIndicator size="small" color={ds.flame[100]} />
                ) : (
                  <Text style={styles.stepNum}>{i + 1}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[
                    styles.stepLabel,
                    !done && !now && { color: ds.carbon[600], fontWeight: "500" },
                  ]}
                >
                  {s.label}
                </Text>
                {now ? <Text style={styles.stepSub}>{s.sub}</Text> : null}
              </View>
            </View>
          );
        })}
      </DetailCard>
      <Text style={styles.footnote}>
        You can keep this screen open — we&apos;ll show you what we found as soon as it&apos;s ready.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  body: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24 },
  hero: { alignItems: "center", marginBottom: 22 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ds.flame[1000],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: { fontSize: 20, fontWeight: "700", color: ds.carbon[100], letterSpacing: 0.2 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    maxWidth: "90%",
  },
  fileName: { fontSize: 12.5, color: ds.carbon[500], flexShrink: 1 },
  track: {
    height: 8,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: soRadius.pill, backgroundColor: ds.flame[100] },
  reassure: {
    fontSize: 12.5,
    color: ds.carbon[500],
    textAlign: "center",
    marginTop: 10,
    marginBottom: 18,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  stepDivider: { borderTopWidth: 1, borderTopColor: ds.carbon[1000] },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ds.carbon[900],
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontSize: 12, fontWeight: "700", color: ds.carbon[600] },
  stepLabel: { fontSize: 14, fontWeight: "600", color: ds.carbon[100] },
  stepSub: { fontSize: 12, color: ds.carbon[500], marginTop: 2 },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    color: ds.carbon[500],
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 12,
  },
}));
