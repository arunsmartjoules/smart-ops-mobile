/**
 * Home dashboard building blocks — Claude Design "JouleOps Role Dashboard v2".
 *
 * One layout vocabulary shared by the two role views (technician "My Site
 * Today", everyone else "Site Overview"): a header with the period filter, a
 * site card carrying the SLA chip and the punch CTA, stat tiles, progress bars,
 * the SLA scorecard and the plant-efficiency pair.
 *
 * Sizes and spacing are the artboard's, verbatim. Dark mode uses its colours
 * verbatim too (`JO_DARK`); light mode (`JO_LIGHT`) is the same navy/red tone
 * on white. Keep `JO_DARK` in sync with the artboard.
 */
import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import {
  AlertCircle,
  Bell,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useIsDark } from "@/hooks/useDs";

/* ── Palette (artboard literals) ───────────────────────────────────────── */

/** Dark: the artboard's values, verbatim. */
const JO_DARK = {
  page: "#060C1A",
  card: "#0F1828",
  tile: "#152038",
  line: "rgba(230,240,255,0.10)",
  lineStrong: "rgba(230,240,255,0.22)",
  sheetLine: "rgba(230,240,255,0.14)",
  ink: "#EEF2FF",
  muted: "#7A91BB",
  faint: "#3E506A",
  accent: "#D43535",
  /** Primary buttons (Start Day, Apply) — web primary on dark (SJ Sky), = ds.controlOn. */
  primary: "#28939D",
  green: "#20BF6B",
  amber: "#F59E0B",
  red: "#D43535",
  blue: "#4A91EA",
  backdrop: "rgba(3,7,15,0.62)",
  breachBg: "rgba(212,53,53,0.14)",
  breachBorder: "rgba(212,53,53,0.45)",
  breachSub: "#F2A7A7",
};

export type Jo = typeof JO_DARK;

/**
 * Light: the same tone on white — navy ink, the same red accent, and status
 * colours deepened a step so amber/green still read on a white tile.
 */
const JO_LIGHT: Jo = {
  page: "#F4F6FB",
  card: "#FFFFFF",
  tile: "#F1F4FA",
  line: "#D6DDE9",
  lineStrong: "#BCC7DB",
  sheetLine: "#D6DDE9",
  ink: "#0F1828",
  muted: "#5D6B86",
  faint: "#98A2B6",
  accent: "#D43535",
  primary: "#072B31",
  green: "#17984F",
  amber: "#C77A00",
  red: "#D43535",
  blue: "#2F74C9",
  backdrop: "rgba(15,24,40,0.45)",
  breachBg: "rgba(212,53,53,0.08)",
  breachBorder: "rgba(212,53,53,0.35)",
  breachSub: "#A62B2B",
};

/** The Home palette for the active app theme. */
export function useJo(): Jo {
  return useIsDark() ? JO_DARK : JO_LIGHT;
}

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export function toneColor(tone: Tone, JO: Jo): string {
  switch (tone) {
    case "good":
      return JO.green;
    case "warn":
      return JO.amber;
    case "bad":
      return JO.red;
    case "info":
      return JO.blue;
    default:
      return JO.ink;
  }
}

/** The SLA chip's translucent fill. */
function toneFill(tone: Tone): string {
  const rgb =
    tone === "good" ? "32,191,107" : tone === "warn" ? "245,158,11" : "212,53,53";
  return `rgba(${rgb},0.14)`;
}

/* ── Header ────────────────────────────────────────────────────────────── */

