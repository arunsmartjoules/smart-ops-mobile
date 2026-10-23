/**
 * Reports — the artboard's three-tab Reports screen, shown as the "Reports"
 * sub-tab of Resources. The shared ResourcesTabs header owns the site pill
 * (app-wide selection); this screen only reads the selected site.
 *
 *  - Modules: per-module export for the selected site and period. Rows come
 *    from each module's list endpoint and are written to CSV on the device;
 *    no module has a backend Excel/PDF export, so those chips are disabled.
 *  - Daily / MTD: the portfolio-wide JouleCool reports (the same documents the
 *    web Reports page and the scheduled emails produce). The card shows their
 *    headline numbers; "Download PDF" fetches the backend-rendered PDF.
 */
import { ChipTabs } from "@/components/jo/ChipTabs";
import { CustomRangeSheet } from "@/components/jo/CustomRangeSheet";
import type { BxName } from "@/components/jo/Bx";
import { useNavInsets } from "@/components/jo/navInsets";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ResourcesTabs } from "@/components/jo/OpsTabs";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  Building2,
  Calendar,
  Clock,
  FileWarning,
  ListChecks,
  ListTodo,
  MessagesSquare,
  TriangleAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "@/components/jo/bxIcons";
import {
  EmptyState,
  JoPage,
  JoSheet,
  SheetOption,
  Shimmer,
  Toast,
  f,
  useJoTheme,
} from "@/components/jo/ui";
import {
  ControlPill,
  DateStrip,
  DocCard,
  DocCardSkeleton,
  DownloadBar,
  ModuleCard,
  type DownloadState,
} from "@/components/reports/ReportsUI";
import {
  RANGE_PRESETS,
  addDays,
  dayNum,
  daysEnding,
  fmtLongDay,
  fmtRange,
  monShort,
  monthEnd,
  monthsEnding,
  presetRange,
  weekdayShort,
  yearOf,
  type RangePreset,
} from "@/components/reports/dates";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import ReportsService, {
  type DocSummary,
  type Loaded,
  type ModuleScope,
  type ReportModuleKey,
} from "@/services/ReportsService";
import { istTodayString } from "@/utils/istDate";
import { saveBackendFile, saveBase64File, saveTextFile, toCsv } from "@/utils/fileExport";
import { tableToPdfBase64, tableToXlsxBase64 } from "@/utils/tableExport";
import logger from "@/utils/logger";

type Tab = "module" | "daily" | "monthly";

const TABS: { key: Tab; label: string; icon: BxName }[] = [
  { key: "module", label: "Modules", icon: "bx-export" },
  { key: "daily", label: "Daily", icon: "bx-calendar" },
  { key: "monthly", label: "MTD", icon: "bx-bar-chart-alt-2" },
];

const MODULES: { key: ReportModuleKey; label: string; icon: LucideIcon; noun: [string, string] }[] = [
  { key: "tickets", label: "Tickets", icon: ListTodo, noun: ["ticket", "tickets"] },
  { key: "incidents", label: "Incidents", icon: TriangleAlert, noun: ["incident", "incidents"] },
  { key: "pm", label: "Preventive maintenance", icon: Wrench, noun: ["PM", "PMs"] },
  { key: "sitelogs", label: "Site logs", icon: ListChecks, noun: ["entry", "entries"] },
  { key: "attendance", label: "Attendance", icon: Clock, noun: ["check-in", "check-ins"] },
  { key: "comms", label: "Client communication", icon: MessagesSquare, noun: ["entry", "entries"] },
];

// All three are built on the device from the same rows (utils/tableExport).
const FORMATS = [
  { label: "Excel", available: true },
  { label: "CSV", available: true },
  { label: "PDF", available: true },
];

/** Pre-selected on every module card until the user picks another. */
const DEFAULT_FORMAT = "PDF";

const FORMAT_FILE: Record<string, { ext: string; mime: string }> = {
  Excel: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  CSV: { ext: "csv", mime: "text/csv" },
  PDF: { ext: "pdf", mime: "application/pdf" },
};

/** Strip length for the Daily / MTD pickers (the artboard's five). */
const STRIP = 5;

/** "KIMS Hospitals, Bengaluru" → "Bengaluru" (same rule as the reports' short names). */
function shortSiteName(name: string): string {
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || name;
}

