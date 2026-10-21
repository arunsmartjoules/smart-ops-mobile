/**
 * SLA › Compare: portfolio summary tiles, the site ranking (tap = switch
 * site, tap the score row = rating breakup) and the deliverable × site matrix.
 * Every number comes from each site's own /summary for the selected month.
 */
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronUp, GitCompare, Maximize2 } from "lucide-react-native";
import { Card, EmptyState, Shimmer, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { toneBg, toneFg } from "@/constants/jo";
import type { SlaReport } from "@/services/SlaService";
import { FrozenTable, TintPill, type FrozenRow } from "./parts";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  catColor,
  clampPct,
  fmtPct,
  fmtScore,
  hexAlpha,
  isCategoryApplicable,
  monthLabel,
  numPct,
  ratingTone,
  shortSiteName,
} from "./lib";

export interface CompareSite {
  siteCode: string;
  name: string;
  report: SlaReport | null;
  loading: boolean;
}

interface Ranked {
  siteCode: string;
  name: string;
  shortName: string;
  report: SlaReport;
  rating: number;
  score: number;
  /** Aligned to CATEGORY_ORDER; null where the site's template excludes it. */
  kpi: (number | null)[];
}

const MATRIX_LEFT = 150;
const MATRIX_COMMIT = 58;
const MATRIX_SITE = 72;

