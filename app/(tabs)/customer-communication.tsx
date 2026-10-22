/**
 * Client communication — artboard "Client comms" (app.dc.html `r_comms`),
 * brought to parity with the web workspace
 * (web/src/app/customer-communication/page.tsx):
 *
 *  - three stream tabs (All · Action Items · General Feedback) with counts,
 *    Action Items also carrying the overdue count;
 *  - the web's five counter cards per stream — tapping one applies its status
 *    filter (a second tap clears it) and may jump stream, exactly like
 *    `pickCounter`; cards with no status filter only switch/reset;
 *  - search over the web's fields, a date range (the web presets, on
 *    `communication_date`, default This Month like the web) and CSV export of
 *    the listed rows;
 *  - "Log" → manual form or the AI "Describe it" intake;
 *  - role permissions (`customer_communication` add/edit/delete/export) gate
 *    the same actions the web gates.
 *
 * Data: the whole logger is fetched once (it is low-volume, same as web) and
 * scoped to the app-wide selected site by `site_name` — the table keys rows
 * by site NAME, so the site code is resolved to `sites.name` first and
 * matched trimmed + case-insensitively, exactly like the web. Because the
 * list is one site, the web's hover "by site" breakdown on the counters is
 * not shown (it would always be a single line).
 */
import { ChipTabs } from "@/components/jo/ChipTabs";
import { useNavInsets } from "@/components/jo/navInsets";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { eq } from "drizzle-orm";
import { Bx, type BxName } from "@/components/jo/Bx";
import { Building2, Inbox, MessagesSquare, Plus } from "@/components/jo/bxIcons";
import { ResourcesTabs } from "@/components/jo/OpsTabs";
import {
  DateButton,
  EmptyState,
  Fab,
  JoPage,
  SearchField,
  Shimmer,
  Toast,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSelectedSiteCode } from "@/services/SiteSelection";
import AttendanceService, { type Site } from "@/services/AttendanceService";
import CustomerCommunicationService, {
  type CommPerson,
  type CommRow,
} from "@/services/CustomerCommunicationService";
import { db, userSites } from "@/database";
import logger from "@/utils/logger";
import { saveTextFile, toCsv } from "@/utils/fileExport";
import { CommAiIntake } from "@/components/comms/CommAiIntake";
import { CommCard } from "@/components/comms/CommCard";
import { CommChooser, type CommCreateMode } from "@/components/comms/CommChooser";
import { CommDateSheet } from "@/components/comms/CommDateSheet";
import { CommDetail } from "@/components/comms/CommDetail";
import { CommForm, blankForm, formFromDraft, formFromRow, type FormState } from "@/components/comms/CommForm";
import { CommSheet } from "@/components/comms/CommSheet";
import { OfflineNotice } from "@/components/comms/fields";
import {
  DEFAULT_DATE_PRESET,
  EXPORT_FILENAME,
  dateRangeLabel,
  dayDiff,
  exportRows,
  resolveDateRange,
  siteKey,
  splitList,
  statusOf,
  streamOf,
  todayStr,
  type DatePresetKey,
  type Stream,
} from "@/components/comms/lib";

type StreamTab = Stream | "all";

type SheetState =
  | null
  | { mode: "detail"; id: string }
  | {
      mode: "form";
      editingId: string | null;
      fromDetail: boolean;
      /** The AI intake's draft, and what it was drafted from. */
      prefill?: FormState;
      aiSources?: string[];
      /** Remounts the form for every new draft. */
      nonce: number;
    }
  | { mode: "ai"; nonce: number };

interface Counter {
  label: string;
  value: number;
  unit: string;
  note: string;
  icon: BxName;
  color: string;
  /** Statuses this card narrows the list to; `null` = the card only resets. */
  filter: string[] | null;
  /** Tab to jump to before applying the filter. */
  goStream?: StreamTab;
}

const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  exportBtn: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.09)" : t.lineMid,
    backgroundColor: t.input,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  counters: { gap: 8, paddingHorizontal: 16 },
  counter: {
    width: 172,
    minHeight: 124,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderWidth: 1,
    backgroundColor: t.card,
  },
  counterLabel: { ...f.t(12, 500), color: t.ink3, flex: 1 },
  counterValue: { ...f.d(26, -0.03) },
  counterUnit: { ...f.t(11.5), color: t.muted },
  counterNote: { ...f.t(11), color: t.muted, marginTop: 6, lineHeight: 15 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 90 },
}));

