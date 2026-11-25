/**
 * Shared pieces of the Consumption Trend Sheet screens (the Ops "Trend Sheet"
 * tab and its entry, summary and month screens).
 *
 * Layout and copy follow the eight mobile artboards of the "Consumption Trend
 * Sheet – Mobile" canvas. Colours do not: everything here reads `useJoTheme`
 * tokens (`ok` on target, `warn` below target, `bad` over baseline), so both
 * the light and the dark theme work. Meaning is never carried by colour
 * alone: every tone comes with its own words or icon.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx, type BxName } from "@/components/jo/Bx";
import { Card, IconButton, JoPage, PrimaryButton, f, useJoTheme, type JoTheme } from "@/components/jo/ui";
import * as Haptics from "expo-haptics";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import syncEngine from "@/services/SyncEngine";
import TrendSheetService, {
  isTrendCalcOutdated,
  subscribeTrendSheet,
  type TrendSaveFields,
} from "@/services/TrendSheetService";
import UpdateService from "@/services/UpdateService";
import StoreUpdateService from "@/services/StoreUpdateService";
import { showAlert } from "@/utils/alert";
import { consumeRouteParams, setRouteParams } from "@/utils/routeParams";
import { istTodayString } from "@/utils/istDate";
import { isElectricityAddon, type TrendCategory } from "@/utils/trendCalc";
import {
  addDaysYmd,
  dateLabel,
  dayMonthLabel,
  firstSkippedDay,
  formatIndian,
  formatPct,
  formatTargetPct,
  gaugeScale,
  inSentence,
  relativeDayLabel,
  type SavingSummary,
  type TrendDayView,
  type TrendTone,
  type TrendViewCategory,
} from "@/utils/trendSheet";

/* ── Routes ────────────────────────────────────────────────────────────── */

export const TREND_HUB = "/(tabs)/trend-sheet";

export type TrendRoute = "/trend-electricity" | "/trend-dg" | "/trend-fuel" | "/trend-summary" | "/trend-month";

export interface TrendParams {
  siteCode?: string;
  date?: string;
  category?: string;
  month?: string;
  [key: string]: string | undefined;
}

/** The entry screen a category is typed on. */
export function routeForCategory(c: Pick<TrendViewCategory, "kind">): TrendRoute {
  if (c.kind === "meter") return "/trend-electricity";
  if (c.kind === "dg") return "/trend-dg";
  return "/trend-fuel";
}

/** Open (or, between entry screens, swap to) a trend screen with its params. */
export function goTrend(route: TrendRoute, params: TrendParams, replace = false) {
  setRouteParams(route, params);
  if (replace) router.replace(route as never);
  else router.push(route as never);
}

export function openCategory(siteCode: string, date: string, c: TrendViewCategory, replace = false) {
  goTrend(routeForCategory(c), { siteCode, date, category: c.category }, replace);
}

export function backToHub() {
  if (router.canGoBack()) router.back();
  else router.replace(TREND_HUB as never);
}

/** Params written by `goTrend`, read once (a `useRef(consume())` would read on every render). */
export function useTrendParams(route: TrendRoute): TrendParams {
  const [params] = useState(() => consumeRouteParams<TrendParams>(route));
  return params;
}

/** The first category of the day still to enter, after `current` when given. */
export function nextToEnter(view: TrendDayView, current?: TrendCategory): TrendViewCategory | null {
  const open = view.categories.filter((c) => !c.entered && c.category !== current);
  if (!open.length) return null;
  if (!current) return open[0];
  const order = view.categories.map((c) => c.category);
  const after = open.find((c) => order.indexOf(c.category) > order.indexOf(current));
  return after ?? open[0];
}

/* ── Loading a day ─────────────────────────────────────────────────────── */

export type TrendDayStatus =
  /** Nothing to show yet. */
  | "loading"
  | "ready"
  /** Never loaded on this phone and there is no connection. */
  | "offline"
  /** The server refused the day (site not set up, access lost, bad date). */
  | "error";

export interface TrendDayState {
  view: TrendDayView | null;
  status: TrendDayStatus;
  error: string | null;
  /** Showing the cached day because the last refresh did not reach the server. */
  stale: boolean;
  reload: () => Promise<void>;
}

/**
 * A day for the screens: the cached copy at once (with this phone's entries
 * laid over it), then the server's. It re-reads the cache whenever a save, a
 * sync answer or a pull changes it. A slow answer for a day the screen has
 * already left is dropped.
 */
