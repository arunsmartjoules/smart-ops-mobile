/**
 * SLA › one KPI category: score card, weight / meeting-commitment tiles, and
 * a card per deliverable (commit, weight, actual, score, bar with commit tick).
 */
import React from "react";
import { Text, View } from "react-native";
import { MousePointerClick } from "@/components/jo/bxIcons";
import { Card, capsStyle, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { toneBg, toneFg } from "@/constants/jo";
import type { SlaCategory, SlaReport } from "@/services/SlaService";
import { TintPill } from "./parts";
import {
  CATEGORY_META,
  catColor,
  clampPct,
  deliverableStatusLabel,
  deliverableTone,
  fmtPct,
  fmtScore,
  fmtTarget,
  numPct,
  ratio,
  sourceModuleOf,
} from "./lib";

export function KpiView({
  report,
  category,
  numberOf,
  onOpenDrill,
}: {
  report: SlaReport;
  category: SlaCategory;
  numberOf: (key: string) => number;
  onOpenDrill: (key: string) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const meta = CATEGORY_META[category.category];
  const color = catColor(t, category.category);
  const Icon = meta.icon;
  const n = category.deliverables.length;
  const meeting = category.deliverables.filter((d) => d.actualPct >= d.commitmentPct).length;
  // The KPI score is a weighted average only when the site's template opts in
  // (backend slaCalculator: weightedScoring ? weightedAverage : averageScore).
  const weighted = report.template?.weightedScoring === true;

  return (
    <View>
      <Card radius={24} style={s.head}>
        <View style={s.rowIcon}>
          <View style={s.iconWell}>
            <Icon size={17} color={color} />
          </View>
          <Text style={[capsStyle(12, 0.04), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
            {meta.label} KPI score
          </Text>
        </View>
        <View style={s.big}>
          <Text style={[f.d(44, -0.045), { color }]}>{fmtScore(category.achievedScore)}</Text>
          <Text style={[f.t(13), { color: t.ink3 }]} numberOfLines={1}>
            / {fmtTarget(category.targetScore)} · {fmtPct(ratio(category.achievedScore, category.targetScore))}%
          </Text>
        </View>
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 6 }]}>
          {weighted ? "Weighted average" : "Average"} of {n} deliverable score{n === 1 ? "" : "s"}
        </Text>
        <View style={s.tiles}>
          <View style={s.tile}>
            <Text style={[f.t(11), { color: t.muted }]}>Weight in overall SLA</Text>
            <Text style={[f.d(20, -0.02, 1.15), { color: t.ink, marginTop: 3 }]}>{numPct(category.weight)}%</Text>
            <Text style={[f.t(10.5), { color: t.muted, marginTop: 2 }]}>
              Contributes {category.weightedAchieved.toFixed(2)} of {category.weightedTarget.toFixed(2)}
            </Text>
          </View>
          <View style={s.tile}>
            <Text style={[f.t(11), { color: t.muted }]}>Meeting commitment</Text>
            <Text style={[f.d(20, -0.02, 1.15), { color: t.ok, marginTop: 3 }]}>
              {meeting} <Text style={[f.t(12), { color: t.muted }]}>of {n}</Text>
            </Text>
            <Text style={[f.t(10.5), { color: t.muted, marginTop: 2 }]}>Actual % ≥ Commit %</Text>
          </View>
        </View>
      </Card>

      <View style={s.hint}>
        <MousePointerClick size={14} color={t.muted} />
        <Text style={[f.t(11.5), { color: t.muted, flex: 1 }]}>
          Tap a deliverable to see how its Actual % was calculated, with source records
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        {category.deliverables.map((d) => {
          const tone = deliverableTone(d.actualPct, d.commitmentPct);
          const dc = toneFg(t, tone);
          return (
            <Card
              key={d.key}
              radius={22}
              onPress={() => onOpenDrill(d.key)}
              accessibilityLabel={`Deliverable ${numberOf(d.key)}, ${d.deliverable}, actual ${fmtPct(d.actualPct)} percent, ${deliverableStatusLabel(d.actualPct, d.commitmentPct)}`}
              style={[s.deliv, tone === "bad" ? { borderColor: t.badBorder } : null]}
            >
              <View style={s.delivTop}>
                <View style={s.noPill}>
                  <Text style={[f.t(11, 700), { color: t.ink3 }]}>#{numberOf(d.key)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[f.t(14, 600), { color: t.ink, lineHeight: 18 }]}>
                    {d.deliverable}{" "}
                    <Text style={[f.t(11.5), { color: t.muted }]}>({sourceModuleOf(d)})</Text>
                  </Text>
                  {d.commitment ? (
                    <Text style={[f.t(11.5), { color: t.muted, lineHeight: 16, marginTop: 4 }]}>{d.commitment}</Text>
                  ) : null}
                </View>
                <TintPill label={deliverableStatusLabel(d.actualPct, d.commitmentPct)} fg={dc} bg={toneBg(t, tone)} />
              </View>
              {d.unit ? (
                <Text style={[f.t(11.5), { color: t.ink3, lineHeight: 16, marginTop: 8, paddingLeft: 38 }]}>{d.unit}</Text>
              ) : null}
              <View style={s.stats}>
                <Stat label="Commit" value={`${numPct(d.commitmentPct)}%`} />
                <Stat label="Weight" value={`${numPct(d.weight)}%`} />
                <Stat label="Actual" value={`${fmtPct(d.actualPct)}%`} color={dc} bold />
                <Stat label="Score" value={fmtScore(d.actualScore)} color={dc} bold />
              </View>
              <View style={s.bar}>
                <View style={[s.barFill, { width: `${clampPct(d.actualPct * 100)}%`, backgroundColor: dc }]} />
                <View style={[s.commitTick, { left: `${Math.min(99, clampPct(d.commitmentPct * 100))}%` }]} />
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

function Stat({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  const t = useJoTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[f.t(10), { color: t.muted }]}>{label}</Text>
      <Text style={[f.t(13, bold ? 700 : 600), { color: color ?? t.ink, marginTop: 2 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  head: { paddingVertical: 15, paddingHorizontal: 16 },
  rowIcon: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  big: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 10 },
  tiles: { flexDirection: "row", gap: 6, marginTop: 12 },
  tile: { flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: t.raised, paddingVertical: 10, paddingHorizontal: 12 },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 14, paddingHorizontal: 6, paddingBottom: 8 },
  deliv: { padding: 14 },
  delivTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noPill: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  stats: { flexDirection: "row", gap: 4, marginTop: 10, paddingLeft: 38 },
  bar: { height: 5, borderRadius: 3, backgroundColor: t.track, marginTop: 11, marginLeft: 38 },
  barFill: { height: "100%", borderRadius: 3 },
  commitTick: { position: "absolute", top: -3, width: 2, height: 11, borderRadius: 1, backgroundColor: t.ink },
}));