export function DashHeader({
  topInset,
  title,
  periodLabel,
  onPeriod,
  bellIcon: BellIcon = Bell,
  bellLabel,
  bellDot,
  onBell,
  avatarInitial,
  avatarUri,
  avatarLabel,
  onAvatar,
}: {
  topInset: number;
  title: string;
  periodLabel: string;
  onPeriod: () => void;
  bellIcon?: LucideIcon;
  bellLabel: string;
  bellDot?: boolean;
  onBell: () => void;
  avatarInitial: string;
  avatarUri?: string | null;
  avatarLabel: string;
  onAvatar: () => void;
}) {
  const JO = useJo();
  const s = useS();
  return (
    <View style={[s.header, { paddingTop: topInset + 2 }]}>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text style={s.eyebrow}>DASHBOARD</Text>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        <TouchableOpacity
          onPress={onPeriod}
          activeOpacity={0.7}
          hitSlop={8}
          style={s.periodRow}
          accessibilityRole="button"
          accessibilityLabel={`Period: ${periodLabel}. Change period`}
        >
          <Calendar size={13} color={JO.muted} />
          <Text style={s.periodText} numberOfLines={1}>
            {periodLabel}
          </Text>
          <ChevronDown size={16} color={JO.muted} />
        </TouchableOpacity>
      </View>
      <View style={s.headerActions}>
        {/* The artboard reaches Profile from its tab bar; the app's bar has no
            Profile slot, so a matching round button carries it here. */}
        <TouchableOpacity
          onPress={onAvatar}
          activeOpacity={0.8}
          style={s.roundBtn}
          accessibilityRole="button"
          accessibilityLabel={avatarLabel}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={s.avatarImg} />
          ) : (
            <Text style={s.avatarText}>{avatarInitial}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBell}
          activeOpacity={0.8}
          style={s.roundBtn}
          accessibilityRole="button"
          accessibilityLabel={bellDot ? `${bellLabel}, unread` : bellLabel}
        >
          <BellIcon size={18} color={JO.ink} />
          {bellDot ? <View style={s.bellDot} /> : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Cards & labels ────────────────────────────────────────────────────── */

export function DashCard({ children }: { children: React.ReactNode }) {
  const s = useS();
  return <View style={s.card}>{children}</View>;
}

export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const s = useS();
  return <Text style={[s.sectionLabel, style]}>{children}</Text>;
}

export function Footnote({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const s = useS();
  return <Text style={[s.footnote, style]}>{children}</Text>;
}

/* ── Site card ─────────────────────────────────────────────────────────── */

export function SiteCard({
  siteName,
  onPressSite,
  dateLabel,
  shiftLine,
  slaScore,
  slaTone,
  slaMonth,
  onPressSla,
  children,
}: {
  siteName: string;
  onPressSite?: () => void;
  dateLabel: string;
  /** "In 09:12 · 3h 04m so far" while on shift. */
  shiftLine?: string | null;
  slaScore: string;
  slaTone: Tone;
  slaMonth: string;
  onPressSla: () => void;
  children?: React.ReactNode;
}) {
  const JO = useJo();
  const s = useS();
  const hasTone = slaTone !== "neutral";
  return (
    <DashCard>
      <View style={s.siteTop}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <TouchableOpacity
            onPress={onPressSite}
            disabled={!onPressSite}
            activeOpacity={0.7}
            style={s.siteNameRow}
            accessibilityRole={onPressSite ? "button" : "text"}
            accessibilityLabel={onPressSite ? `${siteName}. Change site` : siteName}
          >
            <Text style={s.siteName} numberOfLines={1}>
              {siteName}
            </Text>
            {onPressSite ? <ChevronDown size={15} color={JO.muted} /> : null}
          </TouchableOpacity>
          <View style={s.metaRow}>
            <Calendar size={13} color={JO.muted} />
            <Text style={s.metaText} numberOfLines={1}>
              {dateLabel}
            </Text>
          </View>
          {shiftLine ? (
            <View style={[s.metaRow, { marginTop: 4 }]}>
              <Clock size={13} color={JO.green} />
              <Text
                style={[s.metaText, { color: JO.green, fontWeight: "700" }]}
                numberOfLines={1}
              >
                {shiftLine}
              </Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onPressSla}
          activeOpacity={0.8}
          style={[
            s.slaChip,
            hasTone
              ? { backgroundColor: toneFill(slaTone), borderColor: toneColor(slaTone, JO) }
              : { backgroundColor: JO.tile, borderColor: JO.line },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`SLA ${slaMonth}: ${slaScore}. Change month`}
        >
          <Text style={[s.slaChipScore, { color: toneColor(slaTone, JO) }]}>{slaScore}</Text>
          <Text style={s.slaChipLabel}>SLA · {slaMonth}</Text>
        </TouchableOpacity>
      </View>
      {children}
    </DashCard>
  );
}

/* ── Punch CTA ─────────────────────────────────────────────────────────── */

export function PunchButton({
  label,
  icon: Icon,
  variant,
  busy,
  onPress,
  status,
}: {
  label: string;
  icon: LucideIcon;
  /** primary = web-primary fill (Start Day); secondary = tile fill (End Day / done). */
  variant: "primary" | "secondary";
  busy?: boolean;
  onPress: () => void;
  status?: string | null;
}) {
  const JO = useJo();
  const s = useS();
  const primary = variant === "primary";
  const fg = primary ? "#FFFFFF" : JO.ink;
  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.85}
        style={[
          s.punch,
          primary
            ? { backgroundColor: JO.primary, borderColor: JO.primary }
            : { backgroundColor: JO.tile, borderColor: JO.lineStrong },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <>
            <Icon size={17} color={fg} strokeWidth={2.4} />
            <Text style={[s.punchText, { color: fg }]}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
      {/* The artboard always renders this line; empty it still adds the 8px. */}
      {status ? <Footnote>{status}</Footnote> : <View style={{ height: 8 }} />}
    </>
  );
}

/* ── Tiles ─────────────────────────────────────────────────────────────── */

export interface TileData {
  label: string;
  value: string;
  tone?: Tone;
  /** Corner dot — "look at this one". Takes the value's colour. */
  flag?: boolean;
  onPress?: () => void;
}

/**
 * The artboard uses three tile sizes: `op` (technician "Needs you now", 4-up),
 * `mgr` (manager operational status, 3-up) and `att` (attendance row inside
 * the site card).
 */
const TILE_SIZE = {
  op: { padV: 11, padH: 9, font: 18, ls: -0.4, gap: 5 },
  mgr: { padV: 11, padH: 11, font: 19, ls: -0.4, gap: 5 },
  att: { padV: 10, padH: 11, font: 16, ls: -0.3, gap: 4 },
} as const;

export function TileRow({
  tiles,
  size = "mgr",
}: {
  tiles: TileData[];
  size?: keyof typeof TILE_SIZE;
}) {
  const JO = useJo();
  const s = useS();
  const sz = TILE_SIZE[size];
  return (
    <View style={s.tileRow}>
      {tiles.map((t) => {
        const color = toneColor(t.tone ?? "neutral", JO);
        return (
          // Static style on purpose: a Pressable function-style is dropped by
          // the NativeWind interop, which rendered these tiles borderless.
          <TouchableOpacity
            key={t.label}
            onPress={t.onPress}
            disabled={!t.onPress}
            activeOpacity={0.75}
            style={[s.tile, { paddingVertical: sz.padV, paddingHorizontal: sz.padH }]}
            accessibilityRole={t.onPress ? "button" : "text"}
            accessibilityLabel={`${t.label}: ${t.value}`}
          >
            {t.flag ? <View style={[s.tileDot, { backgroundColor: color }]} /> : null}
            <Text
              style={[s.tileValue, { fontSize: sz.font, letterSpacing: sz.ls, color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {t.value}
            </Text>
            <Text style={[s.tileLabel, { marginTop: sz.gap }]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ── Progress bars ─────────────────────────────────────────────────────── */

export interface BarData {
  label: string;
  detail: string;
  pct: number;
  tone: Tone;
}

/** `thin` is the SLA card's KPI variant (11.5px label, 5px track, 10px gap). */
export function ProgressList({ bars, thin }: { bars: BarData[]; thin?: boolean }) {
  const JO = useJo();
  const s = useS();
  return (
    <View style={{ gap: thin ? 10 : 12 }}>
      {bars.map((b) => {
        const color = toneColor(b.tone, JO);
        return (
          <View key={b.label}>
            <View style={[s.barHead, { marginBottom: thin ? 5 : 6 }]}>
              <Text style={[s.barLabel, thin && { fontSize: 11.5 }]}>{b.label}</Text>
              <Text style={[s.barDetail, { color }]}>{b.detail}</Text>
            </View>
            <View style={[s.barTrack, { height: thin ? 5 : 6 }]}>
              <View
                style={{
                  height: "100%",
                  borderRadius: 3,
                  width: `${Math.max(0, Math.min(100, b.pct))}%`,
                  backgroundColor: color,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ── Alerts ────────────────────────────────────────────────────────────── */

export function BreachAlert({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
}) {
  const JO = useJo();
  const s = useS();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      style={s.breach}
      accessibilityRole={onPress ? "button" : "text"}
    >
      <AlertCircle size={18} color={JO.card} fill={JO.red} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.breachTitle}>{title}</Text>
        {subtitle ? (
          <Text style={s.breachSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={JO.red} />
    </TouchableOpacity>
  );
}

/* ── SLA scorecard (manager) ───────────────────────────────────────────── */

export function SlaCard({
  monthLabel,
  onPrev,
  onNext,
  onPressMonth,
  canPrev,
  canNext,
  score,
  tone,
  siteName,
  pctText,
  kpis,
  loading,
}: {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onPressMonth: () => void;
  canPrev: boolean;
  canNext: boolean;
  score: string;
  tone: Tone;
  siteName: string;
  pctText: string;
  kpis: BarData[];
  loading?: boolean;
}) {
  const JO = useJo();
  const s = useS();
  return (
    <DashCard>
      <View style={s.slaHead}>
        <Text style={[s.sectionLabel, { marginBottom: 0 }]}>SLA · MONTHLY</Text>
        <View style={s.stepper}>
          <TouchableOpacity
            onPress={onPrev}
            disabled={!canPrev}
            style={s.stepBtn}
            accessibilityLabel="Previous month"
          >
            <ChevronLeft size={18} color={canPrev ? JO.ink : JO.faint} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onPressMonth} accessibilityLabel="Pick SLA month">
            <Text style={s.stepLabel}>{monthLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNext}
            disabled={!canNext}
            style={s.stepBtn}
            accessibilityLabel="Next month"
          >
            <ChevronRight size={18} color={canNext ? JO.ink : JO.faint} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.slaScoreRow}>
        {loading ? (
          <ActivityIndicator color={JO.muted} style={{ height: 34 }} />
        ) : (
          <Text style={[s.slaBig, { color: toneColor(tone, JO) }]}>{score}</Text>
        )}
        <View style={{ alignItems: "flex-end", flexShrink: 1, minWidth: 0 }}>
          <Text style={s.slaSite} numberOfLines={1}>
            {siteName}
          </Text>
          <Text style={s.slaPct}>{pctText}</Text>
        </View>
      </View>
      {kpis.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <ProgressList bars={kpis} thin />
        </View>
      ) : null}
    </DashCard>
  );
}

/* ── Plant efficiency ──────────────────────────────────────────────────── */

export interface EffData {
  label: string;
  value: string;
  tone: Tone;
  /** "down" = improving (lower SEC is better). */
  trend?: "down" | "up" | null;
}

export function EfficiencyCard({ items, note }: { items: EffData[]; note: string }) {
  const JO = useJo();
  const s = useS();
  return (
    <DashCard>
      <Text style={[s.sectionLabel, { marginBottom: 0 }]}>PLANT EFFICIENCY (SEC · kW/TR)</Text>
      <View style={[s.tileRow, { marginTop: 11 }]}>
        {items.map((e) => (
          <View key={e.label} style={[s.tile, { padding: 11 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={[s.effValue, { color: toneColor(e.tone, JO) }]}>{e.value}</Text>
              {e.trend === "down" ? (
                <TrendingDown size={14} color={JO.green} />
              ) : e.trend === "up" ? (
                <TrendingUp size={14} color={JO.red} />
              ) : null}
            </View>
            <Text style={s.tileLabel}>{e.label}</Text>
          </View>
        ))}
      </View>
      <Footnote style={{ marginTop: 9 }}>{note}</Footnote>
    </DashCard>
  );
}

/* ── Bottom sheet ──────────────────────────────────────────────────────── */

export interface SheetOption {
  key: string;
  label: string;
  meta?: string;
  metaColor?: string;
  selected?: boolean;
  onPress: () => void;
}

export function DashSheet({
  visible,
  title,
  subtitle,
  onClose,
  options,
  children,
  bottomInset = 0,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  options?: SheetOption[];
  children?: React.ReactNode;
  bottomInset?: number;
}) {
  const JO = useJo();
  const s = useS();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: 26 + bottomInset }]} onPress={() => {}}>
          <View style={s.sheetHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              {subtitle ? <Text style={s.sheetSub}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={s.sheetClose} accessibilityLabel="Close">
              <X size={19} color={JO.ink} />
            </TouchableOpacity>
          </View>
          {options ? (
            <View style={{ gap: 8, marginTop: 14 }}>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  onPress={o.onPress}
                  activeOpacity={0.8}
                  style={[
                    s.sheetRow,
                    o.selected
                      ? { backgroundColor: JO.tile, borderColor: JO.lineStrong }
                      : { backgroundColor: "transparent", borderColor: JO.line },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !!o.selected }}
                >
                  <Text style={s.sheetRowLabel} numberOfLines={1}>
                    {o.label}
                  </Text>
                  {o.meta ? (
                    <Text
                      style={[
                        s.sheetRowMeta,
                        o.metaColor ? { color: o.metaColor, fontSize: 12, fontWeight: "700" } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {o.meta}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const makeStyles = (JO: Jo) =>
  StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: JO.page,
    gap: 12,
  },
  eyebrow: { fontSize: 10, fontWeight: "700", color: JO.muted, letterSpacing: 1.4 },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: JO.ink,
    letterSpacing: -0.3,
    marginTop: 3,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    alignSelf: "flex-start",
  },
  periodText: { fontSize: 11.5, fontWeight: "600", color: JO.muted },
  headerActions: { flexDirection: "row", gap: 8 },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: JO.card,
    borderWidth: 1,
    borderColor: JO.line,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: JO.red,
    borderWidth: 1.5,
    borderColor: JO.card,
  },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { fontSize: 14, fontWeight: "800", color: JO.ink },

  card: {
    backgroundColor: JO.card,
    borderWidth: 1,
    borderColor: JO.line,
    borderRadius: 16,
    padding: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: JO.muted,
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  footnote: { fontSize: 10.5, color: JO.faint, marginTop: 8 },

  siteTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  siteNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  siteName: {
    fontSize: 15,
    fontWeight: "800",
    color: JO.ink,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  metaText: { fontSize: 11.5, color: JO.muted },
  slaChip: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 13,
    alignItems: "center",
  },
  slaChipScore: { fontSize: 17, fontWeight: "800", lineHeight: 17 },
  slaChipLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: JO.muted,
    letterSpacing: 0.5,
    marginTop: 3,
  },

  punch: {
    height: 46,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  punchText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },

  tileRow: { flexDirection: "row", gap: 8 },
  tile: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    backgroundColor: JO.tile,
    borderWidth: 1,
    borderColor: JO.line,
    borderRadius: 12,
  },
  tileDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tileValue: { fontWeight: "800" },
  tileLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: JO.muted,
    letterSpacing: 0.5,
    marginTop: 5,
  },

  barHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  barLabel: { fontSize: 12.5, fontWeight: "600", color: JO.ink, flexShrink: 1 },
  barDetail: { fontSize: 11.5, fontWeight: "700" },
  barTrack: { borderRadius: 3, backgroundColor: JO.tile, overflow: "hidden" },

  breach: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: JO.breachBg,
    borderWidth: 1,
    borderColor: JO.breachBorder,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  breachTitle: { fontSize: 12.5, fontWeight: "700", color: JO.ink },
  breachSub: { fontSize: 11, color: JO.breachSub, marginTop: 2 },


  slaHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: JO.tile,
    borderWidth: 1,
    borderColor: JO.lineStrong,
    borderRadius: 20,
    padding: 2,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { fontSize: 11.5, fontWeight: "700", color: JO.ink, paddingHorizontal: 4 },
  slaScoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  slaBig: { fontSize: 34, fontWeight: "800", letterSpacing: -1.2, lineHeight: 36 },
  slaSite: { fontSize: 12.5, fontWeight: "700", color: JO.ink },
  slaPct: { fontSize: 11, color: JO.muted, marginTop: 2 },

  effValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },

  backdrop: { flex: 1, backgroundColor: JO.backdrop, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: JO.card,
    borderTopWidth: 1,
    borderColor: JO.sheetLine,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { fontSize: 15, fontWeight: "800", color: JO.ink },
  sheetSub: { fontSize: 11, color: JO.muted, marginTop: 3 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: JO.tile,
    borderWidth: 1,
    borderColor: JO.line,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  sheetRowLabel: { fontSize: 13, fontWeight: "700", color: JO.ink, flexShrink: 1 },
  sheetRowMeta: { fontSize: 11.5, fontWeight: "600", color: JO.muted },
});

const STYLES_DARK = makeStyles(JO_DARK);
const STYLES_LIGHT = makeStyles(JO_LIGHT);

function useS() {
  return useIsDark() ? STYLES_DARK : STYLES_LIGHT;
}
