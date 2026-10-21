/**
 * SLA — Claude Design "JouleOps App" artboard, SLA route (r_sla).
 *
 * Main view (site + month pickers, Overall / KPI / Compare tabs), a
 * deliverable drill-down and the rating calculation breakup, all on
 * GET /api/sla/:siteCode/summary + /drilldown/:key (backend services/sla).
 * Mirrors the web module (web/src/app/sla): same scores, bands, trend window,
 * Compare fan-out and CSVs; PDF / Excel come from the backend exports.
 *
 * Non-admins can't see months before SLA_OPEN_FROM_MONTH (backend 403s them),
 * so the month picker and trend stop there.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { router, type Href } from "expo-router";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import {
  Building2,
  Calendar,
  ChevronDown,
  CircleAlert,
  File,
  FileDown,
  FileSpreadsheet,
  FileText,
  GitCompare,
  LayoutDashboard,
  RefreshCw,
  Share,
  ShieldOff,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import { EmptyState, JoPage, JoSheet, Shimmer, Toast, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSiteCode } from "@/services/SiteSelection";
import AttendanceService, { getISTDateString } from "@/services/AttendanceService";
import { db, userSites } from "@/database";
import logger from "@/utils/logger";
import { useAutoSync } from "@/hooks/useAutoSync";
import { saveBackendFile, saveTextFile, toCsv } from "@/utils/fileExport";
import SlaService, { type SlaDrillDown } from "@/services/SlaService";
import { OverallView, type TrendPoint } from "@/components/sla/OverallView";
import { KpiView } from "@/components/sla/KpiView";
import { CompareView, type CompareSite } from "@/components/sla/CompareView";
import { DrillView } from "@/components/sla/DrillView";
import { RatingView } from "@/components/sla/RatingView";
import { RoundButton, SheetRow, SubHeader } from "@/components/sla/parts";
import { summaryKey, useSlaDrill, useSlaSummaries } from "@/components/sla/useSlaData";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  SLA_OPEN_FROM_MONTH,
  applicableCategories,
  canSeeAllSlaHistory,
  catColor,
  drillCsvRows,
  excludeDevOnlySlaSites,
  fmtPct,
  fmtScore,
  isCategoryApplicable,
  monthLabel,
  monthWindow,
  numberedDeliverables,
  ratingCsvRows,
  ratingTone,
  recentMonths,
  reportCsvRows,
  type SlaTab,
} from "@/components/sla/lib";

interface SiteOpt {
  site_code: string;
  name: string;
}

type View_ =
  | { kind: "main" }
  | { kind: "drill"; key: string; from: "main" | "rating" }
  | { kind: "rating"; site: string };

type SheetKind = null | "site" | "month" | "export";
type ExportKind = "pdf" | "xlsx" | "csv";

const TREND_MONTHS = 6;
const MONTH_OPTIONS = 12;

export default function SlaScreen() {
  const t = useJoTheme();
  const s = useStyles();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const isAdmin = canSeeAllSlaHistory(user);

  // ── Sites (JouleCool only — same source as Home) ──────────────────────
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [selectedSiteCode, setSelectedSiteCode] = useSelectedSiteCode(userId);

  const loadSites = useCallback(async () => {
    if (!userId) return;
    try {
      const local = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, userId))
        .catch(() => [] as { site_code: string; site_name: string }[]);
      if (local.length > 0) {
        setSites((prev) =>
          prev.length > 0
            ? prev
            : local.map((r: { site_code: string; site_name: string }) => ({ site_code: r.site_code, name: r.site_name })),
        );
      }
      const fresh = await AttendanceService.getUserSites(userId, "JouleCool").catch(() => []);
      if (fresh.length > 0) setSites(fresh.map((x) => ({ site_code: x.site_code, name: x.name || x.site_code })));
    } catch (error) {
      logger.warn("SLA sites load failed", { error });
    } finally {
      setSitesLoaded(true);
    }
  }, [userId]);

  // Focus + foreground refresh, the same hook Home uses for its site list.
  useAutoSync(loadSites, [userId], { interval: 10 * 60_000 });

  const activeSite = useMemo(
    () => sites.find((x) => x.site_code === selectedSiteCode) ?? sites[0] ?? null,
    [sites, selectedSiteCode],
  );
  const siteCode = activeSite?.site_code ?? null;
  const siteName = activeSite?.name || siteCode || "";

  // ── Month ─────────────────────────────────────────────────────────────
  const currentMonth = getISTDateString().slice(0, 7);
  const [pickedMonth, setMonth] = useState(currentMonth);
  const monthOptions = useMemo(
    () => recentMonths(currentMonth, MONTH_OPTIONS).filter((m) => isAdmin || m >= SLA_OPEN_FROM_MONTH),
    [currentMonth, isAdmin],
  );
  // Role arrives async: a non-admin can never sit on a pre-cutoff month.
  const month = !isAdmin && pickedMonth < SLA_OPEN_FROM_MONTH ? currentMonth : pickedMonth;

  const trendMonths = useMemo(
    () => monthWindow(month, TREND_MONTHS).filter((m) => isAdmin || m >= SLA_OPEN_FROM_MONTH),
    [month, isAdmin],
  );

  // ── View state ────────────────────────────────────────────────────────
  const [pickedTab, setTab] = useState<SlaTab>("overall");
  const [pickedView, setView] = useState<View_>({ kind: "main" });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<null | ExportKind | "drill" | "rating">(null);
  const [refreshing, setRefreshing] = useState(false);
  const hideToast = useCallback(() => setToast(""), []);

  // ── Summaries ─────────────────────────────────────────────────────────
  const { entries, ensure, retry } = useSlaSummaries(userId);

  const compareSites = useMemo(() => excludeDevOnlySlaSites(sites), [sites]);
  const ratingSite = pickedView.kind === "rating" ? pickedView.site : null;

  const neededKeys = useMemo(() => {
    const keys = new Set<string>();
    if (siteCode) trendMonths.forEach((m) => keys.add(summaryKey(siteCode, m)));
    // Other sites are fetched only for Compare (the site sheet shows a
    // site's rating only once it has been loaded there).
    if (pickedTab === "compare") compareSites.forEach((x) => keys.add(summaryKey(x.site_code, month)));
    if (ratingSite) keys.add(summaryKey(ratingSite, month));
    return Array.from(keys);
  }, [siteCode, trendMonths, pickedTab, compareSites, month, ratingSite]);

  useEffect(() => {
    if (userId) void ensure(neededKeys);
  }, [userId, neededKeys, ensure]);

  const curKey = siteCode ? summaryKey(siteCode, month) : null;
  const entry = curKey ? entries[curKey] : undefined;
  const report = entry?.data ?? null;

  // A category the site's template excludes has no tab — fall back to Overall.
  const tab: SlaTab =
    report &&
    pickedTab !== "overall" &&
    pickedTab !== "compare" &&
    !isCategoryApplicable(report.categories.find((x) => x.category === pickedTab))
      ? "overall"
      : pickedTab;

  const delivs = useMemo(() => (report ? numberedDeliverables(report) : []), [report]);
  // A drill target the (new) site's template doesn't carry has nothing to show.
  const view: View_ =
    pickedView.kind === "drill" && report && !delivs.some((d) => d.key === pickedView.key)
      ? { kind: "main" }
      : pickedView;
  const numberOf = useCallback((key: string) => delivs.find((d) => d.key === key)?.no ?? 0, [delivs]);

  const trend: TrendPoint[] = useMemo(
    () =>
      siteCode
        ? trendMonths.map((m) => ({ monthKey: m, report: entries[summaryKey(siteCode, m)]?.data ?? null }))
        : [],
    [trendMonths, entries, siteCode],
  );

  const compareInputs: CompareSite[] = useMemo(
    () =>
      compareSites.map((x) => {
        const e = entries[summaryKey(x.site_code, month)];
        return { siteCode: x.site_code, name: x.name, report: e?.data ?? null, loading: !e || e.loading };
      }),
    [compareSites, entries, month],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([ensure(neededKeys, true), loadSites()]);
    } finally {
      setRefreshing(false);
    }
  }, [ensure, neededKeys, loadSites]);

  // ── Navigation inside the screen ──────────────────────────────────────
  const openDrill = useCallback(
    (key: string, from: "main" | "rating" = "main") => {
      if (!delivs.some((d) => d.key === key)) {
        setToast("Not part of this site's SLA template");
        return;
      }
      setView({ kind: "drill", key, from });
    },
    [delivs],
  );

  const back = useCallback(() => {
    setView((v) =>
      v.kind === "drill" && v.from === "rating" && siteCode ? { kind: "rating", site: siteCode } : { kind: "main" },
    );
  }, [siteCode]);

  useEffect(() => {
    if (view.kind === "main") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [view.kind, back]);

  const pickSite = useCallback(
    (code: string) => {
      setSelectedSiteCode(code);
      setSheet(null);
    },
    [setSelectedSiteCode],
  );

  // ── Exports ───────────────────────────────────────────────────────────
  const runSave = useCallback(async (kind: NonNullable<typeof busy>, job: () => Promise<string | null>) => {
    setBusy(kind);
    try {
      const msg = await job();
      if (msg) setToast(msg);
    } catch (error) {
      setToast(error instanceof Error && error.message ? error.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const runExport = useCallback(
    (kind: ExportKind) => {
      if (!siteCode) return;
      setSheet(null);
      // Let the sheet finish closing — iOS can't present the share sheet over
      // a modal that is still dismissing.
      setTimeout(() => {
        if (kind === "csv") {
          if (!report) {
            setToast("The SLA report is still loading");
            return;
          }
          void runSave("csv", () =>
            saveTextFile(toCsv(reportCsvRows(report)), `sla-report-${siteCode}-${month}.csv`),
          );
          return;
        }
        void runSave(kind, () =>
          saveBackendFile(
            SlaService.exportPath(siteCode, month, kind),
            `SLA-${siteCode}-${month}.${kind}`,
            kind === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ),
        );
      }, 350);
    },
    [siteCode, month, report, runSave],
  );

  // ── Drill-down ────────────────────────────────────────────────────────
  const drillKey = view.kind === "drill" ? view.key : null;
  const drill = useSlaDrill(userId, siteCode, month, drillKey);
  const drillIdx = drillKey ? delivs.findIndex((d) => d.key === drillKey) : -1;
  const drillDeliv = drillIdx >= 0 ? delivs[drillIdx]! : null;

  const downloadDrill = useCallback(
    (data: SlaDrillDown | null) => {
      if (!drillDeliv || !siteCode) return;
      void runSave("drill", () =>
        saveTextFile(
          toCsv(drillCsvRows({ no: drillDeliv.no, deliverable: drillDeliv, drill: data, siteName, monthKey: month })),
          `sla-D${drillDeliv.no}-${siteCode}-${month}.csv`,
        ),
      );
    },
    [drillDeliv, siteCode, siteName, month, runSave],
  );

  // ── Render ────────────────────────────────────────────────────────────
  if (view.kind === "drill" && drillDeliv) {
    return (
      <JoPage>
        <DrillView
          key={`${siteCode}|${month}|${drillDeliv.key}`}
          deliverable={drillDeliv}
          no={drillDeliv.no}
          siteName={siteName}
          monthKey={month}
          drill={drill}
          hasPrev={drillIdx > 0}
          hasNext={drillIdx < delivs.length - 1}
          onPrev={() => drillIdx > 0 && setView({ ...view, key: delivs[drillIdx - 1]!.key })}
          onNext={() => drillIdx < delivs.length - 1 && setView({ ...view, key: delivs[drillIdx + 1]!.key })}
          onBack={back}
          onOpenSource={(href) => router.push(href as Href)}
          onDownload={downloadDrill}
          downloading={busy === "drill"}
        />
        <Toast message={toast} onHide={hideToast} />
      </JoPage>
    );
  }

  if (view.kind === "rating") {
    const rEntry = entries[summaryKey(view.site, month)];
    const rReport = rEntry?.data ?? null;
    const rName = sites.find((x) => x.site_code === view.site)?.name || rReport?.site.name || view.site;
    return (
      <JoPage>
        {rReport ? (
          <RatingView
            report={rReport}
            siteName={rName}
            siteCode={view.site}
            monthKey={month}
            onBack={back}
            onOpenDrill={(key) => {
              if (view.site !== siteCode) {
                // The drill-down is per site: make the rating's site the active one.
                setSelectedSiteCode(view.site);
                setView({ kind: "drill", key, from: "rating" });
                return;
              }
              openDrill(key, "rating");
            }}
            onDownload={() =>
              void runSave("rating", () =>
                saveTextFile(
                  toCsv(ratingCsvRows(rReport, rName, view.site, month)),
                  `sla-raw-${view.site}-${month}.csv`,
                ),
              )
            }
            downloading={busy === "rating"}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <SubHeader title="Calculation breakup" sub={`Performance rating · ${monthLabel(month)}`} onBack={back} />
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {rEntry && !rEntry.loading ? (
                <EmptyState
                  icon={CircleAlert}
                  title="Couldn't load this site's SLA"
                  sub={rEntry.error ?? undefined}
                  action={{ label: "Back", onPress: back }}
                />
              ) : (
                <>
                  <Shimmer height={90} />
                  <Shimmer height={220} radius={20} />
                </>
              )}
            </View>
          </View>
        )}
        <Toast message={toast} onHide={hideToast} />
      </JoPage>
    );
  }

  const tabs: { key: SlaTab; label: string; icon: LucideIcon; color: string; score: string | null }[] = [
    { key: "overall", label: "Overall", icon: LayoutDashboard, color: t.accentInk, score: null },
    ...CATEGORY_ORDER.filter((k) => !report || isCategoryApplicable(report.categories.find((c) => c.category === k))).map(
      (k) => {
        const c = report?.categories.find((x) => x.category === k);
        return {
          key: k as SlaTab,
          label: CATEGORY_META[k].label,
          icon: CATEGORY_META[k].icon,
          color: catColor(t, k),
          score: c ? fmtScore(c.achievedScore) : null,
        };
      },
    ),
    { key: "compare", label: "Compare", icon: GitCompare, color: t.ink2, score: null },
  ];

  const deliverableCount = report ? applicableCategories(report).reduce((a, c) => a + c.deliverables.length, 0) : 0;
  const syncedLabel = report?.computedAt ? `Synced ${formatSynced(report.computedAt)}` : null;

  const activeCategory =
    report && tab !== "overall" && tab !== "compare" ? report.categories.find((c) => c.category === tab) : undefined;

  return (
    <JoPage>
      {/* ── Header ── */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={s.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TouchableOpacity
              onPress={() => sites.length > 0 && setSheet("site")}
              disabled={sites.length === 0}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Site: ${siteName || "none"}. Change site`}
              style={s.siteBtn}
            >
              <Text style={[f.t(13), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
                {siteName || (sitesLoaded ? "No site" : "Loading sites…")}
              </Text>
              <ChevronDown size={16} color={t.muted} />
            </TouchableOpacity>
            <Text style={[f.d(28, -0.025), { color: t.ink, marginTop: 4 }]}>SLA</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity
              onPress={() => setSheet("month")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`SLA month ${monthLabel(month)}. Change month`}
              style={s.monthBtn}
            >
              <Calendar size={15} color={t.accentInk} />
              <Text style={[f.t(12.5, 600), { color: t.ink }]}>{monthLabel(month)}</Text>
              <ChevronDown size={16} color={t.muted} />
            </TouchableOpacity>
            <RoundButton
              icon={Share}
              iconSize={19}
              label="Export SLA report"
              onPress={siteCode ? () => setSheet("export") : undefined}
              disabled={!siteCode || busy === "pdf" || busy === "xlsx" || busy === "csv"}
            />
          </View>
        </View>

        {report ? (
          <View style={s.metaRow}>
            <File size={13} color={t.muted} />
            {report.template?.name ? (
              <>
                <Text style={[f.t(11.5), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
                  {report.template.name}
                </Text>
                <Text style={[f.t(11.5), { color: t.disabled }]}>·</Text>
              </>
            ) : null}
            <Text style={[f.t(11.5), { color: t.muted }]} numberOfLines={1}>
              {deliverableCount} deliverables
            </Text>
            {entry?.fromCache ? (
              <>
                <Text style={[f.t(11.5), { color: t.disabled }]}>·</Text>
                <WifiOff size={13} color={t.warn} />
                <Text style={[f.t(11.5), { color: t.warn }]} numberOfLines={1}>
                  Offline copy
                </Text>
              </>
            ) : syncedLabel ? (
              <>
                <Text style={[f.t(11.5), { color: t.disabled }]}>·</Text>
                <RefreshCw size={12} color={t.muted} />
                <Text style={[f.t(11.5), { color: t.muted }]} numberOfLines={1}>
                  {syncedLabel}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabsScroll}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
        >
          {tabs.map((tb) => {
            const on = tb.key === tab;
            const Icon = tb.icon;
            return (
              <TouchableOpacity
                key={tb.key}
                onPress={() => setTab(tb.key)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tb.score ? `${tb.label}, score ${tb.score}` : tb.label}
                style={[s.tab, on ? s.tabOn : null]}
              >
                <Icon size={15} color={on ? t.selFg : tb.color} />
                <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.ink2 }]}>{tb.label}</Text>
                {tb.score ? (
                  <Text style={[f.t(11, 600), { color: on ? t.faint : t.muted }]}>{tb.score}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Body ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />}
      >
        {!userId ? null : !sitesLoaded && sites.length === 0 ? (
          <LoadingBlocks />
        ) : !siteCode ? (
          <EmptyState
            icon={Building2}
            title="No JouleCool sites"
            sub="SLA is scored for the JouleCool sites you're assigned to."
            action={{ label: "Try again", onPress: () => void loadSites() }}
          />
        ) : tab === "compare" ? (
          <CompareView
            sites={compareInputs}
            currentSiteCode={siteCode}
            monthKey={month}
            onPickSite={(code) => {
              setSelectedSiteCode(code);
              setTab("overall");
            }}
            onOpenRating={(code) => setView({ kind: "rating", site: code })}
            onOpenDrill={(key) => openDrill(key)}
          />
        ) : !report ? (
          entry?.forbidden ? (
            <EmptyState icon={ShieldOff} title="No access to this month" sub={entry.error ?? undefined} />
          ) : entry && !entry.loading && entry.error ? (
            <EmptyState
              icon={CircleAlert}
              title="Couldn't load the SLA report"
              sub={entry.error}
              action={{ label: "Try again", onPress: () => curKey && void retry(curKey) }}
            />
          ) : (
            <LoadingBlocks />
          )
        ) : tab === "overall" ? (
          <OverallView
            report={report}
            trend={trend}
            onOpenRating={() => setView({ kind: "rating", site: siteCode })}
            onPickCategory={(k) => setTab(k)}
          />
        ) : activeCategory ? (
          <KpiView report={report} category={activeCategory} numberOf={numberOf} onOpenDrill={(key) => openDrill(key)} />
        ) : (
          <EmptyState icon={LayoutDashboard} title="No data for this KPI" />
        )}
      </ScrollView>

      {/* ── Sheets ── */}
      <JoSheet visible={sheet === "site"} onClose={() => setSheet(null)} title="Site" subtitle="SLA is scored per site">
        <ScrollView style={s.sheetList} contentContainerStyle={{ gap: 6 }}>
          {sites.map((x) => {
            const r = entries[summaryKey(x.site_code, month)]?.data;
            const pct = r ? r.totals.performanceRating * 100 : null;
            return (
              <SheetRow
                key={x.site_code}
                label={x.name}
                sub={x.site_code}
                meta={pct != null ? `${fmtPct(pct / 100)}%` : undefined}
                metaColor={pct != null ? t[ratingTone(pct)] : undefined}
                selected={x.site_code === siteCode}
                onPress={() => pickSite(x.site_code)}
              />
            );
          })}
        </ScrollView>
      </JoSheet>

      <JoSheet
        visible={sheet === "month"}
        onClose={() => setSheet(null)}
        title="SLA month"
        subtitle={isAdmin ? "Scores are computed per calendar month" : "SLA history is available from June 2026"}
      >
        <ScrollView style={s.sheetList} contentContainerStyle={{ gap: 6 }}>
          {monthOptions.map((m) => {
            const r = siteCode ? entries[summaryKey(siteCode, m)]?.data : null;
            const pct = r ? r.totals.performanceRating * 100 : null;
            return (
              <SheetRow
                key={m}
                label={monthLabel(m)}
                sub={m === currentMonth ? "Month to date" : undefined}
                meta={r ? fmtScore(r.totals.achievedScore) : undefined}
                metaColor={pct != null ? t[ratingTone(pct)] : undefined}
                selected={m === month}
                onPress={() => {
                  setMonth(m);
                  setSheet(null);
                }}
              />
            );
          })}
        </ScrollView>
      </JoSheet>

      <JoSheet
        visible={sheet === "export"}
        onClose={() => setSheet(null)}
        title="Export"
        subtitle={`${siteName} · ${monthLabel(month)}`}
      >
        <View style={{ gap: 6, marginTop: 14 }}>
          <SheetRow
            label="SLA monthly report"
            sub="PDF"
            icon={FileText}
            trailingIcon={FileDown}
            onPress={() => runExport("pdf")}
          />
          <SheetRow
            label="SLA monthly report"
            sub="Excel workbook"
            icon={FileSpreadsheet}
            trailingIcon={FileDown}
            onPress={() => runExport("xlsx")}
          />
          <SheetRow
            label="Deliverable data"
            sub="CSV · every deliverable's score"
            icon={FileDown}
            trailingIcon={FileDown}
            onPress={() => runExport("csv")}
          />
        </View>
      </JoSheet>

      <Toast message={toast} onHide={hideToast} />
    </JoPage>
  );
}

function LoadingBlocks() {
  return (
    <View style={{ gap: 10 }}>
      <Shimmer height={150} radius={24} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Shimmer height={86} radius={20} style={{ flex: 1 }} />
        <Shimmer height={86} radius={20} style={{ flex: 1 }} />
      </View>
      <Shimmer height={260} radius={26} />
    </View>
  );
}

/** computedAt (ISO instant) → "21 Oct, 14:05" in the device's zone. */
function formatSynced(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "d MMM, HH:mm");
}

const useStyles = makeJoStyles((t) => ({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  siteBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", maxWidth: "100%" },
  headerRight: { flexDirection: "row", gap: 8, flexShrink: 0, marginTop: 6 },
  monthBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, paddingHorizontal: 4, overflow: "hidden" },
  tabsScroll: { marginTop: 12, marginHorizontal: -16, flexGrow: 0 },
  tab: {
    height: 36,
    paddingLeft: 11,
    paddingRight: 13,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
  },
  tabOn: { backgroundColor: t.selBg, borderColor: t.selBg },
  body: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 },
  sheetList: { marginTop: 14, maxHeight: 420 },
}));

