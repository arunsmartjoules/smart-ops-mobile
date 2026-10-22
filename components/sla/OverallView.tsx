/**
 * SLA › Overall: accent rating hero, four KPI cards, the KPI dashboard with
 * its weight/target cells, the month-on-month trend and the fee bands.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ChevronRight, Maximize2 } from "@/components/jo/bxIcons";
import { GlossFill, Card, HeroCard, ProgressBar, capsStyle, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { toneFg } from "@/constants/jo";
import type { SlaCategoryKey, SlaReport } from "@/services/SlaService";
import { FrozenTable, type FrozenRow } from "./parts";
import {
  CATEGORY_META,
  applicableCategories,
  bandTone,
  catColor,
  clampPct,
  fmtPct,
  fmtScore,
  feeLabel,
  fmtTarget,
  monthLabel,
  monthShortLabel,
  onBlackTone,
  ratingTone,
  ratio,
} from "./lib";

export interface TrendPoint {
  monthKey: string;
  report: SlaReport | null;
}

export function OverallView({
  report,
  trend,
  onOpenRating,
  onPickCategory,
}: {
  report: SlaReport;
  trend: TrendPoint[];
  onOpenRating: () => void;
  onPickCategory: (key: SlaCategoryKey) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const cats = applicableCategories(report);
  const ratingPct = report.totals.performanceRating * 100;
  const mLabel = monthLabel(report.period.monthKey);
  const target = fmtScore(report.totals.targetScore);

  return (
    <View>
      {/* ── Rating hero ── */}
      <HeroCard
        rings={1}
        onPress={onOpenRating}
        accessibilityLabel={`Performance rating ${fmtPct(report.totals.performanceRating)} percent, ${report.band.label}. Open calculation breakup`}
        style={s.hero}
      >
        <View style={s.rowBetween}>
          <Text style={[capsStyle(12, 0.04), s.onAccentDim]} numberOfLines={1}>
            Performance rating · {mLabel}
          </Text>
          <View style={s.heroExpand}>
            <Maximize2 size={15} color={t.onAccent} />
          </View>
        </View>
        <View style={s.heroBig}>
          <Text style={[f.d(48, -0.045), { color: t.onAccent }]}>{fmtPct(report.totals.performanceRating)}%</Text>
          <Text style={[f.t(13, 600), s.onAccentDim]}>
            {fmtScore(report.totals.achievedScore)} / {target}
          </Text>
        </View>
        <View style={s.heroTrack}>
          <View style={[s.heroFill, { width: `${clampPct(ratingPct)}%` }]}>
            <GlossFill color={t.onAccent} radius={3} />
          </View>
        </View>
        <View style={s.heroBandRow}>
          <View style={s.heroBandPill}>
            <GlossFill color={t.onAccent} fg={onBlackTone(ratingTone(ratingPct))} radius={12} />
            <Text style={[f.t(11.5, 600), { color: onBlackTone(ratingTone(ratingPct)) }]} numberOfLines={1}>
              {report.band.label}
            </Text>
          </View>
          <Text style={[f.t(11.5, 500), { color: t.onAccent, opacity: 0.75, flex: 1 }]} numberOfLines={2}>
            {feeLabel(report.band.feeImplication)}
          </Text>
        </View>
      </HeroCard>

      {/* ── KPI cards ── */}
      <View style={s.grid}>
        {cats.map((c) => {
          const meta = CATEGORY_META[c.category];
          const color = catColor(t, c.category);
          const frac = ratio(c.achievedScore, c.targetScore);
          const Icon = meta.icon;
          return (
            <Card
              key={c.category}
              radius={20}
              style={s.kpiCard}
              onPress={() => onPickCategory(c.category)}
              accessibilityLabel={`${meta.label} ${fmtPct(frac)} percent`}
            >
              <View style={s.rowIcon}>
                <Icon size={15} color={color} />
                <Text style={[f.t(11.5), { color: t.ink3, flexShrink: 1 }]} numberOfLines={1}>
                  {meta.label}
                </Text>
              </View>
              <View style={s.kpiNums}>
                <Text style={[f.d(24, -0.03, 1.1), { color }]}>{fmtPct(frac)}%</Text>
                <Text style={[f.t(11), { color: t.muted }]}>
                  {fmtScore(c.achievedScore)}/{trimTarget(c.targetScore)}
                </Text>
              </View>
              <ProgressBar pct={frac * 100} color={color} height={4} style={{ marginTop: 9 }} />
            </Card>
          );
        })}
      </View>

      {/* ── KPI dashboard ── */}
      <Card style={s.dash}>
        <View style={[s.rowBaseline, { paddingHorizontal: 2 }]}>
          <Text style={[f.t(15, 600), { color: t.ink }]}>Overall KPI dashboard</Text>
          <Text style={[f.t(11.5), { color: t.muted }]}>{mLabel}</Text>
        </View>
        {cats.map((c, i) => {
          const meta = CATEGORY_META[c.category];
          const color = catColor(t, c.category);
          const Icon = meta.icon;
          const cells: { l: string; v: string; c?: string }[] = [
            { l: "Weight", v: c.weight.toFixed(2) },
            { l: "Target", v: fmtTarget(c.targetScore) },
            { l: "Wtd target", v: c.weightedTarget.toFixed(2) },
            { l: "Achieved", v: fmtScore(c.achievedScore), c: color },
            { l: "Wtd ach.", v: c.weightedAchieved.toFixed(2) },
          ];
          return (
            <TouchableOpacity
              key={c.category}
              onPress={() => onPickCategory(c.category)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${meta.label}, ${fmtPct(ratio(c.achievedScore, c.targetScore))} percent`}
              style={[s.dashRow, i > 0 ? s.dashRowDivider : s.dashRowFirst]}
            >
              <View style={s.rowIcon8}>
                <Icon size={16} color={color} />
                <Text style={[f.t(13.5, 600), { color: t.ink, flex: 1 }]} numberOfLines={1}>
                  {meta.label}
                </Text>
                <Text style={[f.d(17, -0.01, 1.15), { color }]}>
                  {fmtPct(ratio(c.achievedScore, c.targetScore))}%
                </Text>
                <ChevronRight size={18} color={t.faint} />
              </View>
              <View style={s.cells}>
                {cells.map((cell) => (
                  <View key={cell.l} style={s.cell}>
                    <Text style={[f.t(9.5), { color: t.muted }]} numberOfLines={1}>
                      {cell.l}
                    </Text>
                    <Text style={[f.t(12.5, 600), { color: cell.c ?? t.ink, marginTop: 2 }]} numberOfLines={1}>
                      {cell.v}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={s.dashFoot}>
          <Text style={[f.t(13, 600), { color: t.accentInk }]}>Overall score</Text>
          <Text style={[f.t(13), { color: t.ink3, flexShrink: 1, textAlign: "right" }]}>
            Σ weighted achieved{" "}
            <Text style={[f.t(13, 700), { color: t.ink }]}>{fmtScore(report.totals.achievedScore)}</Text> of {target}
          </Text>
        </View>
      </Card>

      {/* ── Month-on-month trend ── */}
      <TrendCard report={report} trend={trend} />

      {/* ── Fee bands ── */}
      <Card style={s.bands}>
        <Text style={[f.t(15, 600), { color: t.ink, paddingHorizontal: 2 }]}>Performance implications</Text>
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 3, paddingHorizontal: 2 }]}>
          JouleCOOL Agreement, Schedule 3
        </Text>
        <View style={{ gap: 6, marginTop: 12 }}>
          {report.implications.map((b) => {
            const cur = b.level === report.band.level;
            return (
              <View
                key={b.level}
                style={[s.band, cur ? { backgroundColor: t.accentTint, borderColor: t.accent } : null]}
                accessibilityLabel={`${b.label}, ${b.range}, ${b.feeImplication}${cur ? ", current" : ""}`}
              >
                <View style={[s.bandDot, { backgroundColor: toneFg(t, bandTone(b.level)) }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.rowIcon}>
                    <Text style={[f.t(13, 600), { color: t.ink }]}>{b.label}</Text>
                    <Text style={[f.t(11.5), { color: t.muted }]}>{b.range}</Text>
                  </View>
                  <Text style={[f.t(11.5), { color: t.ink3, marginTop: 2 }]}>{feeLabel(b.feeImplication)}</Text>
                </View>
                {cur ? (
                  <View style={s.currentPill}>
                    <GlossFill color={t.accent} fg={t.onAccent} radius={11} />
                    <Text style={[f.t(11, 700), { color: t.onAccent }]}>Current</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

/** 5 → "5", 4.5 → "4.5" (the "/5" after a KPI score). */
function trimTarget(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toFixed(2))) : "—";
}

const TREND_LEFT = 118;
const TREND_COL = 84;

function TrendCard({ report, trend }: { report: SlaReport; trend: TrendPoint[] }) {
  const t = useJoTheme();
  const s = useStyles();
  const cur = report.period.monthKey;
  const cats = applicableCategories(report);

  const cellsFor = (pick: (r: SlaReport) => { score: number; frac: number } | null) =>
    trend.map((p) => {
      const isCur = p.monthKey === cur;
      const v = p.report ? pick(p.report) : null;
      return (
        <View key={p.monthKey} style={[s.trendCell, isCur ? { backgroundColor: t.line } : null]}>
          <Text style={[f.t(12.5, isCur ? 700 : 500), { color: t.ink }]}>{v ? fmtScore(v.score) : "—"}</Text>
          <Text style={[f.t(10.5), { color: t.muted, marginTop: 1 }]}>{v ? `${fmtPct(v.frac)}%` : ""}</Text>
        </View>
      );
    });

  const rows: FrozenRow[] = cats.map((c) => ({
    key: c.category,
    left: (
      <Text style={[f.t(12, 600), s.trendLabel, { color: catColor(t, c.category) }]} numberOfLines={2}>
        {CATEGORY_META[c.category].label}
      </Text>
    ),
    right: (
      <View style={{ flexDirection: "row" }}>
        {cellsFor((r) => {
          const tc = r.categories.find((x) => x.category === c.category);
          return tc && tc.applicable !== false ? { score: tc.achievedScore, frac: ratio(tc.achievedScore, tc.targetScore) } : null;
        })}
      </View>
    ),
  }));
  rows.push({
    key: "overall",
    left: (
      <Text style={[f.t(12, 600), s.trendLabel, { color: t.accentInk }]} numberOfLines={1}>
        Overall
      </Text>
    ),
    right: (
      <View style={{ flexDirection: "row" }}>
        {cellsFor((r) => ({ score: r.totals.achievedScore, frac: r.totals.performanceRating }))}
      </View>
    ),
  });

  return (
    <Card style={s.trend}>
      <View style={[s.rowBaseline, { paddingHorizontal: 16 }]}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Month-on-month trend</Text>
        <Text style={[f.t(11.5), { color: t.muted }]}>Score / %</Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <FrozenTable
          startAtEnd
          leftWidth={TREND_LEFT}
          headerHeight={22}
          rowHeight={48}
          headerBg={t.card}
          bodyBg={t.card}
          rowBorder={t.line}
          headerLeft={<Text style={[f.t(10.5), { color: t.muted, paddingLeft: 16 }]}>KPI</Text>}
          headerRight={trend.map((p) => {
            const isCur = p.monthKey === cur;
            return (
              <View key={p.monthKey} style={s.trendHead}>
                <Text style={[f.t(10.5, isCur ? 700 : 500), { color: isCur ? t.ink : t.muted, textAlign: "right" }]}>
                  {monthShortLabel(p.monthKey)}
                </Text>
              </View>
            );
          })}
          rows={rows}
        />
      </View>
    </Card>
  );
}

const useStyles = makeJoStyles((t) => ({
  hero: { paddingVertical: 15, paddingHorizontal: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowBaseline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  rowIcon: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  rowIcon8: { flexDirection: "row", alignItems: "center", gap: 8 },
  onAccentDim: { color: t.onAccent, opacity: 0.7, flexShrink: 1 },
  heroExpand: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.heroRing,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBig: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  heroTrack: { height: 6, borderRadius: 3, backgroundColor: t.heroDivider, marginTop: 12, overflow: "hidden" },
  heroFill: { height: "100%", borderRadius: 3, backgroundColor: t.onAccent },
  heroBandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  heroBandPill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    // Near-black in both modes (text on the accent) — the artboard's #0A0A0C.
    backgroundColor: t.onAccent,
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  kpiCard: { flexBasis: "47%", flexGrow: 1, paddingVertical: 12, paddingHorizontal: 13 },
  kpiNums: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 9 },
  dash: { marginTop: 10, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 8 },
  dashRow: { paddingVertical: 12, paddingHorizontal: 2 },
  dashRowFirst: { marginTop: 6 },
  dashRowDivider: { borderTopWidth: 1, borderTopColor: t.line },
  cells: { flexDirection: "row", gap: 4, marginTop: 9 },
  cell: { flex: 1, minWidth: 0, borderRadius: 10, backgroundColor: t.raised, paddingVertical: 6, paddingHorizontal: 7 },
  dashFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 2,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: t.lineMid,
  },
  trend: { marginTop: 10, paddingTop: 16, paddingBottom: 12 },
  trendHead: { width: TREND_COL, paddingHorizontal: 8, justifyContent: "flex-start" },
  trendCell: { width: TREND_COL, paddingVertical: 8, paddingHorizontal: 8, alignItems: "flex-end", justifyContent: "center" },
  trendLabel: { paddingLeft: 16, paddingRight: 6 },
  bands: { marginTop: 10, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 8 },
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: "transparent",
  },
  bandDot: { width: 8, height: 8, borderRadius: 4 },
  currentPill: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: t.accent,
    justifyContent: "center",
  },
}));