export default function ReportsScreen() {
  const t = useJoTheme();
  const { clearance, fabBottom } = useNavInsets();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const net = useNetInfo();
  const offline = net.isConnected === false;

  const [tab, setTab] = useState<Tab>("module");
  const [today, setToday] = useState(istTodayString);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState<null | "range" | "custom">(null);

  // ── Sites ───────────────────────────────────────────────────────────
  // Exactly the site in the shared Resources header (module exports work for
  // any assigned site; Daily / MTD cover the whole portfolio). Reading the
  // same hook as the header means an export can never quietly fall back to a
  // different site than the one shown at the top.
  const { selectedSite: activeSite, loading: sitesLoading, refresh: refreshSites } = useSites(userId);
  const loadSites = useCallback(async () => {
    try {
      await refreshSites();
    } catch (error) {
      logger.warn("Reports: site refresh failed", { error });
    }
  }, [refreshSites]);

  // On every visit: re-read the site list, and re-anchor "today" — the IST day
  // can roll over while the app sits in the background.
  useFocusEffect(
    useCallback(() => {
      setToday(istTodayString());
      void loadSites();
    }, [loadSites]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setToday(istTodayString());
    await loadSites();
    setTick((x) => x + 1);
    setRefreshing(false);
  }, [loadSites]);

  // ── Modules tab ─────────────────────────────────────────────────────
  const [preset, setPreset] = useState<RangePreset>("month");
  /** Set by "Custom range"; a preset pick clears it. */
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const range = useMemo(() => customRange ?? presetRange(preset, today), [customRange, preset, today]);
  const scope: ModuleScope | null = useMemo(
    () =>
      activeSite
        ? {
            siteCode: activeSite.site_code,
            siteName: activeSite.site_name || activeSite.site_code,
            from: range.from,
            to: range.to,
          }
        : null,
    [activeSite, range],
  );
  const scopeKey = scope ? `${scope.siteCode}|${scope.from}|${scope.to}` : "";

  // Each result remembers the scope it answers, so a site/period switch never
  // shows the previous scope's counts under the new label.
  const [counts, setCounts] = useState<{
    key: string;
    values: Partial<Record<ReportModuleKey, number | null>>;
  } | null>(null);
  const countsLoading = !!scopeKey && counts?.key !== scopeKey;

  useEffect(() => {
    if (tab !== "module" || !scope || offline) return;
    let cancelled = false;
    const key = scopeKey;
    Promise.allSettled(MODULES.map((m) => ReportsService.countModule(m.key, scope))).then((res) => {
      if (cancelled) return;
      const values: Partial<Record<ReportModuleKey, number | null>> = {};
      res.forEach((r, i) => {
        const m = MODULES[i];
        if (m) values[m.key] = r.status === "fulfilled" ? r.value : null;
      });
      setCounts({ key, values });
    });
    return () => {
      cancelled = true;
    };
  }, [tab, scope, scopeKey, offline, tick]);

  const [formats, setFormats] = useState<Partial<Record<ReportModuleKey, string>>>({});
  const [downloads, setDownloads] = useState<
    Partial<Record<ReportModuleKey, { state: DownloadState; scopeKey: string }>>
  >({});

  const downloadState = (key: ReportModuleKey): DownloadState => {
    const d = downloads[key];
    if (!d) return "idle";
    // A tick only means "done for this site + period".
    if (d.state === "done" && d.scopeKey !== scopeKey) return "idle";
    return d.state;
  };

  const setDownload = (key: ReportModuleKey, state: DownloadState, forKey: string) =>
    setDownloads((prev) => ({ ...prev, [key]: { state, scopeKey: forKey } }));

  const exportModule = async (m: (typeof MODULES)[number]) => {
    if (!scope || downloadState(m.key) === "busy") return;
    if (offline) {
      setToast("You're offline. Connect to export.");
      return;
    }
    const forKey = scopeKey;
    const forScope = scope;
    setDownload(m.key, "busy", forKey);
    try {
      const format = formats[m.key] ?? DEFAULT_FORMAT;
      const file = FORMAT_FILE[format] ?? FORMAT_FILE.CSV!;
      const out = await ReportsService.exportModuleTable(m.key, forScope);
      if (out.rowCount === 0) {
        setDownload(m.key, "idle", forKey);
        setToast(`No ${m.noun[1]} for ${fmtRange(forScope.from, forScope.to)}`);
        return;
      }
      const site = shortSiteName(forScope.siteName || forScope.siteCode);
      const filename = `${m.label}_${site}_${forScope.from}_to_${forScope.to}.${file.ext}`;
      let msg: string | null;
      if (format === "Excel") {
        msg = await saveBase64File(tableToXlsxBase64(out.table, m.label), filename, file.mime);
      } else if (format === "PDF") {
        const subtitle = `${forScope.siteName || forScope.siteCode} · ${fmtRange(forScope.from, forScope.to)} · ${out.rowCount} records${
          out.truncated ? " (first rows only)" : ""
        }`;
        msg = await saveBase64File(await tableToPdfBase64(out.table, m.label, subtitle), filename, file.mime);
      } else {
        msg = await saveTextFile(toCsv(out.table), filename, file.mime);
      }
      if (!msg) {
        setDownload(m.key, "idle", forKey); // picker cancelled
        return;
      }
      setDownload(m.key, "done", forKey);
      setToast(out.truncated ? `${msg} (first ${out.rowCount} rows)` : msg);
    } catch (e) {
      setDownload(m.key, "idle", forKey);
      setToast(e instanceof Error && e.message ? e.message : "Export failed. Try again.");
    }
  };

  // ── Daily / MTD tabs ────────────────────────────────────────────────
  // A day's operations are reported the next morning, so both pickers end on
  // yesterday (IST), as on the web Reports page.
  const yesterday = addDays(today, -1);
  const days = useMemo(() => daysEnding(yesterday, STRIP), [yesterday]);
  const months = useMemo(() => monthsEnding(yesterday.slice(0, 7), STRIP), [yesterday]);
  const [dailyPick, setDailyPick] = useState<string | null>(null);
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const dailyDate = dailyPick && days.includes(dailyPick) ? dailyPick : yesterday;
  const monthKey = monthPick && months.includes(monthPick) ? monthPick : yesterday.slice(0, 7);
  const isCurrentMonth = monthKey === yesterday.slice(0, 7);
  const mtdRange = {
    start: `${monthKey}-01`,
    end: isCurrentMonth ? yesterday : monthEnd(monthKey),
  };

  const isDoc = tab !== "module";
  const docKey = tab === "daily" ? `d|${dailyDate}` : tab === "monthly" ? `m|${mtdRange.start}|${mtdRange.end}` : "";
  const [doc, setDoc] = useState<{ key: string; result: Loaded<DocSummary> } | null>(null);
  const docLoading = isDoc && doc?.key !== docKey;

  useEffect(() => {
    if (!isDoc || !userId) return;
    let cancelled = false;
    const key = docKey;
    const [kind, a, b] = key.split("|");
    const load =
      kind === "d"
        ? ReportsService.getDailySummary(userId, a ?? "")
        : ReportsService.getMonthlySummary(userId, a ?? "", b ?? "");
    load.then((result) => {
      if (!cancelled) setDoc({ key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [isDoc, docKey, userId, tick]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    if (pdfBusy) return;
    if (offline) {
      setToast("You're offline. Connect to download the PDF.");
      return;
    }
    const file =
      tab === "daily"
        ? ReportsService.dailyPdf(dailyDate)
        : ReportsService.monthlyPdf(mtdRange.start, mtdRange.end);
    setPdfBusy(true);
    try {
      const msg = await saveBackendFile(file.path, file.filename, "application/pdf");
      if (msg) setToast(msg);
    } catch (e) {
      setToast(e instanceof Error && e.message ? e.message : "Download failed. Try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  const rangeShort = fmtRange(range.from, range.to, false);

  const moduleSub = (m: (typeof MODULES)[number]): string => {
    if (offline && countsLoading) return `Offline · ${rangeShort}`;
    const c = counts?.key === scopeKey ? counts.values[m.key] : undefined;
    if (c == null) return `Count unavailable · ${rangeShort}`;
    return `${c} ${m.noun[c === 1 ? 0 : 1]} · ${rangeShort}`;
  };

  const renderModules = () => {
    if (!activeSite) {
      if (sitesLoading) {
        return (
          <View style={{ gap: 8 }}>
            <Shimmer height={42} radius={21} />
            {MODULES.map((m) => (
              <Shimmer key={m.key} height={106} radius={22} />
            ))}
          </View>
        );
      }
      return (
        <EmptyState
          icon={Building2}
          title="No sites assigned"
          sub="Ask an admin to add you to a site to export its data."
          action={{ label: "Retry", onPress: () => void onRefresh() }}
        />
      );
    }
    return (
      <>
        <View style={{ flexDirection: "row" }}>
          <ControlPill
            grow
            icon={Calendar}
            iconColor={t.accentInk}
            label={fmtRange(range.from, range.to)}
            chevron
            onPress={() => setSheet("range")}
            a11yLabel={`Period: ${fmtRange(range.from, range.to)}. Change period`}
          />
        </View>
        {offline ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingHorizontal: 6 }}>
            <WifiOff size={14} color={t.muted} />
            <Text style={[f.t(12), { color: t.muted }]}>Offline. Exports need a connection.</Text>
          </View>
        ) : null}
        <View style={{ gap: 8, marginTop: 12 }}>
          {MODULES.map((m) => (
            <ModuleCard
              key={m.key}
              icon={m.icon}
              label={m.label}
              sub={moduleSub(m)}
              subLoading={countsLoading && !offline}
              formats={FORMATS}
              format={formats[m.key] ?? DEFAULT_FORMAT}
              onPickFormat={(label) => {
                setFormats((prev) => ({ ...prev, [m.key]: label }));
                setDownloads((prev) => ({ ...prev, [m.key]: undefined }));
              }}
              state={downloadState(m.key)}
              onDownload={() => void exportModule(m)}
            />
          ))}
        </View>
      </>
    );
  };

  const renderDoc = () => {
    const strip =
      tab === "daily"
        ? days.map((d) => ({ key: d, top: weekdayShort(d), main: dayNum(d), a11y: fmtLongDay(d) }))
        : months.map((ym) => ({
            key: ym,
            top: yearOf(ym),
            main: monShort(ym),
            a11y: `${monShort(ym)} ${yearOf(ym)}`,
          }));
    const kicker = tab === "daily" ? "Daily performance · All sites" : "MTD performance · All sites";
    const title =
      tab === "daily"
        ? fmtLongDay(dailyDate)
        : `${isCurrentMonth ? "Month to date" : "Full month"}, ${monShort(monthKey)} ${yearOf(monthKey)}`;

    let body: React.ReactNode;
    const result = doc?.key === docKey ? doc.result : null;
    if (docLoading || !result) {
      body = <DocCardSkeleton />;
    } else if (!result.success) {
      body = (
        <View style={{ marginTop: 12 }}>
          <EmptyState
            icon={offline ? WifiOff : FileWarning}
            title={offline ? "You're offline" : "Couldn't load the report"}
            sub={offline ? "Connect to load this report." : result.error}
            action={{ label: "Retry", onPress: () => setTick((x) => x + 1) }}
          />
        </View>
      );
    } else {
      const data = result.data;
      const n = data.sites.length;
      const span = tab === "monthly" ? ` · ${fmtRange(mtdRange.start, mtdRange.end)}` : "";
      body = (
        <DocCard
          kicker={kicker}
          title={title}
          sub={`${data.portfolioLabel} · ${n} site${n === 1 ? "" : "s"}${span}`}
          badge={result.isFromCache ? { label: "Offline copy", tone: "mute" } : { label: "Ready", tone: "ok" }}
          stats={data.stats}
          sites={data.sites}
        />
      );
    }
    return (
      <>
        <DateStrip
          items={strip}
          value={tab === "daily" ? dailyDate : monthKey}
          onChange={(k) => (tab === "daily" ? setDailyPick(k) : setMonthPick(k))}
        />
        {body}
      </>
    );
  };

  return (
    <JoPage>
      {/* Resources sub-tabs: SLA · Reports · Client comms (+ the app-wide site pill) */}
      <ResourcesTabs />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, zIndex: 1 }}>
        {/* Same chip tabs as SLA's Overall · Comfort · … */}
        <ChipTabs items={TABS.map((x) => ({ ...x, color: t.accentInk }))} value={tab} onChange={setTab} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: isDoc ? clearance + 62 : clearance }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isDoc ? renderDoc() : renderModules()}
      </ScrollView>

      {isDoc ? <DownloadBar busy={pdfBusy} bottom={fabBottom} onPress={() => void downloadPdf()} /> : null}

      {/* Lifted above the Download PDF bar on the document tabs. */}
      <Toast message={toast} onHide={() => setToast("")} bottom={isDoc ? fabBottom + 62 : fabBottom} />

      <JoSheet visible={sheet === "range"} onClose={() => setSheet(null)} title="Period">
        <View style={{ gap: 8, marginTop: 16 }}>
          {RANGE_PRESETS.map((p) => {
            const r = presetRange(p.key, today);
            return (
              <SheetOption
                key={p.key}
                label={p.label}
                meta={fmtRange(r.from, r.to)}
                selected={!customRange && p.key === preset}
                onPress={() => {
                  setPreset(p.key);
                  setCustomRange(null);
                  setSheet(null);
                }}
              />
            );
          })}
          <SheetOption
            label="Custom range"
            meta={customRange ? fmtRange(customRange.from, customRange.to) : "Pick dates"}
            selected={!!customRange}
            onPress={() => setSheet("custom")}
          />
        </View>
      </JoSheet>

      <CustomRangeSheet
        visible={sheet === "custom"}
        onClose={() => setSheet(null)}
        value={range}
        maxDate={today}
        onApply={(r) => {
          setCustomRange(r);
          setSheet(null);
        }}
      />
    </JoPage>
  );
}
