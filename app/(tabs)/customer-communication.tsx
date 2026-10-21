/**
 * Client communication — artboard "Client comms" (app.dc.html `r_comms`).
 *
 * Two streams like the web workspace (web/src/app/customer-communication):
 * action items (owner, closure date, open until Closed) and general feedback
 * (for the record). Counter cards toggle a filter; rows open a detail sheet
 * with status / assignment updates; "Log" opens the create form.
 *
 * Data: the whole logger is fetched once (it is low-volume, same as web) and
 * scoped to the app-wide selected site by `site_name` — the table keys rows
 * by site NAME, so the site code is resolved to `sites.name` first and
 * matched trimmed + case-insensitively, exactly like the web.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { eq } from "drizzle-orm";
import { Building2, ChevronDown, Inbox, MessagesSquare, Plus, Search, X } from "lucide-react-native";
import {
  EmptyState,
  Fab,
  IconButton,
  JoPage,
  JoSheet,
  SearchField,
  Segmented,
  SheetOption,
  Shimmer,
  Toast,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { useAuth } from "@/contexts/AuthContext";
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
import { CommCard } from "@/components/comms/CommCard";
import { CommDetail } from "@/components/comms/CommDetail";
import { CommForm, blankForm, formFromRow } from "@/components/comms/CommForm";
import { CommSheet } from "@/components/comms/CommSheet";
import { OfflineNotice } from "@/components/comms/fields";
import {
  closedOn,
  isOverdue,
  monthShort,
  siteKey,
  splitList,
  statusOf,
  streamOf,
  todayStr,
  type Stream,
} from "@/components/comms/lib";

type Filter = "all" | "open" | "overdue" | "closed" | "month" | "appr" | "meet";

type SheetState =
  | null
  | { mode: "detail"; id: string }
  | { mode: "form"; editingId: string | null; fromDetail: boolean };

const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  siteChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingLeft: 8,
    paddingRight: 9,
    borderRadius: 14,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.09)" : t.lineMid,
    maxWidth: 260,
  },
  siteText: { ...f.t(12.5, 500), color: t.ink2, flexShrink: 1 },
  title: { ...f.d(28, -0.025), color: t.ink, marginTop: 4 },
  counters: { flexDirection: "row", gap: 6, marginTop: 10 },
  counter: { flex: 1, minWidth: 0, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  counterValue: { ...f.d(22, -0.03) },
  counterLabel: { ...f.t(11), color: t.ink3, marginTop: 4 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 90 },
}));

export default function ClientCommunicationScreen() {
  const t = useJoTheme();
  const s = useStyles();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const userName = user?.name || user?.full_name || user?.email || "You";
  const userEmail = user?.email || null;
  const { isConnected } = useNetworkStatus();
  const online = isConnected !== false;

  // ── Sites (same pattern as Home: local user_sites first, then the API) ──
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [siteCode, setSiteCode] = useSelectedSiteCode(userId);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);

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
  const [stream, setStream] = useState<Stream>("action");
  const [filter, setFilter] = useState<Filter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState("");
  const hideToast = useCallback(() => setToast(""), []);

  const today = todayStr();
  const month = today.slice(0, 7);
  const monthLabel = monthShort(today);

  const scoped = useMemo(() => {
    if (!siteName) return [];
    const key = siteKey(siteName);
    return rows.filter((r) => siteKey(r.site_name) === key);
  }, [rows, siteName]);

  const byStream = useMemo(() => {
    const action: CommRow[] = [];
    const feedback: CommRow[] = [];
    for (const r of scoped) (streamOf(r) === "action" ? action : feedback).push(r);
    return { action, feedback };
  }, [scoped]);

  const counts = useMemo(() => {
    const a = byStream.action;
    const fb = byStream.feedback;
    const hasType = (r: CommRow, k: string) => splitList(r.communication_type).includes(k);
    return {
      openAction: a.filter((r) => statusOf(r) !== "Closed").length,
      openFeedback: fb.filter((r) => statusOf(r) !== "Closed").length,
      overdue: a.filter((r) => isOverdue(r, today)).length,
      closedMonth: a.filter((r) => statusOf(r) === "Closed" && closedOn(r)?.startsWith(month)).length,
      loggedMonth: fb.filter((r) => (r.communication_date || "").startsWith(month)).length,
      appr: fb.filter((r) => hasType(r, "Appreciation")).length,
      meet: fb.filter((r) => hasType(r, "Meeting / Review")).length,
    };
  }, [byStream, today, month]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasType = (r: CommRow, k: string) => splitList(r.communication_type).includes(k);
    return byStream[stream]
      .filter((r) => {
        switch (filter) {
          case "open":
            return statusOf(r) !== "Closed";
          case "overdue":
            return isOverdue(r, today);
          case "closed":
            return statusOf(r) === "Closed" && !!closedOn(r)?.startsWith(month);
          case "month":
            return (r.communication_date || "").startsWith(month);
          case "appr":
            return hasType(r, "Appreciation");
          case "meet":
            return hasType(r, "Meeting / Review");
          default:
            return true;
        }
      })
      .filter((r) => {
        if (!q) return true;
        return [r.cc_id, r.detailed_description, r.input_from, r.assignee, r.expected_action]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const ka = (a.communication_date || "") + (a.communication_time || "");
        const kb = (b.communication_date || "") + (b.communication_time || "");
        return kb < ka ? -1 : kb > ka ? 1 : 0;
      });
  }, [byStream, stream, filter, query, today, month]);

  const counters: { key: Filter; label: string; value: number; color: string }[] =
    stream === "action"
      ? [
          { key: "open", label: "Open", value: counts.openAction, color: t.ink },
          { key: "overdue", label: "Overdue", value: counts.overdue, color: t.bad },
          { key: "closed", label: `Closed · ${monthLabel}`, value: counts.closedMonth, color: t.ok },
        ]
      : [
          { key: "month", label: `Logged · ${monthLabel}`, value: counts.loggedMonth, color: t.ink },
          { key: "appr", label: "Appreciation", value: counts.appr, color: t.ok },
          { key: "meet", label: "Reviews", value: counts.meet, color: t.info },
        ];

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
    setSheet({ mode: "form", editingId: null, fromDetail: false });
  };

  const pickStream = (k: Stream) => {
    setStream(k);
    setFilter("all");
  };

  // ── Render ────────────────────────────────────────────────────────────
  const loading = !loaded || (!sitesLoaded && sites.length === 0);
  const noSite = sitesLoaded && sites.length === 0;

  const header = (
    <View style={s.top}>
      <View style={s.head}>
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <TouchableOpacity
            style={s.siteChip}
            onPress={() => setSitePickerOpen(true)}
            disabled={sites.length < 2}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Site: ${siteName || "none"}${sites.length > 1 ? ", change" : ""}`}
          >
            <Building2 size={14} color={t.accentInk} />
            <Text style={s.siteText} numberOfLines={1}>
              {siteName || (sitesLoaded ? "No site" : "Loading…")}
            </Text>
            {sites.length > 1 ? <ChevronDown size={15} color={t.muted} /> : null}
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>
            Client comms
          </Text>
        </View>
        <View style={{ marginTop: 4 }}>
          <IconButton
            icon={searchOpen ? X : Search}
            label={searchOpen ? "Close search" : "Search"}
            onPress={() => {
              if (searchOpen) setQuery("");
              setSearchOpen((o) => !o);
            }}
          />
        </View>
      </View>

      {searchOpen ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Ref, description, person"
          style={{ marginTop: 12 }}
        />
      ) : null}

      <Segmented
        items={[
          { key: "action" as Stream, label: "Action items", count: counts.openAction },
          { key: "feedback" as Stream, label: "Feedback", count: counts.openFeedback },
        ]}
        value={stream}
        onChange={pickStream}
        height={40}
        style={{ marginTop: 14 }}
      />

      <View style={s.counters}>
        {counters.map((c) => {
          const on = filter === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setFilter((cur) => (cur === c.key ? "all" : c.key))}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c.label}: ${c.value}${on ? ", filter on" : ""}`}
              style={[
                s.counter,
                { backgroundColor: on ? t.line : t.card, borderColor: on ? t.accent : t.cardBorder },
              ]}
            >
              <Text style={[s.counterValue, { color: c.color }]}>{loading ? "–" : c.value}</Text>
              <Text style={s.counterLabel} numberOfLines={1}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loadError && rows.length > 0 && !fromCache ? (
        <OfflineNotice text={`Couldn't refresh: ${loadError}. Showing the last list.`} style={{ marginTop: 10 }} />
      ) : fromCache || !online ? (
        <OfflineNotice
          text={fromCache ? "Offline · showing the last synced list. Changes need a connection." : "You're offline. Changes need a connection."}
          style={{ marginTop: 10 }}
        />
      ) : null}
    </View>
  );

  const emptyCopy = (): { title: string; sub: string } => {
    if (query.trim()) return { title: "No matches", sub: `Nothing in this view matches “${query.trim()}”.` };
    switch (filter) {
      case "open":
        return { title: "No open action items", sub: "Everything raised at this site is closed." };
      case "overdue":
        return { title: "Nothing overdue", sub: "Every open item is within its closure date." };
      case "closed":
        return { title: `Nothing closed in ${monthLabel}`, sub: "Items closed this month show here." };
      case "month":
        return { title: `No feedback logged in ${monthLabel}`, sub: "Feedback logged this month shows here." };
      case "appr":
        return { title: "No appreciation yet", sub: "Positive notes from the client show here." };
      case "meet":
        return { title: "No reviews logged", sub: "Meeting and review notes show here." };
      default:
        return stream === "action"
          ? { title: "No action items", sub: "Client asks that need an owner and a closure date show here. Tap Log to add one." }
          : { title: "No feedback logged", sub: "Appreciation, updates and review notes show here. Tap Log to add one." };
    }
  };

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
        {[0, 1, 2, 3].map((i) => (
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
    const empty = emptyCopy();
    body = (
      <FlatList
        data={listed}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <CommCard row={item} today={today} onPress={openRow} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />}
        ListEmptyComponent={
          <EmptyState
            icon={Inbox}
            title={empty.title}
            sub={empty.sub}
            action={filter !== "all" || query ? { label: "Show all", onPress: () => { setFilter("all"); setQuery(""); } } : undefined}
          />
        }
      />
    );
  }

  return (
    <JoPage>
      {header}
      <View style={{ flex: 1 }}>{body}</View>
      {!noSite ? <Fab label="Log" icon={Plus} onPress={openLog} /> : null}
      {!sheet ? <Toast message={toast} onHide={hideToast} /> : null}

      <JoSheet
        visible={sitePickerOpen}
        onClose={() => setSitePickerOpen(false)}
        title="Site"
        subtitle={`Applies to every module. You have access to ${sites.length} site${sites.length === 1 ? "" : "s"}.`}
      >
        <ScrollView style={{ marginTop: 14 }} contentContainerStyle={{ gap: 6 }}>
          {sites.map((site) => (
            <SheetOption
              key={site.site_code}
              label={site.name || site.site_code}
              meta={site.site_code}
              metaStyle={f.m(11)}
              selected={site.site_code === activeSite?.site_code}
              onPress={() => {
                setSiteCode(site.site_code);
                setFilter("all");
                setSitePickerOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </JoSheet>

      <CommSheet
        visible={!!sheet}
        kicker={
          sheet?.mode === "detail"
            ? detailRow?.cc_id || undefined
            : editingRow
              ? editingRow.cc_id || undefined
              : siteName || undefined
        }
        title={sheet?.mode === "detail" ? "Entry" : editingRow ? "Edit entry" : "Log communication"}
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
                onUpdated={(row, msg) => {
                  upsertRow(row);
                  setToast(msg);
                }}
                onEdit={() => setSheet({ mode: "form", editingId: detailRow.id, fromDetail: true })}
              />
            ) : (
              <View style={{ padding: 16 }}>
                <EmptyState icon={Inbox} title="Entry not found" sub="It may have been deleted. Pull to refresh the list." />
              </View>
            )
          ) : sheet?.mode === "form" ? (
            <CommForm
              key={sheet.editingId ?? "new"}
              initial={editingRow ? formFromRow(editingRow) : blankForm(siteName)}
              editing={editingRow}
              rows={rows}
              siteNames={sites.map((x) => x.name).filter(Boolean)}
              people={people}
              userName={userName}
              userEmail={userEmail}
              online={online}
              bottomInset={bottomInset}
              onSaved={(row, msg) => {
                upsertRow(row);
                setStream(streamOf(row));
                setFilter("all");
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