export function useTrendDay(siteCode: string | null | undefined, date: string | null | undefined): TrendDayState {
  const key = siteCode && date ? `${siteCode}|${date}` : "";
  // What was loaded, and for which day: an answer for another day is never shown.
  const [loaded, setLoaded] = useState<{
    key: string;
    view: TrendDayView | null;
    status: TrendDayStatus;
    error: string | null;
    stale: boolean;
  }>({ key: "", view: null, status: "loading", error: null, stale: false });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!siteCode || !date) return;
    const mine = ++seq.current;
    const forKey = `${siteCode}|${date}`;
    // Neither call throws: a failed read is "nothing cached", a failed fetch says why.
    const cached = await TrendSheetService.viewFromCache(siteCode, date).catch(() => null);
    if (mine !== seq.current) return;
    if (cached) setLoaded({ key: forKey, view: cached, status: "ready", error: null, stale: false });
    const fresh = await TrendSheetService.fetchDay(siteCode, date);
    if (mine !== seq.current) return;
    if (fresh.ok) {
      const merged = await TrendSheetService.viewFromCache(siteCode, date).catch(() => null);
      if (mine !== seq.current) return;
      setLoaded(
        merged
          ? { key: forKey, view: merged, status: "ready", error: null, stale: false }
          : { key: forKey, view: null, status: "error", error: "This day could not be read back from the phone.", stale: false },
      );
    } else if (cached) {
      setLoaded({ key: forKey, view: cached, status: "ready", error: null, stale: true });
    } else {
      setLoaded({
        key: forKey,
        view: null,
        status: fresh.status === null ? "offline" : "error",
        error: fresh.error,
        stale: false,
      });
    }
  }, [siteCode, date]);

  useEffect(() => {
    // Every setState in `reload` runs after an await (a database read or a
    // request), never in the effect's own pass; the rule cannot see that
    // through the branches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  // A day shown from the phone because its read failed offline stays marked
  // stale until it is read again, and nothing else reads it again while the
  // screen stays open. Read it once the network is back, so the "no
  // connection" line goes as soon as the server answers.
  const { isConnected } = useNetworkStatus();
  const wasConnected = useRef(isConnected);
  const stale = loaded.key === key && loaded.stale;
  useEffect(() => {
    const cameBack = isConnected === true && wasConnected.current !== true;
    wasConnected.current = isConnected;
    if (cameBack && stale) void reload();
  }, [isConnected, stale, reload]);

  useEffect(() => {
    if (!siteCode || !date) return;
    const forKey = `${siteCode}|${date}`;
    return subscribeTrendSheet(() => {
      const mine = seq.current;
      TrendSheetService.viewFromCache(siteCode, date)
        .then((cached) => {
          if (mine !== seq.current || !cached) return;
          setLoaded((prev) => ({
            key: forKey,
            view: cached,
            status: "ready",
            error: null,
            stale: prev.key === forKey ? prev.stale : false,
          }));
        })
        .catch(() => {});
    });
  }, [siteCode, date]);

  if (loaded.key !== key) return { view: null, status: "loading", error: null, stale: false, reload };
  return { view: loaded.view, status: loaded.status, error: loaded.error, stale: loaded.stale, reload };
}

/* ── Look ──────────────────────────────────────────────────────────────── */

export function toneColor(t: JoTheme, tone: TrendTone): string {
  if (tone === "ok") return t.ok;
  if (tone === "warn") return t.warn;
  if (tone === "bad") return t.bad;
  return t.ink;
}

const CATEGORY_ICON: Record<TrendCategory, BxName> = {
  electricity: "bx-bolt-circle",
  dg: "bxs-car-battery",
  png: "bxs-flame",
  diesel: "bx-droplet",
  lpg: "bx-gas-pump",
  biodiesel: "bx-leaf",
  solar: "bx-sun",
  wind: "bx-wind",
};

export const categoryIcon = (category: TrendCategory): BxName => CATEGORY_ICON[category] ?? "bx-droplet";

/** "Until DG is entered." / "Until DG and Solar are entered.": what a provisional Electricity figure waits for. */
export function provisionalReason(view: TrendDayView): string {
  const open = view.categories
    .filter((c) => (c.kind === "dg" || c.kind === "generation") && !(c.entered && c.sync !== "failed"))
    .map((c) => c.label);
  if (!open.length) return "Until DG, Solar and Wind are entered.";
  const list = open.length === 1 ? open[0] : `${open.slice(0, -1).join(", ")} and ${open[open.length - 1]}`;
  return `Until ${list} ${open.length === 1 ? "is" : "are"} entered.`;
}

/** "Sunday baseline" on a Sunday with its own baseline, "Hourly baseline" for PNG by the hour. */
export function baselineLabel(c: Pick<TrendViewCategory, "baseline_kind">): string {
  if (c.baseline_kind === "sunday") return "Sunday baseline";
  if (c.baseline_kind === "hourly") return "Hourly baseline";
  return "Baseline";
}

/** The pill naming the baseline, shown only when it is not the everyday one. */
export function BaselineKindPill({ c }: { c: Pick<TrendViewCategory, "baseline_kind"> }) {
  if (c.baseline_kind !== "sunday" && c.baseline_kind !== "hourly") return null;
  return <TrendPill label={baselineLabel(c)} />;
}

/** True while the software keyboard is up, so a tall footer can fold away. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () =>
      setOpen(true),
    );
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () =>
      setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

/**
 * Tabular figures: every digit the same width, so a reading does not shift
 * while it is typed and figures in a column line up.
 */
export const num = { fontVariant: ["tabular-nums" as const] };

/**
 * A column no wider than a large phone, centred. On a tablet the screens
 * otherwise stretch edge to edge and a row's action ends up far from its
 * label. Phones are narrower than this, so it changes nothing there.
 */
export const readable: ViewStyle = { width: "100%", maxWidth: 672, alignSelf: "center" };

/* ── Saving gauge ──────────────────────────────────────────────────────── */

/**
 * The saving as a gauge filled from 0 %, the target as an ink tick, and the
 * scale printed under it. A loss leaves the track empty: the red figure and
 * the note beside it say why. The tick is left out for a target at or below
 * zero, which has no place on a saving scale.
 */
export function SavingBar({
  savingPct,
  targetPct,
  color,
  label,
  style,
}: {
  savingPct: number | null;
  targetPct: number | null;
  color: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const scale = gaugeScale(savingPct, targetPct);
  const share = (v: number) => Math.max(0, Math.min(100, (v / scale) * 100));
  const width = savingPct != null && Number.isFinite(savingPct) ? share(savingPct) : 0;
  const mark = targetPct != null && targetPct > 0 ? share(targetPct) : null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ gap: 6 }, style]}>
      <View style={{ height: 18, justifyContent: "center" }}>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: t.track, overflow: "hidden" }}>
          <View style={{ width: `${width}%`, height: "100%", borderRadius: 5, backgroundColor: color }} />
        </View>
        {mark != null ? (
          <View
            style={{
              position: "absolute",
              left: `${mark}%`,
              marginLeft: -1.5,
              top: 0,
              width: 3,
              height: 18,
              borderRadius: 1.5,
              backgroundColor: t.ink,
            }}
          />
        ) : null}
      </View>
      {/* The scale's ends, and "Target" under the tick so the tick explains itself. An end
          label the target label would sit on is left out. */}
      <View style={{ height: 16 }}>
        {mark == null || mark > 22 ? (
          <Text style={[f.t(12), num, { color: t.muted, position: "absolute", left: 0 }]}>0%</Text>
        ) : null}
        {mark == null || mark < 78 ? (
          <Text style={[f.t(12), num, { color: t.muted, position: "absolute", right: 0 }]}>{scale}%</Text>
        ) : null}
        {mark != null ? (
          <Text
            style={[
              f.t(12, 600),
              { color: t.ink2, position: "absolute", width: 64, textAlign: mark > 90 ? "right" : mark < 10 ? "left" : "center" },
              mark > 90 ? { right: 0 } : mark < 10 ? { left: 0 } : { left: `${mark}%`, marginLeft: -32 },
            ]}
          >
            Target
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The words a screen reader gets for a saving bar. */
export function savingBarLabel(summary: SavingSummary, of = "baseline"): string {
  if (!summary.ready || summary.saving_pct == null) return "Savings not calculated yet";
  const target = summary.target_pct != null ? ` Target is ${formatTargetPct(summary.target_pct)}.` : "";
  return `Saved ${formatPct(summary.saving_pct)} of ${of}.${target}`;
}

/* ── Day card (hub, summary) ───────────────────────────────────────────── */

/** Small tinted pill: the baseline kind, "Provisional", "Not sent yet". */
export function TrendPill({
  label,
  tone = "accent",
  icon,
}: {
  label: string;
  tone?: "accent" | "ok" | "warn" | "bad" | "mute";
  icon?: BxName;
}) {
  const t = useJoTheme();
  const fg = tone === "accent" ? t.accentInk : tone === "mute" ? t.ink3 : t[tone];
  const bg = tone === "accent" ? t.accentTint : t[`${tone}Tint` as const];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: bg,
        alignSelf: "flex-start",
      }}
    >
      {icon ? <Bx name={icon} size={13} color={fg} /> : null}
      {/* No numberOfLines, for the same reason as the category chips; a long note may wrap. */}
      <Text style={[f.t(12, 500), { color: fg, flexShrink: 1 }]}>{label}</Text>
    </View>
  );
}

