/**
 * SLA › rating calculation breakup for one site + month: rating / score /
 * fee level, each KPI's contribution (expandable to its deliverables), the
 * step-by-step arithmetic, and the raw-data CSV.
 */
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { Building2, ChevronDown, ChevronUp, Download, Receipt } from "lucide-react-native";
import { Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { toneFg } from "@/constants/jo";
import type { SlaReport } from "@/services/SlaService";
import { SubHeader } from "./parts";
import {
  CATEGORY_META,
  applicableCategories,
  catColor,
  fmtPct,
  fmtScore,
  fmtTarget,
  monthLabel,
  numPct,
  ratingTone,
  sourceModuleOf,
} from "./lib";

export function RatingView({
  report,
  siteName,
  siteCode,
  monthKey,
  onBack,
  onOpenDrill,
  onDownload,
  downloading,
}: {
  report: SlaReport;
  siteName: string;
  siteCode: string;
  monthKey: string;
  onBack: () => void;
  /** Null when the deliverable can't be opened from here. */
  onOpenDrill: ((key: string) => void) | null;
  onDownload: () => void;
  downloading: boolean;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const mLabel = monthLabel(monthKey);
  const ratingPct = report.totals.performanceRating * 100;
  const bandColor = toneFg(t, ratingTone(ratingPct));
  const cats = applicableCategories(report);
  const target = fmtTarget(report.totals.targetScore);
  const achieved = fmtScore(report.totals.achievedScore);

  // Same wording as web RatingBreakupModal; the KPI line follows the
  // template's scoring mode (backend slaCalculator).
  const weighted = report.template?.weightedScoring === true;
  const steps: { text: string; accent?: boolean }[] = [
    { text: "Each deliverable Score = 5.0 × ( Actual% ÷ Commit% ), capped at 5.0" },
    {
      text: weighted
        ? "KPI Score = weighted average of that KPI's deliverable scores"
        : "KPI Score = average of that KPI's deliverable scores",
    },
    { text: `Overall Score = weighted sum of the ${cats.length} KPI scores  =  ${achieved} / ${target}`, accent: true },
    {
      text: `Performance Rating = ( ${achieved} ÷ ${fmtScore(report.totals.targetScore)} ) × 100  =  ${fmtPct(report.totals.performanceRating)}%`,
      accent: true,
    },
    {
      text: `Fee Level = ${report.band.label} (${report.band.range})  →  ${report.band.feeImplication}`,
      accent: true,
    },
  ];

  return (
    <Animated.View entering={FadeInRight.duration(220)} style={{ flex: 1 }}>
      <SubHeader title="Calculation breakup" sub={`Performance rating · ${mLabel}`} onBack={onBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 16, paddingBottom: 24 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Building2 size={17} color={t.accentInk} />
          <Text style={[f.d(22, -0.02, 1.15), { color: t.ink, flex: 1 }]} numberOfLines={2}>
            {siteName}
          </Text>
        </View>
        <Text style={[f.m(11.5), { color: t.muted, marginTop: 3 }]}>
          {siteCode} · {mLabel}
        </Text>

        <View style={s.tiles}>
          <View style={[s.tile, { backgroundColor: t.accent }]}>
            <Text style={[f.t(11, 500), { color: t.onAccent, opacity: 0.7 }]}>Performance rating</Text>
            <Text style={[f.d(28, -0.03, 1.1), { color: t.onAccent, marginTop: 5 }]}>
              {fmtPct(report.totals.performanceRating)}%
            </Text>
          </View>
          <View style={[s.tile, s.cardTile]}>
            <Text style={[f.t(11), { color: t.muted }]}>Overall score</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 5 }}>
              <Text style={[f.d(28, -0.03, 1.1), { color: t.ink }]}>{achieved}</Text>
              <Text style={[f.t(12), { color: t.muted }]}>/ {target}</Text>
            </View>
          </View>
        </View>

        <View style={[s.cardTile, s.fee]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[f.t(11), { color: t.muted }]}>Fee level</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <Text style={[f.t(16, 700), { color: bandColor }]}>{report.band.label}</Text>
              <Text style={[f.t(11.5), { color: t.muted }]}>({report.band.range})</Text>
            </View>
            <Text style={[f.t(11.5), { color: t.ink3, marginTop: 2 }]}>{report.band.feeImplication}</Text>
          </View>
          <Receipt size={24} color={t.faint} />
        </View>

        <Text style={[f.t(15, 600), s.sec]}>KPI contribution</Text>
        <View style={{ gap: 8 }}>
          {cats.map((c) => {
            const meta = CATEGORY_META[c.category];
            const color = catColor(t, c.category);
            const Icon = meta.icon;
            const isOpen = !!open[c.category];
            return (
              <Card key={c.category} radius={20} style={{ overflow: "hidden" }}>
                <TouchableOpacity
                  onPress={() => setOpen((o) => ({ ...o, [c.category]: !o[c.category] }))}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  style={s.catHead}
                >
                  <Icon size={17} color={color} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[f.t(13.5, 600), { color: t.ink }]} numberOfLines={1}>
                      {meta.label}
                    </Text>
                    <Text style={[f.t(11), { color: t.muted, marginTop: 2 }]}>
                      {c.deliverables.length} deliverable{c.deliverables.length === 1 ? "" : "s"} averaged
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[f.t(13, 700), { color }]}>
                      {fmtScore(c.achievedScore)} / {fmtTarget(c.targetScore)}
                    </Text>
                    <Text style={[f.t(11), { color: t.muted, marginTop: 2 }]}>
                      × {c.weight.toFixed(2)} ={" "}
                      <Text style={[f.t(11, 700), { color: t.ink }]}>{c.weightedAchieved.toFixed(2)}</Text>
                    </Text>
                  </View>
                  {isOpen ? <ChevronUp size={18} color={t.faint} /> : <ChevronDown size={18} color={t.faint} />}
                </TouchableOpacity>
                {isOpen
                  ? c.deliverables.map((d) => {
                      const meets = d.actualPct >= d.commitmentPct;
                      const body = (
                        <>
                          <Text style={[f.t(12), { color: t.ink2, lineHeight: 16, flex: 1, minWidth: 0 }]}>
                            {d.deliverable} <Text style={[f.t(10.5), { color: t.muted }]}>({sourceModuleOf(d)})</Text>
                          </Text>
                          <Text style={[f.m(12, 600), { color: meets ? t.ok : t.bad }]}>{fmtPct(d.actualPct)}%</Text>
                          <Text style={[f.t(10.5), { color: t.muted }]}>vs {numPct(d.commitmentPct)}%</Text>
                          <Text style={[f.t(12, 700), { color: t.ink, width: 32, textAlign: "right" }]}>
                            {fmtScore(d.actualScore)}
                          </Text>
                        </>
                      );
                      return onOpenDrill ? (
                        <TouchableOpacity
                          key={d.key}
                          onPress={() => onOpenDrill(d.key)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`${d.deliverable}, open drill-down`}
                          style={s.delivRow}
                        >
                          {body}
                        </TouchableOpacity>
                      ) : (
                        <View key={d.key} style={s.delivRow}>
                          {body}
                        </View>
                      );
                    })
                  : null}
              </Card>
            );
          })}
        </View>

        <Text style={[f.t(15, 600), s.sec]}>Calculation breakup</Text>
        <View style={s.console}>
          {steps.map((st, i) => (
            <Text
              key={i}
              style={[f.m(11.5, st.accent ? 600 : 400), { color: st.accent ? t.accentInk : t.ink2, lineHeight: 20 }]}
            >
              {st.text}
            </Text>
          ))}
        </View>

        <View style={[s.raw, { borderColor: t.accent, backgroundColor: t.accentTint }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[f.t(13, 600), { color: t.accentInk }]}>Raw data used in this calculation</Text>
            <Text style={[f.t(11.5), { color: t.ink3, lineHeight: 16, marginTop: 3 }]}>
              Every deliverable&apos;s data points, KPI scores and the overall rating for {siteName}, {mLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDownload}
            disabled={downloading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Download raw data CSV"
            style={s.rawBtn}
          >
            {downloading ? <ActivityIndicator color={t.onAccent} /> : <Download size={20} color={t.onAccent} />}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const useStyles = makeJoStyles((t) => ({
  tiles: { flexDirection: "row", gap: 6, marginTop: 14 },
  tile: { flex: 1, minWidth: 0, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 13 },
  cardTile: { backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, borderRadius: 18 },
  fee: { marginTop: 6, paddingVertical: 12, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  sec: { color: t.ink, paddingTop: 18, paddingHorizontal: 4, paddingBottom: 8 },
  catHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: t.raised,
  },
  delivRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingRight: 14,
    paddingLeft: 41,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  console: {
    borderRadius: 20,
    backgroundColor: t.page,
    borderWidth: 1,
    borderColor: t.lineMid,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  raw: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rawBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.accent,
    alignItems: "center",
    justifyContent: "center",
  },
}));