export default function ClientCommunicationScreen() {
  const t = useJoTheme();
  const s = useStyles();
  const { clearance } = useNavInsets();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const userName = user?.name || user?.full_name || user?.email || "You";
  const userEmail = user?.email || null;
  const { isConnected } = useNetworkStatus();
  const online = isConnected !== false;

  // Role permission matrix (Settings › Roles & Permissions) — UI only, same
  // as the web `useModulePermissions`; the API authorizes every write.
  const { can } = usePermissions();
  const canAdd = can("customer_communication", "add");
  const canEdit = can("customer_communication", "edit");
  const canDelete = can("customer_communication", "delete");
  const canExport = can("customer_communication", "export");

  // ── Sites (same pattern as Home: local user_sites first, then the API) ──
  // The site is picked by the pill in <ResourcesTabs /> (app-wide, broadcast);
  // this screen only follows it.
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [siteCode] = useSelectedSiteCode(userId);

  const loadSites = useCallback(async () => {
    if (!userId) return;
    try {
      const local = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, userId))
        .catch(() => [] as { site_code: string; site_name: string }[]);
      const cached: Site[] = local.map((r: { site_code: string; site_name: string }) => ({
        site_code: r.site_code,
        name: r.site_name,
      }));
      if (cached.length) setSites(cached);
      const net = await NetInfo.fetch();
      if (net.isConnected === true) {
        const fresh = await AttendanceService.getUserSites(userId, "JouleCool").catch(() => [] as Site[]);
        if (fresh.length) setSites(fresh);
      }
    } catch (error) {
      logger.error("Comms loadSites failed", { error });
    } finally {
      setSitesLoaded(true);
    }
  }, [userId]);

  const activeSite = useMemo(
    () => sites.find((x) => x.site_code === siteCode) ?? sites[0] ?? null,
    [sites, siteCode],
  );
  const siteName = activeSite?.name || activeSite?.site_code || "";

  // ── Entries ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<CommRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [people, setPeople] = useState<CommPerson[]>([]);
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++reqSeq.current;
    const res = await CustomerCommunicationService.list(userId);
    // A slower, older request must never overwrite a newer answer.
    if (seq !== reqSeq.current) return;
    if (res.success) {
      setRows(res.data);
      setFromCache(!!res.isFromCache);
      setLoadError("");
    } else {
      setLoadError(res.error);
    }
    setLoaded(true);
  }, [userId]);

  // Focus, app-foreground and a throttled poll — the same refresh hook Home uses.
  const syncAll = useCallback(async () => {
    await Promise.all([loadSites(), load()]);
  }, [loadSites, load]);
  useAutoSync(syncAll, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    CustomerCommunicationService.people(userId).then((p) => {
      if (!cancelled) setPeople(p);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadSites()]);
    setRefreshing(false);
  }, [load, loadSites]);

  // ── View state ────────────────────────────────────────────────────────
  const [stream, setStream] = useState<StreamTab>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  /** Label of the counter card whose filter is applied ("" = none). */
  const [activeCounter, setActiveCounter] = useState("");
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<DatePresetKey>(DEFAULT_DATE_PRESET);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [dateSheet, setDateSheet] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState("");
  const hideToast = useCallback(() => setToast(""), []);
  const nonce = useRef(0);

  // A counter filter belongs to the site it was set on — clear it when the
  // site pill switches site. Adjusted during render (React's "store the
  // previous value" pattern).
  const activeSiteCode = activeSite?.site_code ?? null;
  const [filterSite, setFilterSite] = useState(activeSiteCode);
  if (filterSite !== activeSiteCode) {
    setFilterSite(activeSiteCode);
    setStatusFilter([]);
    setActiveCounter("");
  }

  const today = todayStr();
  const { from: dateFrom, to: dateTo } = useMemo(
    () => resolveDateRange(preset, custom.from, custom.to, today),
    [preset, custom, today],
  );

  // ── Derived collections (web page.tsx, on the site-scoped rows) ────────
  const scoped = useMemo(() => {
    if (!siteName) return [];
    const key = siteKey(siteName);
    return rows.filter((r) => siteKey(r.site_name) === key);
  }, [rows, siteName]);

  const stats = useMemo(() => {
    const actions = scoped.filter((e) => streamOf(e) === "action");
    const feedback = scoped.filter((e) => streamOf(e) === "feedback");
    const openActions = actions.filter((e) => statusOf(e) !== "Closed");
    const overdue = openActions.filter((e) => e.expected_closure_date && dayDiff(e.expected_closure_date, today) < 0);
    const dueSoon = openActions.filter((e) => {
      const d = e.expected_closure_date ? dayDiff(e.expected_closure_date, today) : 99;
      return d >= 0 && d <= 7;
    });
    const closedRecent = actions.filter(
      (e) => statusOf(e) === "Closed" && e.expected_closure_date && dayDiff(e.expected_closure_date, today) > -60,
    );
    const noSummary = actions.filter((e) => statusOf(e) === "Closed" && !String(e.resolution_summary || "").trim());
    const types = (e: CommRow) => splitList(e.communication_type);
    return {
      actions: actions.length,
      feedback: feedback.length,
      openActions: openActions.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      closedRecent: closedRecent.length,
      noSummary: noSummary.length,
      fbNew: feedback.filter((e) => statusOf(e) === "Logged").length,
      fbShared: feedback.filter((e) => statusOf(e) === "Shared with team").length,
      fbPraise: feedback.filter((e) => types(e).includes("Appreciation") || types(e).includes("Feedback")).length,
      fbReview: feedback.filter((e) => types(e).includes("Meeting / Review") || types(e).includes("Update")).length,
    };
  }, [scoped, today]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((e) => {
        if (stream !== "all" && streamOf(e) !== stream) return false;
        if (statusFilter.length && !statusFilter.includes(statusOf(e))) return false;
        const d = e.communication_date || "";
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        if (q) {
          const hay = [e.cc_id, e.detailed_description, e.input_from, e.assignee, e.expected_action]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ka = (a.communication_date || "") + (a.communication_time || "");
        const kb = (b.communication_date || "") + (b.communication_time || "");
        return kb < ka ? -1 : kb > ka ? 1 : 0;
      });
  }, [scoped, stream, statusFilter, dateFrom, dateTo, query]);

  // Web colour tokens → app tones: thunder → ink, flame → warn,
  // danger → bad, success → ok, sky → info.
  const counters: Counter[] =
    stream === "feedback"
      ? [
          { label: "Feedback logged", value: stats.feedback, unit: "entries", note: "No owner, no action, no due date", icon: "bx-message-rounded", color: t.ink, filter: null },
          { label: "Awaiting acknowledgement", value: stats.fbNew, unit: "unread", note: stats.fbNew ? "Logged but not yet acknowledged" : "Everything has been acknowledged", icon: "bx-bell", color: stats.fbNew ? t.warn : t.ok, filter: ["Logged"] },
          { label: "Shared with team", value: stats.fbShared, unit: "circulated", note: "Read out or passed on to the site team", icon: "bx-share-alt", color: t.ok, filter: ["Shared with team"] },
          { label: "Appreciation", value: stats.fbPraise, unit: "received", note: "Positive notes from the client side", icon: "bx-like", color: t.info, filter: null },
          { label: "Reviews & updates", value: stats.fbReview, unit: "logged", note: "Meeting minutes and client updates on record", icon: "bx-group", color: t.ink, filter: null },
        ]
      : [
          { label: "Open action items", value: stats.openActions, unit: "live", note: "Assigned and not yet closed", icon: "bx-flag", color: t.ink, filter: ["Open", "In Progress", "Blocked"], goStream: "action" },
          { label: "Past closure date", value: stats.overdue, unit: "overdue", note: stats.overdue ? "Owners have missed the committed date" : "Nothing past its date", icon: "bx-time-five", color: stats.overdue ? t.bad : t.ok, filter: null, goStream: "action" },
          { label: "Due within 7 days", value: stats.dueSoon, unit: "items", note: "Closing this week", icon: "bx-calendar-exclamation", color: t.warn, filter: null, goStream: "action" },
          { label: "Closed", value: stats.closedRecent, unit: "last 60 days", note: stats.noSummary ? `${stats.noSummary} closed without a resolution summary` : "All closures carry a summary", icon: "bx-check-circle", color: t.ok, filter: ["Closed"], goStream: "action" },
          { label: "General feedback", value: stats.feedback, unit: "logged", note: "Kept separately — no owner, no due date", icon: "bx-message-rounded", color: t.info, filter: null, goStream: "feedback" },
        ];

  const pickStream = (key: StreamTab) => {
    setStream(key);
    setStatusFilter([]);
    setActiveCounter("");
  };

  /** Web `pickCounter`: a filtering card stays lit; a second tap clears it. */
  const pickCounter = (c: Counter) => {
    if (activeCounter === c.label) {
      setStatusFilter([]);
      setActiveCounter("");
      return;
    }
    if (c.goStream) setStream(c.goStream);
    setStatusFilter(c.filter ?? []);
    setActiveCounter(c.filter ? c.label : "");
  };

  const hasFilters = Boolean(query.trim() || statusFilter.length || dateFrom || dateTo);
  const clearFilters = () => {
    setQuery("");
    setStatusFilter([]);
    setActiveCounter("");
    setPreset("all");
  };

  // ── People for the assignee pickers (people ∪ names already in data) ──
  const assigneePeople: CommPerson[] = useMemo(() => {
    const roleByName = new Map(people.map((p) => [p.name, p.role]));
    const names = new Set<string>(people.map((p) => p.name));
    rows.forEach((r) => r.assignee && names.add(r.assignee));
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, role: roleByName.get(name) || "" }));
  }, [people, rows]);

  // ── Sheet plumbing ────────────────────────────────────────────────────
  const rowById = useCallback((id: string | null) => (id ? rows.find((r) => r.id === id) ?? null : null), [rows]);
  const detailRow = sheet?.mode === "detail" ? rowById(sheet.id) : null;
  const editingRow = sheet?.mode === "form" ? rowById(sheet.editingId) : null;

  const upsertRow = useCallback((row: CommRow) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === row.id);
      if (i === -1) return [row, ...prev];
      const next = prev.slice();
      next[i] = row;
      return next;
    });
  }, []);

  const openRow = useCallback((row: CommRow) => setSheet({ mode: "detail", id: row.id }), []);

  const openLog = () => {
    if (!online) {
      setToast("You're offline — logging needs a connection");
      return;
    }
    setChooser(true);
  };

  const pickCreateMode = (mode: CommCreateMode) => {
    setChooser(false);
    // Let the chooser finish closing before the full sheet presents — iOS
    // drops the second of two modals presented at once.
    setTimeout(() => {
      nonce.current += 1;
      setSheet(
        mode === "ai"
          ? { mode: "ai", nonce: nonce.current }
          : { mode: "form", editingId: null, fromDetail: false, nonce: nonce.current },
      );
    }, 300);
  };

  const exportCsv = async () => {
    if (exporting) return;
    if (!listed.length) {
      setToast("Nothing in this view to export");
      return;
    }
    setExporting(true);
    try {
      const msg = await saveTextFile(toCsv(exportRows(listed)), EXPORT_FILENAME);
      if (msg) setToast(`${listed.length} ${listed.length === 1 ? "entry" : "entries"} exported · ${msg}`);
    } catch (error) {
      logger.warn("Comms CSV export failed", { error });
      setToast("Couldn't save the export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  const loading = !loaded || (!sitesLoaded && sites.length === 0);
  const noSite = sitesLoaded && sites.length === 0;

  const overdueMeta = stats.overdue ? `${stats.actions} · ${stats.overdue} overdue` : stats.actions;

  const header = (
    <View style={s.top}>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Reference, description or person"
        style={{ marginTop: 12 }}
      />

      {/* Same chip tabs as SLA's Overall · Comfort · … */}
      <ChipTabs
        items={[
          { key: "all" as StreamTab, label: "All communications", icon: "bx-envelope", color: t.accentInk, meta: loading ? null : scoped.length },
          { key: "action" as StreamTab, label: "Action Items", icon: "bx-flag", color: stats.overdue ? t.bad : t.accentInk, meta: loading ? null : overdueMeta },
          { key: "feedback" as StreamTab, label: "General Feedback", icon: "bx-message-rounded", color: t.accentInk, meta: loading ? null : stats.feedback },
        ]}
        value={stream}
        onChange={pickStream}
        style={{ marginTop: 12 }}
      />

      <View style={s.toolbar}>
        <DateButton
          label={dateRangeLabel(preset, dateFrom, dateTo)}
          onPress={() => setDateSheet(true)}
          style={{ flexShrink: 1 }}
        />
        <View style={{ flex: 1 }} />
        {canExport ? (
          <TouchableOpacity
            onPress={() => void exportCsv()}
            disabled={exporting || loading}
            style={[s.exportBtn, { opacity: exporting || loading ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Export ${listed.length} listed entries as CSV`}
            accessibilityState={{ busy: exporting }}
          >
            {exporting ? <ActivityIndicator size="small" color={t.muted} /> : <Bx name="bx-download" size={16} color={t.accentInk} />}
            <Text style={[f.t(13, 500), { color: t.ink }]}>Export</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const countersRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -16, flexGrow: 0 }}
      contentContainerStyle={s.counters}
    >
      {counters.map((c) => {
        const on = activeCounter === c.label;
        return (
          <TouchableOpacity
            key={c.label}
            onPress={() => pickCounter(c)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${c.label}: ${loading ? "loading" : `${c.value} ${c.unit}`}. ${c.note}${on ? ". Filter on" : ""}`}
            style={[s.counter, { borderColor: on ? t.accent : t.cardBorder, backgroundColor: on ? t.accentTint : t.card }]}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
              <Bx name={c.icon} size={15} color={c.color} />
              <Text style={s.counterLabel} numberOfLines={2}>
                {c.label}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 }}>
              <Text style={[s.counterValue, { color: c.color }]}>{loading ? "–" : c.value}</Text>
              <Text style={s.counterUnit} numberOfLines={1}>
                {c.unit}
              </Text>
            </View>
            <Text style={s.counterNote} numberOfLines={2}>
              {loading ? " " : c.note}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const notice =
    loadError && rows.length > 0 && !fromCache ? (
      <OfflineNotice text={`Couldn't refresh: ${loadError}. Showing the last list.`} style={{ marginTop: 10 }} />
    ) : fromCache || !online ? (
      <OfflineNotice
        text={fromCache ? "Offline · showing the last synced list. Changes need a connection." : "You're offline. Changes need a connection."}
        style={{ marginTop: 10 }}
      />
    ) : null;

  let body: React.ReactNode;
  if (noSite) {
    body = (
      <View style={{ padding: 16 }}>
        <EmptyState icon={Building2} title="No site assigned" sub="Ask an admin to add you to a site to see its client communication." />
      </View>
    );
  } else if (loading) {
    body = (
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        {countersRow}
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} height={138} radius={22} />
        ))}
      </View>
    );
  } else if (loadError && rows.length === 0) {
    body = (
      <View style={{ padding: 16 }}>
        <EmptyState
          icon={MessagesSquare}
          title="Couldn't load client communication"
          sub={loadError}
          action={{ label: "Try again", onPress: () => void onRefresh() }}
        />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={listed}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <CommCard row={item} today={today} onPress={openRow} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={[s.list, { paddingBottom: clearance + 64 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            {countersRow}
            {notice}
          </View>
        }
        ListEmptyComponent={
          hasFilters ? (
            <EmptyState
              icon={Inbox}
              title="Nothing matches these filters"
              sub="Try a wider date range, another tab or a different search."
              action={{ label: "Clear filters", onPress: clearFilters }}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nothing logged yet"
              sub={canAdd ? "Tap Log to record the first communication for this site." : "Communications logged for this site show here."}
            />
          )
        }
      />
    );
  }

  return (
    <JoPage>
      <ResourcesTabs />
      {header}
      <View style={{ flex: 1 }}>{body}</View>
      {!noSite && canAdd ? <Fab label="Log" icon={Plus} onPress={openLog} /> : null}
      {!sheet ? <Toast message={toast} onHide={hideToast} /> : null}

      <CommDateSheet
        visible={dateSheet}
        preset={preset}
        from={dateFrom}
        to={dateTo}
        onClose={() => setDateSheet(false)}
        onPickPreset={setPreset}
        onCustomRange={(from, to) => {
          setCustom({ from, to });
          setPreset("custom");
        }}
      />

      <CommChooser visible={chooser} onClose={() => setChooser(false)} onPick={pickCreateMode} />

      <CommSheet
        visible={!!sheet}
        kicker={
          sheet?.mode === "detail"
            ? detailRow?.cc_id || undefined
            : editingRow
              ? editingRow.cc_id || undefined
              : siteName || undefined
        }
        title={
          sheet?.mode === "detail"
            ? "Entry"
            : sheet?.mode === "ai"
              ? "Describe it"
              : editingRow
                ? "Edit entry"
                : "Log communication"
        }
        onClose={() => setSheet(null)}
        overlay={sheet ? <Toast message={toast} onHide={hideToast} /> : null}
        onBack={
          sheet?.mode === "form" && sheet.fromDetail && sheet.editingId
            ? () => setSheet({ mode: "detail", id: sheet.editingId as string })
            : undefined
        }
      >
        {(bottomInset) =>
          sheet?.mode === "detail" ? (
            detailRow ? (
              <CommDetail
                key={detailRow.id}
                row={detailRow}
                people={people}
                allRows={rows}
                userName={userName}
                userEmail={userEmail}
                online={online}
                bottomInset={bottomInset}
                canEdit={canEdit}
                canDelete={canDelete}
                onUpdated={(row, msg) => {
                  // Converting feedback to an action follows it to its tab (web convertToAction).
                  if (stream !== "all" && streamOf(row) !== stream) {
                    setStream(streamOf(row));
                    setStatusFilter([]);
                    setActiveCounter("");
                  }
                  upsertRow(row);
                  setToast(msg);
                }}
                onDeleted={(row) => {
                  setRows((prev) => prev.filter((r) => r.id !== row.id));
                  setSheet(null);
                  setToast(`${row.cc_id || "Entry"} deleted`);
                }}
                onEdit={() => {
                  nonce.current += 1;
                  setSheet({ mode: "form", editingId: detailRow.id, fromDetail: true, nonce: nonce.current });
                }}
              />
            ) : (
              <View style={{ padding: 16 }}>
                <EmptyState icon={Inbox} title="Entry not found" sub="It may have been deleted. Pull to refresh the list." />
              </View>
            )
          ) : sheet?.mode === "ai" ? (
            <CommAiIntake
              key={`ai-${sheet.nonce}`}
              siteNames={sites.map((x) => x.name).filter(Boolean)}
              defaultSite={siteName}
              people={assigneePeople}
              online={online}
              bottomInset={bottomInset}
              onCancel={() => setSheet(null)}
              onDrafted={(outcome) => {
                nonce.current += 1;
                setSheet({
                  mode: "form",
                  editingId: null,
                  fromDetail: false,
                  prefill: formFromDraft(outcome, siteName),
                  aiSources: outcome.sources,
                  nonce: nonce.current,
                });
              }}
            />
          ) : sheet?.mode === "form" ? (
            <CommForm
              key={`${sheet.editingId ?? "new"}-${sheet.nonce}`}
              initial={editingRow ? formFromRow(editingRow) : sheet.prefill ?? blankForm(siteName)}
              editing={editingRow}
              rows={rows}
              siteNames={sites.map((x) => x.name).filter(Boolean)}
              people={people}
              userName={userName}
              userEmail={userEmail}
              online={online}
              bottomInset={bottomInset}
              aiSources={editingRow ? null : sheet.aiSources ?? null}
              onSaved={(row, msg) => {
                upsertRow(row);
                setStream(streamOf(row));
                setStatusFilter([]);
                setActiveCounter("");
                setSheet(null);
                setToast(msg);
              }}
            />
          ) : null
        }
      </CommSheet>
    </JoPage>
  );
}