export function CompareView({
  sites,
  currentSiteCode,
  monthKey,
  onPickSite,
  onOpenRating,
  onOpenDrill,
}: {
  sites: CompareSite[];
  currentSiteCode: string;
  monthKey: string;
  onPickSite: (code: string) => void;
  onOpenRating: (code: string) => void;
  onOpenDrill: (key: string) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [riskOpen, setRiskOpen] = useState(false);
  const mLabel = monthLabel(monthKey);

  const ranked = useMemo<Ranked[]>(
    () =>
      sites
        .filter((x): x is CompareSite & { report: SlaReport } => !!x.report)
        .map((x) => ({
          siteCode: x.siteCode,
          name: x.name,
          shortName: shortSiteName(x.name),
          report: x.report,
          rating: x.report.totals.performanceRating * 100,
          score: x.report.totals.achievedScore,
          kpi: CATEGORY_ORDER.map((cat) => {
            const c = x.report.categories.find((y) => y.category === cat);
            return isCategoryApplicable(c) && c ? c.achievedScore : null;
          }),
        }))
        .sort((a, b) => b.rating - a.rating),
    [sites],
  );

  const pending = sites.filter((x) => x.loading && !x.report).length;

  // Deliverable rows follow the best site's template (sites can differ;
  // a deliverable a site doesn't carry shows "—").
  const delivRows = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; name: string; commitmentPct: number; category: string }[] = [];
    ranked.forEach((r) =>
      r.report.categories.forEach((c) =>
        c.deliverables.forEach((d) => {
          if (seen.has(d.key)) return;
          seen.add(d.key);
          out.push({ key: d.key, name: d.deliverable, commitmentPct: d.commitmentPct, category: c.category });
        }),
      ),
    );
    const order = (cat: string) => CATEGORY_ORDER.indexOf(cat as (typeof CATEGORY_ORDER)[number]);
    return out.sort((a, b) => order(a.category) - order(b.category));
  }, [ranked]);

  const perSite = useMemo(
    () =>
      ranked.map((r) => {
        const m = new Map<string, number>();
        r.report.categories.forEach((c) => c.deliverables.forEach((d) => m.set(d.key, d.actualPct)));
        return { siteCode: r.siteCode, shortName: r.shortName, map: m };
      }),
    [ranked],
  );

  if (!ranked.length) {
    if (pending > 0) {
      return (
        <View style={{ gap: 8 }}>
          <Shimmer height={86} />
          <Shimmer height={150} radius={22} />
          <Shimmer height={150} radius={22} />
        </View>
      );
    }
    return <EmptyState icon={GitCompare} title="No sites to compare" sub={`No SLA scores for ${mLabel} yet.`} />;
  }

  const best = ranked[0]!;
  const avg = ranked.reduce((a, r) => a + r.rating, 0) / ranked.length;
  const atRisk = ranked.filter((r) => r.rating < 90);
  const warnBorder = hexAlpha(t.warn, 0.25);

  // Best/worst per KPI column, judged only among sites that carry the KPI.
  const kpiExtremes = CATEGORY_ORDER.map((_, ki) => {
    const vals = ranked.map((r) => r.kpi[ki]).filter((v): v is number => v != null);
    return vals.length ? { mx: Math.max(...vals), mn: Math.min(...vals) } : null;
  });

  const matrixRows: FrozenRow[] = delivRows.map((d) => {
    const vals = perSite.map((p) => p.map.get(d.key) ?? null);
    const present = vals.filter((v): v is number => v != null);
    const mn = present.length ? Math.min(...present) : 0;
    const mx = present.length ? Math.max(...present) : 0;
    return {
      key: d.key,
      onPress: () => onOpenDrill(d.key),
      accessibilityLabel: `${d.name}, open drill-down`,
      left: (
        <View style={s.matrixName}>
          <View style={[s.dot, { backgroundColor: catColor(t, d.category) }]} />
          <Text style={[f.t(11.5), { color: t.ink, lineHeight: 14, flex: 1 }]} numberOfLines={2}>
            {d.name}
          </Text>
        </View>
      ),
      right: (
        <>
          <View style={[s.matrixCell, { width: MATRIX_COMMIT, paddingHorizontal: 6 }]}>
            <Text style={[f.t(11.5), { color: t.muted }]}>{numPct(d.commitmentPct)}%</Text>
          </View>
          {vals.map((v, i) => {
            if (v == null) {
              return (
                <View key={perSite[i]!.siteCode} style={s.matrixCell}>
                  <Text style={[f.t(12), { color: t.faint }]}>—</Text>
                </View>
              );
            }
            const meets = v >= d.commitmentPct;
            const worst = Math.abs(v - mn) < 0.0001 && mx - mn > 0.0001;
            return (
              <View key={perSite[i]!.siteCode} style={[s.matrixCell, worst ? { backgroundColor: t.badTint } : null]}>
                <Text style={[f.t(12, worst ? 700 : 600), { color: meets ? t.ok : t.bad }]}>{fmtPct(v)}%</Text>
              </View>
            );
          })}
        </>
      ),
    };
  });

  return (
    <View>
      {/* ── Summary tiles ── */}
      <View style={s.tiles}>
        <Card radius={18} style={s.tile}>
          <Text style={[f.t(10.5), { color: t.muted }]}>Best performing</Text>
          <Text style={[f.t(14, 700), { color: t.ink, marginTop: 4 }]} numberOfLines={1}>
            {best.shortName}
          </Text>
          <Text style={[f.t(12, 600), { color: t.ok, marginTop: 1 }]}>{fmtPct(best.rating / 100)}%</Text>
        </Card>
        <Card radius={18} style={s.tile}>
          <Text style={[f.t(10.5), { color: t.muted }]}>Portfolio avg</Text>
          <Text style={[f.d(20, -0.02, 1.15), { color: t.ink, marginTop: 3 }]}>{fmtPct(avg / 100)}%</Text>
          <Text style={[f.t(10.5), { color: t.muted, marginTop: 1 }]}>
            {ranked.length} site{ranked.length === 1 ? "" : "s"}
          </Text>
        </Card>
        <TouchableOpacity
          onPress={() => setRiskOpen((o) => !o)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ expanded: riskOpen }}
          accessibilityLabel={`${atRisk.length} sites below Level 1, fee impact`}
          style={[
            s.tile,
            s.riskTile,
            riskOpen ? { backgroundColor: t.warnTint, borderColor: warnBorder } : null,
          ]}
        >
          <Text style={[f.t(10.5), { color: t.muted }]}>Below Level 1</Text>
          <Text style={[f.d(20, -0.02, 1.15), { color: t.warn, marginTop: 3 }]}>{atRisk.length}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 1 }}>
            <Text style={[f.t(10.5), { color: t.muted }]}>fee impact</Text>
            {riskOpen ? <ChevronUp size={13} color={t.muted} /> : <ChevronDown size={13} color={t.muted} />}
          </View>
        </TouchableOpacity>
      </View>
      {riskOpen ? (
        <View style={[s.riskPanel, { borderColor: warnBorder }]}>
          <Text style={[f.t(12, 600), { color: t.warn }]}>Below Level 1, fee implication applies</Text>
          {atRisk.map((r) => (
            <View key={r.siteCode} style={s.riskRow}>
              <Text style={[f.t(12), { color: t.ink, flex: 1 }]} numberOfLines={1}>
                {r.shortName}
              </Text>
              <Text style={[f.t(12, 600), { color: t.ink }]}>
                {fmtPct(r.rating / 100)}% · L{r.report.band.level}
              </Text>
            </View>
          ))}
          {atRisk.length === 0 ? (
            <Text style={[f.t(12), { color: t.ink3, marginTop: 4 }]}>Every site is at Level 1 (≥ 90%) this period.</Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Ranking ── */}
      <View style={s.headRow}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Site ranking</Text>
        <Text style={[f.t(11.5), { color: t.muted }]}>{mLabel}</Text>
      </View>
      <Text style={[f.t(11.5), s.headSub]}>Green = best in KPI · Red = lowest · Tap a site to switch to it</Text>
      <View style={{ gap: 8 }}>
        {ranked.map((r, i) => {
          const cur = r.siteCode === currentSiteCode;
          const tone = ratingTone(r.rating);
          const rc = toneFg(t, tone);
          return (
            <Card
              key={r.siteCode}
              radius={22}
              onPress={() => onPickSite(r.siteCode)}
              accessibilityLabel={`Rank ${i + 1}, ${r.name}, ${fmtPct(r.rating / 100)} percent. Switch to this site`}
              style={[s.rankCard, cur ? { borderColor: t.accent } : null]}
            >
              <View style={s.rankTop}>
                <View style={[s.rankNo, i === 0 ? { backgroundColor: t.accent } : null]}>
                  <Text style={[f.t(12, 700), { color: i === 0 ? t.onAccent : t.ink3 }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[f.t(14, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
                      {r.shortName}
                    </Text>
                    {cur ? (
                      <View style={[s.curBadge, { borderColor: t.accentInk }]}>
                        <Text style={[f.t(10, 600), { color: t.accentInk }]}>current</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[f.m(10.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
                    {r.siteCode}
                  </Text>
                </View>
                <TintPill label={r.report.band.label} fg={rc} bg={toneBg(t, tone)} />
              </View>
              <View style={s.kpiCells}>
                {CATEGORY_ORDER.map((cat, ki) => {
                  const v = r.kpi[ki] ?? null;
                  const ex = kpiExtremes[ki];
                  const isBest = v != null && ex != null && Math.abs(v - ex.mx) < 0.005 && ranked.length > 1;
                  const isWorst = v != null && ex != null && Math.abs(v - ex.mn) < 0.005 && ex.mx - ex.mn > 0.005;
                  return (
                    <View key={cat} style={s.kpiCell}>
                      <Text style={[f.t(9.5), { color: t.muted }]} numberOfLines={1}>
                        {CATEGORY_META[cat].short}
                      </Text>
                      <Text
                        style={[
                          f.t(12.5, isBest || isWorst ? 700 : 600),
                          { color: v == null ? t.faint : isWorst ? t.bad : isBest ? t.ok : t.ink, marginTop: 2 },
                        ]}
                      >
                        {v == null ? "—" : fmtScore(v)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={() => onOpenRating(r.siteCode)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${r.shortName} calculation breakup`}
                style={s.rankFoot}
              >
                <Text style={[f.t(11.5), { color: t.muted }]}>
                  Score <Text style={[f.t(11.5, 700), { color: t.ink }]}>{fmtScore(r.score)}</Text>
                </Text>
                <View style={s.rankTrack}>
                  <View style={{ width: `${clampPct(r.rating)}%`, height: "100%", borderRadius: 3, backgroundColor: rc }} />
                </View>
                <Text style={[f.t(13, 700), { color: rc }]}>{fmtPct(r.rating / 100)}%</Text>
                <Maximize2 size={14} color={t.muted} />
              </TouchableOpacity>
            </Card>
          );
        })}
      </View>
      {pending > 0 ? (
        <Text style={[f.t(11.5), { color: t.muted, paddingHorizontal: 6, paddingTop: 8 }]}>
          Loading {pending} more site{pending === 1 ? "" : "s"}…
        </Text>
      ) : null}

      {/* ── Deliverable × site matrix ── */}
      <View style={s.headRow}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Deliverable Actual % by site</Text>
      </View>
      <Text style={[f.t(11.5), s.headSub]}>Red = below commitment · Highlighted = lowest across sites</Text>
      <Card radius={22} style={{ overflow: "hidden" }}>
        <FrozenTable
          leftWidth={MATRIX_LEFT}
          headerHeight={36}
          rowHeight={44}
          headerBg={t.raised}
          bodyBg={t.card}
          rowBorder={t.line}
          headerLeft={<Text style={[f.t(10.5), { color: t.muted, paddingLeft: 14, paddingRight: 8 }]}>Deliverable</Text>}
          headerRight={
            <>
              <View style={[s.matrixHead, { width: MATRIX_COMMIT, paddingHorizontal: 6 }]}>
                <Text style={[f.t(10.5), { color: t.muted }]}>Commit</Text>
              </View>
              {perSite.map((p) => {
                const cur = p.siteCode === currentSiteCode;
                return (
                  <View key={p.siteCode} style={s.matrixHead}>
                    <Text style={[f.t(10.5, cur ? 700 : 500), { color: cur ? t.ink : t.muted }]} numberOfLines={1}>
                      {p.shortName}
                    </Text>
                  </View>
                );
              })}
            </>
          }
          rows={matrixRows}
        />
      </Card>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  tiles: { flexDirection: "row", gap: 6 },
  tile: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 11 },
  riskTile: { borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder },
  riskPanel: {
    marginTop: 6,
    borderRadius: 18,
    backgroundColor: t.warnTint,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  headRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 18,
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  headSub: { color: t.muted, paddingHorizontal: 6, paddingBottom: 10 },
  rankCard: { paddingVertical: 13, paddingHorizontal: 14 },
  rankTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  rankNo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  curBadge: { height: 18, paddingHorizontal: 7, borderRadius: 9, borderWidth: 1, justifyContent: "center" },
  kpiCells: { flexDirection: "row", gap: 4, marginTop: 11 },
  kpiCell: { flex: 1, minWidth: 0, borderRadius: 10, backgroundColor: t.raised, paddingVertical: 6, paddingHorizontal: 7 },
  rankFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  rankTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: t.track, overflow: "hidden" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  matrixName: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 14, paddingRight: 8, flex: 1 },
  matrixHead: { width: MATRIX_SITE, paddingHorizontal: 8, alignItems: "flex-end", justifyContent: "center" },
  matrixCell: { width: MATRIX_SITE, paddingHorizontal: 8, alignItems: "flex-end", justifyContent: "center" },
}));