/** One label and value line inside a summary card. */
export function FigureRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  const t = useJoTheme();
  return (
    <View
      style={{
        minHeight: 40,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: t.line,
      }}
    >
      <Text style={[f.t(14), { color: t.muted }]}>{label}</Text>
      <Text style={[f.t(14, 500), num, { color: t.ink, flexShrink: 1, textAlign: "right" }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ── Entry screen frame ────────────────────────────────────────────────── */

/**
 * The category switcher under an entry screen's header: only the categories
 * set up for the site, the open one filled, entered ones with a tick.
 */
export function CategoryTabs({
  view,
  current,
  onPick,
}: {
  view: TrendDayView;
  current: TrendCategory;
  onPick: (c: TrendViewCategory) => void;
}) {
  const t = useJoTheme();
  if (view.categories.length < 2) return null;
  return (
    <View accessibilityRole="tablist">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={readable}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}
      >
        {view.categories.map((c) => {
          const on = c.category === current;
          const done = c.entered && c.sync !== "failed";
          return (
            <TouchableOpacity
              key={c.category}
              onPress={on ? undefined : () => onPick(c)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c.label}${done ? ", entered" : ""}`}
              style={{
                height: 44,
                minWidth: 96,
                paddingHorizontal: 16,
                borderRadius: 22,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: on ? t.selBg : t.input,
                borderWidth: 1,
                borderColor: on ? t.selBg : t.lineMid,
              }}
            >
              {done && !on ? <Bx name="bx-check" size={16} color={t.ok} /> : null}
              {/* No numberOfLines: in a chip sized to its label, Android rounds the
                  measured width down on some screen densities and cuts the word short. */}
              <Text style={[f.t(14, on ? 600 : 500), { color: on ? t.selFg : t.ink }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * An entry screen: header, category switcher, the day bar pinned under them
 * (which day, its baseline and target), the scrolling form, and the saving
 * footer docked under it (lifted with the keyboard, never over a field).
 *
 * While the keyboard is up the category switcher folds away so a small phone
 * keeps room for the field being typed in; the day bar stays.
 */
export function EntryFrame({
  title,
  view,
  current,
  onPick,
  onBack,
  children,
  footer,
}: {
  title: string;
  view: TrendDayView;
  current: TrendCategory;
  onPick: (c: TrendViewCategory) => void;
  /** The header's back button; a screen with unsaved typing asks first. */
  onBack: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const keyboardOpen = useKeyboardOpen();
  const category = view.categories.find((c) => c.category === current) ?? null;
  // With the category tabs on screen the header would repeat the open tab's name.
  const tabs = view.categories.length > 1;
  // Android's back key takes the same way out as the header's back button, so
  // typed readings are never dropped without the "Leave without saving?" ask.
  const backRef = useRef(onBack);
  useEffect(() => {
    backRef.current = onBack;
  }, [onBack]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);
  return (
    <JoPage glow={false}>
      {/* The day is the title: typing a reading into the wrong day is the costly mistake here. */}
      <DayHeader date={view.date} what={tabs ? undefined : title} onBack={onBack} />
      {keyboardOpen ? null : <CategoryTabs view={view} current={current} onPick={onPick} />}
      {category ? <BaselineLine view={view} category={category} /> : null}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[readable, { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 10 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {category ? <SkippedDayNotice view={view} category={category} /> : null}
          {children}
          {category ? <DeleteCategoryButton view={view} category={category} /> : null}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </JoPage>
  );
}

/* ── Day bar (pinned) ──────────────────────────────────────────────────── */

/**
 * The baseline an entry screen is measured against: the category's own, or
 * for DG, Solar and Wind (which only move Electricity) Electricity's.
 */
function baselineFor(view: TrendDayView, category: TrendViewCategory) {
  if (isElectricityAddon(category.category)) {
    const e = view.categories.find((c) => c.category === "electricity") ?? null;
    return {
      label: e ? `Electricity ${baselineLabel(e).toLowerCase()}` : "Electricity baseline",
      value: e?.baseline ?? null,
      unit: e?.unit ?? category.unit,
      target: e?.target_pct ?? null,
    };
  }
  return {
    label: baselineLabel(category),
    value: category.baseline ?? null,
    unit: category.unit,
    target: category.target_pct ?? null,
  };
}

/**
 * An entry screen's header: back, the day being entered as the title, and how
 * far back it is. A day other than today carries a warning pill, so a reading
 * typed into an old day is hard to miss.
 */
export function DayHeader({
  date,
  what,
  onBack,
  right,
}: {
  date: string;
  /** The category, when no tabs below name it. */
  what?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const t = useJoTheme();
  const today = istTodayString();
  const past = date !== today;
  const when = relativeDayLabel(date, today);
  return (
    <View style={[readable, { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10 }]}>
      <IconButton icon="bx-chevron-left" iconSize={24} label="Back" onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }} accessible accessibilityRole="header" accessibilityLabel={`${what ? `${what}, ` : ""}${dateLabel(date)}, ${when}`}>
        <Text style={[f.d(19, -0.02, 1.2), { color: t.ink }]} numberOfLines={1}>
          {what ? `${what} · ${dateLabel(date)}` : dateLabel(date)}
        </Text>
        {past ? (
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingVertical: 2,
              paddingHorizontal: 8,
              borderRadius: 999,
              backgroundColor: t.warnTint,
            }}
          >
            <Bx name="bx-history" size={13} color={t.warn} />
            <Text style={[f.t(12.5, 600), { color: t.warn }]}>{when}</Text>
          </View>
        ) : (
          <Text style={[f.t(12.5), { color: t.muted }]}>{when}</Text>
        )}
      </View>
      {right}
    </View>
  );
}

/**
 * What the day is measured against, as one quiet line under the tabs: the
 * baseline (Electricity's for DG, Solar and Wind) and the target.
 */
export function BaselineLine({ view, category }: { view: TrendDayView; category: TrendViewCategory }) {
  const t = useJoTheme();
  const b = baselineFor(view, category);
  const baselineText = b.value != null ? `${formatIndian(b.value)} ${b.unit}` : "Not set";
  return (
    <View
      accessible
      accessibilityLabel={`${b.label} ${b.value != null ? baselineText : "not set"}. Target ${b.target != null ? formatTargetPct(b.target) : "not set"}.`}
      style={[readable, { flexDirection: "row", alignItems: "flex-end", gap: 16, paddingHorizontal: 20, paddingBottom: 12 }]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[f.t(12.5), { color: t.muted }]} numberOfLines={1}>
          {b.label}
        </Text>
        <Text style={[f.t(16, 600), num, { color: b.value != null ? t.ink : t.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {baselineText}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[f.t(12.5), { color: t.muted }]}>Target</Text>
        <Text style={[f.t(16, 600), num, { color: b.target != null ? t.ink : t.muted }]}>
          {b.target != null ? formatTargetPct(b.target) : "Not set"}
        </Text>
      </View>
    </View>
  );
}

/* ── Skipped days ──────────────────────────────────────────────────────── */

/**
 * The first earlier day still to enter for this category, or null. Counts
 * the server's last entry and every entry on this phone (sent or not), so it
 * works offline. Null until the phone's entries are read.
 */
export function useSkippedDay(view: TrendDayView, category: TrendViewCategory): string | null {
  const siteCode = view.site_code;
  const id = category.category;
  const key = `${siteCode}|${id}`;
  const [onPhone, setOnPhone] = useState<{ key: string; dates: Set<string> } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      TrendSheetService.enteredDatesOnPhone(siteCode, id)
        .then((dates) => {
          if (live) setOnPhone({ key, dates });
        })
        .catch(() => {});
    void load();
    const unsubscribe = subscribeTrendSheet(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [siteCode, id, key]);
  if (!onPhone || onPhone.key !== key) return null;
  return firstSkippedDay(category.last_entry_date, view.date, onPhone.dates);
}

/** Open the skipped day of the same category in place of this one. */
function openSkipped(view: TrendDayView, category: TrendViewCategory, skipped: string) {
  openCategory(view.site_code, skipped, category, true);
}

/** Save was pressed with a day skipped: say which day comes first and offer to open it. */
function askSkipped(view: TrendDayView, category: TrendViewCategory, skipped: string) {
  const last = category.last_entry_date;
  showAlert(
    `Enter ${dayMonthLabel(skipped)} first`,
    `${category.label} was last entered for ${last ? dayMonthLabel(last) : "an earlier day"}. Readings carry forward day by day, so ${dayMonthLabel(view.date)} can be saved once every day before it is entered. What you typed here is not saved.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: `Open ${dayMonthLabel(skipped)}`, onPress: () => openSkipped(view, category, skipped) },
    ],
  );
}

/** Shown at the top of the form when an earlier day of this category was skipped. */
function SkippedDayNotice({ view, category }: { view: TrendDayView; category: TrendViewCategory }) {
  const t = useJoTheme();
  const skipped = useSkippedDay(view, category);
  if (!skipped) return null;
  const last = category.last_entry_date;
  const dayBefore = addDaysYmd(view.date, -1);
  const single = skipped === dayBefore;
  const gap = single ? dayMonthLabel(skipped) : `${dayMonthLabel(skipped)} to ${dayMonthLabel(dayBefore)}`;
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: t.warn,
        backgroundColor: t.warnTint,
        paddingTop: 12,
        paddingHorizontal: 14,
        paddingBottom: 4,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Bx name="bx-calendar-exclamation" size={18} color={t.warn} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[f.t(14, 600), { color: t.ink }]}>{dateLabel(skipped)} is not entered</Text>
          <Text style={[f.t(12.5), { color: t.ink3, lineHeight: 18 }]}>
            {category.label} was last entered for {last ? dayMonthLabel(last) : "an earlier day"}. Readings carry
            forward, so this day can be saved once {gap} {single ? "is" : "are"} entered.
          </Text>
        </View>
      </View>
      <TextLink label={`Open ${dateLabel(skipped)}`} onPress={() => openSkipped(view, category, skipped)} />
    </View>
  );
}

/* ── Deleting ──────────────────────────────────────────────────────────── */

/** "Not deleted" with the reason, or nothing when it worked. */
function reportDeleteFailure(result: Awaited<ReturnType<typeof TrendSheetService.deleteEntry>>): boolean {
  if (result.ok) return false;
  showAlert(
    "Not deleted",
    result.offline
      ? "There is no connection. Deleting needs the server: connect and try again."
      : `The server refused it: ${result.error}`,
  );
  return true;
}

/** Ask, then delete one category of a day. Resolves true once it is gone. */
export function confirmDeleteCategory(view: TrendDayView, category: TrendViewCategory): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(
      `Delete ${inSentence(category.label)} for ${dateLabel(view.date)}?`,
      `The ${inSentence(category.label)} entry for this day is removed. Other categories and other days keep their readings.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void TrendSheetService.deleteEntry(view.site_code, view.date, category.category).then((result) => {
              const failed = reportDeleteFailure(result);
              if (!failed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              resolve(!failed);
            });
          },
        },
      ],
    );
  });
}

/** Ask, then delete every category of a day. Resolves true once it is gone. */
export function confirmDeleteDay(view: TrendDayView): Promise<boolean> {
  const entered = view.categories.filter((c) => c.entered || c.sync != null).map((c) => inSentence(c.label));
  const list = entered.length <= 1 ? (entered[0] ?? "every entry") : `${entered.slice(0, -1).join(", ")} and ${entered[entered.length - 1]}`;
  return new Promise((resolve) => {
    showAlert(
      `Delete every entry for ${dateLabel(view.date)}?`,
      `${list.charAt(0).toUpperCase()}${list.slice(1)} for this day ${entered.length === 1 ? "is" : "are"} removed. Other days keep their readings.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Delete day",
          style: "destructive",
          onPress: () => {
            void TrendSheetService.deleteEntry(view.site_code, view.date, null).then((result) => {
              const failed = reportDeleteFailure(result);
              if (!failed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              resolve(!failed);
            });
          },
        },
      ],
    );
  });
}

/** True when a role may delete and the day holds something to delete. */
export function useCanDelete(): boolean {
  const { can } = usePermissions();
  return can("trend_sheet_entry", "delete");
}

/** The quiet destructive line at the end of an entry form, once the category holds an entry. */
function DeleteCategoryButton({ view, category }: { view: TrendDayView; category: TrendViewCategory }) {
  const t = useJoTheme();
  const allowed = useCanDelete();
  const [busy, setBusy] = useState(false);
  if (!allowed || !(category.entered || category.sync != null)) return null;
  return (
    <TouchableOpacity
      onPress={async () => {
        if (busy) return;
        setBusy(true);
        const gone = await confirmDeleteCategory(view, category);
        setBusy(false);
        if (gone) backToHub();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      accessibilityLabel={`Delete ${category.label} for ${dateLabel(view.date)}`}
      style={{
        marginTop: 8,
        minHeight: 48,
        borderRadius: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Bx name="bx-trash" size={17} color={t.bad} />
      <Text style={[f.t(14, 600), { color: t.bad }]}>
        Delete {inSentence(category.label)} for {dayMonthLabel(view.date)}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * The docked footer panel of an entry screen: the saving (`readout`), any
 * figures under it (`children`) and the Save button (`actions`).
 *
 * While the keyboard is up it folds to one row that sits right on top of the
 * keyboard: the saving, "Done" (a number pad has no key of its own to close
 * it) and a compact Save, so saving never needs the keyboard closed first.
 */
export function FooterPanel({
  readout,
  actions,
  children,
}: {
  readout: React.ReactNode;
  actions: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) {
    return (
      <View
        style={{
          backgroundColor: t.card,
          borderTopWidth: 1,
          borderColor: t.cardBorder,
          paddingTop: 8,
          // With a hardware keyboard nothing lifts the panel, so it must clear the gesture bar itself.
          paddingBottom: Math.max(insets.bottom, 8),
        }}
      >
        <View style={[readable, { paddingLeft: 20, paddingRight: 12, flexDirection: "row", alignItems: "center", gap: 4 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>{readout}</View>
          <TouchableOpacity
            onPress={() => Keyboard.dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Done typing"
            style={{ minHeight: 44, minWidth: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}
          >
            <Text style={[f.t(15, 600), { color: t.accentInk }]}>Done</Text>
          </TouchableOpacity>
          {actions}
        </View>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: t.card,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: t.cardBorder,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 16,
        paddingBottom: Math.max(insets.bottom, 12) + 12,
      }}
    >
      <View style={[readable, { paddingHorizontal: 20, gap: 12 }]}>
        {readout}
        {children}
        {actions}
      </View>
    </View>
  );
}

/**
 * The saving a footer shows: its label, the figure and percentage in the
 * tone's colour, the bar, and the line that says what the colour means.
 */
export function SavingReadout({
  label,
  summary,
  unit,
  barOf,
  compact,
}: {
  label: string;
  summary: SavingSummary;
  unit: string;
  barOf?: string;
  /** One line and the note, no bar: what fits above an open keyboard. */
  compact?: boolean;
}) {
  const t = useJoTheme();
  const color = toneColor(t, summary.tone);
  // Nothing worked out yet: only the line saying what is still needed. A lone
  // dash and an empty bar read as a minus sign and a broken chart.
  if (summary.saving == null) {
    return (
      <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
        <Text style={[f.t(compact ? 12 : 12.5), { color: t.muted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[f.t(compact ? 13 : 14, 500), { color: t.ink3, lineHeight: compact ? 17 : 19 }]}
          numberOfLines={compact ? 2 : undefined}
        >
          {summary.note || "Not worked out yet"}
        </Text>
      </View>
    );
  }
  const figure = `${formatIndian(summary.saving)} ${unit}`;
  if (compact) {
    // Shares a row with Done and Save above the keyboard: label over figure, no note.
    return (
      <View style={{ gap: 1 }} accessibilityLiveRegion="polite">
        <Text style={[f.t(12), { color: t.muted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[f.t(16, 600), num, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {figure}
          {summary.saving_pct != null ? `  ${formatPct(summary.saving_pct)}` : ""}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={[f.t(12.5), { color: t.muted }]}>{label}</Text>
          <Text style={[f.d(24, -0.02), num, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {figure}
          </Text>
        </View>
        {summary.saving_pct != null ? (
          <Text style={[f.d(24, -0.02), num, { color }]}>{formatPct(summary.saving_pct)}</Text>
        ) : null}
      </View>
      {/* A loss has nothing to fill: the red figure and the note say it. */}
      {summary.saving < 0 ? null : (
        <SavingBar
          savingPct={summary.saving_pct}
          targetPct={summary.target_pct}
          color={color}
          label={savingBarLabel(summary, barOf)}
        />
      )}
      {summary.note ? <Text style={[f.t(12.5), { color: t.ink3, lineHeight: 17 }]}>{summary.note}</Text> : null}
    </View>
  );
}

/** A small label over a value: the footer's "Baseline / Used / Adjustment" grid. */
export function StatGrid({ items }: { items: { label: string; value: string }[] }) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[f.t(12), { color: t.muted }]} numberOfLines={1}>
            {it.label}
          </Text>
          <Text style={[f.t(14, 500), num, { color: t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The button a Save turns into: what was saved and where it leads next. */
export function SavedButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 54,
        borderRadius: 27,
        paddingHorizontal: 18,
        paddingVertical: 8,
        backgroundColor: t.okTint,
        borderWidth: 1,
        borderColor: t.ok,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Bx name="bx-check" size={20} color={t.ok} />
      <Text style={[f.t(15, 600), { color: t.ink, flexShrink: 1, textAlign: "center" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * The question a DG or fuel screen opens with ("Did the DG run today?"):
 * zero is an answer the user gives, never a blank field. Neither option is
 * picked until the user answers or types a quantity.
 */
export function TwoWayChoice({
  question,
  yes,
  no,
  noLabel,
  value,
  onYes,
  onNo,
  disabled,
}: {
  question: string;
  yes: string;
  no: string;
  /** The "none" option's spoken name, a full sentence ("DG did not run today"). */
  noLabel: string;
  value: "yes" | "no" | null;
  onYes: () => void;
  onNo: () => void;
  disabled?: boolean;
}) {
  const t = useJoTheme();
  const option = (label: string, a11y: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      accessibilityLabel={a11y}
      style={{
        flex: 1,
        minHeight: 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? t.selBg : t.lineMid,
        backgroundColor: on ? t.selBg : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {on ? <Bx name="bx-check" size={17} color={t.selFg} /> : null}
      <Text style={[f.t(15, 600), { color: on ? t.selFg : t.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={question}>
      <Text style={[f.t(15, 600), { color: t.ink }]}>{question}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {option(yes, yes, value === "yes", onYes)}
        {option(no, noLabel, value === "no", onNo)}
      </View>
    </View>
  );
}

/**
 * One line of a day's ledger: an operator, what it is, and the figure,
 * right-aligned in tabular digits so the column adds up by eye.
 */
export function LedgerRow({
  op,
  label,
  value,
  result,
  first,
}: {
  op?: "+" | "−" | "=" | "±";
  label: string;
  value: string;
  /** The total line: heavier, with a rule above it. */
  result?: boolean;
  first?: boolean;
}) {
  const t = useJoTheme();
  return (
    <View
      style={{
        minHeight: result ? 48 : 38,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderTopWidth: first ? 0 : result ? 1.5 : 1,
        borderTopColor: result ? t.lineStrong : t.line,
      }}
    >
      <Text style={[f.m(15, 500), { color: t.muted, width: 16, textAlign: "center" }]}>{op ?? ""}</Text>
      <Text style={[f.t(result ? 15 : 14, result ? 600 : 400), { color: result ? t.ink : t.ink3, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[f.t(result ? 16 : 14.5, result ? 600 : 500), num, { color: t.ink, textAlign: "right", flexShrink: 1 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** A field's error line, announced when it appears. */
export function FieldError({ children }: { children: React.ReactNode }) {
  const t = useJoTheme();
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[f.t(13), { color: t.bad, lineHeight: 18 }]}>
      {children}
    </Text>
  );
}

/** A tappable text line ("Meter changed? Set opening reading"), 44 high. */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={{ top: 6, bottom: 6 }}
      style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
    >
      <Text style={[f.t(13, 600), { color: t.ink, textDecorationLine: "underline" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ── What the phone knows about an entry ───────────────────────────────── */

/** The line under a Save button once a category is on the phone but not on the server. */
export function SyncLine({
  c,
  outdated,
}: {
  c: Pick<TrendViewCategory, "sync" | "sync_error">;
  /** The server wants a newer app: the entry waits for the update, not for the network. */
  outdated?: boolean;
}) {
  const t = useJoTheme();
  if (!c.sync) return null;
  const failed = c.sync === "failed";
  const text =
    c.sync === "pending"
      ? outdated
        ? "Saved on this phone. It is sent once the app is updated."
        : "Saved on this phone. It is sent when the network is back."
      : failed
        ? `Not accepted: ${c.sync_error || "the server refused this entry"}`
        : c.sync_error || "Replaced by a newer save";
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
      <Bx name={failed ? "bx-error-circle" : c.sync === "pending" ? "bx-cloud-upload" : "bx-info-circle"} size={15} color={failed ? t.bad : t.muted} />
      <Text style={[f.t(12), { color: failed ? t.bad : t.muted, flex: 1, lineHeight: 16 }]}>{text}</Text>
    </View>
  );
}

/* ── Saving a category ─────────────────────────────────────────────────── */

/**
 * The save flow every entry screen shares. `save` stores the entry on the
 * phone, queues it and kicks the queue; it never waits for the network.
 * `dirty` is true while something typed has not been saved.
 */
export function useCategorySave(siteCode: string, date: string, category: TrendCategory) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // The same flag for event handlers, which must not wait for a render.
  const dirty = useRef(false);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setIsDirty(true);
    setSaved(false);
  }, []);

  const save = useCallback(
    async (fields: TrendSaveFields) => {
      if (busy) return;
      setBusy(true);
      try {
        await TrendSheetService.saveCategory(siteCode, date, category, fields);
        dirty.current = false;
        setIsDirty(false);
        setSaved(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        void syncEngine.flushQueue().catch(() => {});
      } catch (e: any) {
        showAlert("Not saved", e?.message || "This entry could not be stored on the phone. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, siteCode, date, category],
  );

  /** The form has a problem: nothing is sent, the user feels it. */
  const refuse = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  return { busy, saved, dirty, isDirty, markDirty, save, refuse };
}

/**
 * An entry form's state. It starts from the category as loaded and follows
 * it when the server's day arrives or a sync answers, but never while the
 * user has typed something that is not saved yet.
 */
export function useEntryForm<T>(
  category: TrendViewCategory,
  isDirty: boolean,
  init: (c: TrendViewCategory) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [form, setForm] = useState<T>(() => init(category));
  const [seen, setSeen] = useState(category);
  if (seen !== category) {
    setSeen(category);
    if (!isDirty) setForm(init(category));
  }
  return [form, setForm];
}

/**
 * The bottom of an entry footer: the Save button, or what stands in for it
 * (the update block, a role that cannot edit, the "saved, continue" button),
 * and the line saying whether the entry has reached the server.
 */
export function EntryActions({
  view,
  category,
  siteCode,
  saved,
  busy,
  onSave,
  onOpen,
  compact,
}: {
  view: TrendDayView;
  category: TrendViewCategory;
  siteCode: string;
  saved: boolean;
  busy: boolean;
  onSave: () => void;
  /** How to move to the next category; a screen that serves several categories switches in place. */
  onOpen?: (c: TrendViewCategory) => void;
  /** The keyboard is up: only a small Save, for the footer's single row. */
  compact?: boolean;
}) {
  const t = useJoTheme();
  const { can } = usePermissions();
  const outdated = useTrendOutdated(view);
  const skipped = useSkippedDay(view, category);
  const next = nextToEnter(view, category.category);
  const name = inSentence(category.label);
  // A skipped earlier day blocks the save: the units of the skipped days would
  // otherwise land on this one. The keyboard goes so any field error shows.
  const press = () => {
    Keyboard.dismiss();
    if (skipped) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      askSkipped(view, category, skipped);
      return;
    }
    onSave();
  };
  if (compact) {
    const canSave = !outdated && can("trend_sheet_entry", "edit") && !(saved && category.sync !== "failed");
    if (!canSave) return null;
    return (
      <PrimaryButton
        label="Save"
        onPress={press}
        busy={busy}
        height={44}
        style={{ minWidth: 88, paddingHorizontal: 20 }}
      />
    );
  }
  const goNext = () => {
    if (!next) goTrend("/trend-summary", { siteCode, date: view.date }, true);
    else if (onOpen) onOpen(next);
    else openCategory(siteCode, view.date, next, true);
  };
  return (
    <>
      {outdated ? (
        <UpdateBlock />
      ) : !can("trend_sheet_entry", "edit") ? (
        <Text style={[f.t(13), { color: t.muted, lineHeight: 18 }]}>
          You can view these readings, but your role cannot change them.
        </Text>
      ) : saved && category.sync !== "failed" ? (
        // A refused or given up entry is not saved: offer Save again, as the line below says.
        <SavedButton
          label={`${category.label} saved. ${next ? `Continue to ${inSentence(next.label)}` : "View day summary"}`}
          onPress={goNext}
        />
      ) : (
        <PrimaryButton label={`Save ${name}`} onPress={press} busy={busy} />
      )}
      <SyncLine c={category} outdated={outdated} />
    </>
  );
}

/* ── Update block (AC-49) ──────────────────────────────────────────────── */

/** The app's own update action: an over the air update first, then the store. */
export async function runAppUpdate(): Promise<void> {
  try {
    const result = await UpdateService.checkForUpdate(false);
    if (result.status === "available") {
      // The update popup (UpdateRequiredScreen) takes over from here.
      UpdateService.fetchUpdate();
      return;
    }
    if (await StoreUpdateService.check(true)) return;
    showAlert(
      "No update found yet",
      "The update is not available on this phone yet. Check your connection and try again in a few minutes.",
    );
  } catch {
    showAlert("Update check failed", "Could not check for updates. Check your connection and try again.");
  }
}

/** True when this build's calculation is older than the server's. */
export function useTrendOutdated(view: TrendDayView | null): boolean {
  const [, bump] = useState(0);
  useEffect(() => subscribeTrendSheet(() => bump((n) => n + 1)), []);
  return isTrendCalcOutdated(view);
}

/**
 * Shown in place of a Save button when the server runs a newer calculation
 * than this build. What was typed stays on the screen and on the phone.
 */
export function UpdateBlock() {
  const t = useJoTheme();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Bx name="bx-up-arrow-circle" size={18} color={t.warn} />
        <Text style={[f.t(13, 500), { color: t.ink, flex: 1, lineHeight: 18 }]}>
          Update the app to enter readings. Nothing you typed is lost.
        </Text>
      </View>
      <PrimaryButton
        label="Update the app"
        icon="bx-download"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          await runAppUpdate();
          setBusy(false);
        }}
      />
    </View>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

/** A full screen state under a back header: loading failed, offline, not set up. */
export function TrendStateScreen({
  title,
  sub,
  icon,
  heading,
  body,
  action,
}: {
  title: string;
  sub?: string;
  icon: BxName;
  heading: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = useJoTheme();
  return (
    <JoPage glow={false}>
      <View style={[readable, { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10 }]}>
        <IconButton icon="bx-chevron-left" iconSize={24} label="Back" onPress={backToHub} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text accessibilityRole="header" style={[f.d(19, -0.02, 1.2), { color: t.ink }]} numberOfLines={1}>
            {title}
          </Text>
          {sub ? <Text style={[f.t(12.5), { color: t.muted }]}>{sub}</Text> : null}
        </View>
      </View>
      <View style={[readable, { paddingHorizontal: 16, paddingTop: 8 }]}>
        <Card style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: t.raised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bx name={icon} size={22} color={t.muted} />
          </View>
          <Text style={[f.t(15, 600), { color: t.ink, textAlign: "center", marginTop: 4 }]}>{heading}</Text>
          <Text style={[f.t(13), { color: t.muted, textAlign: "center", lineHeight: 19 }]}>{body}</Text>
          {action ? (
            <TouchableOpacity
              onPress={action.onPress}
              accessibilityRole="button"
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
            >
              <Text style={[f.t(14, 600), { color: t.accentInk }]}>{action.label}</Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      </View>
    </JoPage>
  );
}

/** The state an entry screen shows while its day is not on screen yet, or null when it is. */
export function dayStateScreen(
  title: string,
  date: string | undefined,
  day: TrendDayState,
): React.ReactElement | null {
  const sub = date ? dateLabel(date) : undefined;
  if (day.view) return null;
  if (day.status === "loading") {
    return (
      <TrendStateScreen
        title={title}
        sub={sub}
        icon="bx-time-five"
        heading="Loading the day…"
        body="Getting yesterday’s readings and today’s baseline…"
      />
    );
  }
  if (day.status === "offline") {
    return (
      <TrendStateScreen
        title={title}
        sub={sub}
        icon="bx-wifi-off"
        heading="This day is not on the phone yet"
        body="Connect once so the opening readings and the baseline can be loaded. After that it works with no network."
        action={{ label: "Try again", onPress: () => void day.reload() }}
      />
    );
  }
  return (
    <TrendStateScreen
      title={title}
      sub={sub}
      icon="bx-error-circle"
      heading="This day could not be opened"
      body={day.error || "Something went wrong while loading the day."}
      action={{ label: "Try again", onPress: () => void day.reload() }}
    />
  );
}

/** An entry screen opened with no site (a stale link): there is nothing to load. */
export function MissingSite({ title }: { title: string }) {
  return (
    <TrendStateScreen
      title={title}
      icon="bx-buildings"
      heading="No site selected"
      body="Open the trend sheet from the Ops tab and pick a category there."
      action={{ label: "Go back", onPress: backToHub }}
    />
  );
}

/** Today in India; a param date in the future is pulled back to it. */
export function safeDate(date: string | undefined): string {
  const today = istTodayString();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return today;
  return date;
}

/** Ask before dropping typed values that were not saved. */
export function confirmLeave(dirty: boolean, go: () => void) {
  if (!dirty) {
    go();
    return;
  }
  showAlert("Leave without saving?", "The readings typed on this screen have not been saved.", [
    { text: "Keep typing" },
    { text: "Leave", onPress: go },
  ]);
}
