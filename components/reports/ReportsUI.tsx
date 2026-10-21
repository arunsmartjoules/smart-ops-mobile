/**
 * Building blocks for the Reports tab, measured off the "JouleOps App"
 * artboard's Reports screen (px → dp 1:1). Colours come from the Jo theme.
 */
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import {
  Building2,
  Check,
  ChevronDown,
  Download,
  FileText,
  type LucideIcon,
} from "lucide-react-native";
import { Card, Shimmer, StatusPill, capsStyle, f, makeJoStyles, useJoTheme, type JoTheme } from "@/components/jo/ui";
import type { JoTone } from "@/constants/jo";
import type { DocSite, DocStat, DocTone } from "@/services/ReportsService";

/** Pill / chip outlines: the artboard's white alphas in dark, theme lines in light. */
const hair = (t: JoTheme, darkAlpha: number, light: string) =>
  t.isDark ? `rgba(255,255,255,${darkAlpha})` : light;

export function toneColor(t: JoTheme, tone: DocTone): string {
  if (tone === "ink") return t.ink;
  if (tone === "mute") return t.muted;
  return t[tone];
}

const useStyles = makeJoStyles((t) => ({
  sitePill: {
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
    borderColor: hair(t, 0.09, t.lineMid),
    maxWidth: "100%",
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    marginTop: 14,
    padding: 4,
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  control: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 21,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: hair(t, 0.07, t.lineMid),
  },
  moduleCard: { borderRadius: 22, paddingVertical: 13, paddingHorizontal: 14 },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  dlButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  formats: { flexDirection: "row", gap: 6, marginTop: 11, paddingLeft: 52 },
  format: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  strip: { flexDirection: "row", gap: 6 },
  stripItem: {
    flex: 1,
    minWidth: 0,
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  docCard: { marginTop: 12, padding: 16 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  stat: {
    flexGrow: 1,
    flexBasis: "45%",
    borderRadius: 16,
    backgroundColor: t.raised,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bar: { position: "absolute", left: 16, right: 16, bottom: 16, flexDirection: "row", gap: 8, zIndex: 6 },
  cta: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: t.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: t.isDark ? 0.7 : 0.18,
    shadowRadius: 15,
    elevation: 8,
  },
}));

/* ── Header ──────────────────────────────────────────────────────────── */

/** Site switcher above the title: buildings icon in accent · name · chevron. */
export function SitePill({ label, onPress }: { label: string; onPress?: () => void }) {
  const t = useJoTheme();
  const st = useStyles();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Site: ${label}. Change site`}
      style={st.sitePill}
    >
      <Building2 size={14} color={t.accentInk} />
      <Text style={[f.t(12.5, 500), { color: t.ink2, flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={15} color={t.muted} />
    </TouchableOpacity>
  );
}

export function ReportTabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const t = useJoTheme();
  const st = useStyles();
  return (
    <View style={st.tabs} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[st.tab, { backgroundColor: on ? t.selBg : "transparent" }]}
          >
            <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.muted }]} numberOfLines={1}>
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ── Modules tab ─────────────────────────────────────────────────────── */

/** 42-high rounded control (period / site) above the module list. */
export function ControlPill({
  icon: Icon,
  iconColor,
  label,
  chevron,
  grow,
  onPress,
  a11yLabel,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  chevron?: boolean;
  grow?: boolean;
  onPress?: () => void;
  a11yLabel: string;
}) {
  const t = useJoTheme();
  const st = useStyles();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={[st.control, grow ? { flex: 1, minWidth: 0 } : { flexShrink: 1, maxWidth: "45%" }]}
    >
      <Icon size={15} color={iconColor} />
      <Text style={[f.t(12.5, 500), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {chevron ? (
        <View style={{ marginLeft: "auto" }}>
          <ChevronDown size={16} color={t.muted} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export type DownloadState = "idle" | "busy" | "done";

export interface FormatOption {
  label: string;
  available: boolean;
}

export function ModuleCard({
  icon: Icon,
  label,
  sub,
  subLoading,
  formats,
  format,
  onPickFormat,
  state,
  onDownload,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  subLoading?: boolean;
  formats: FormatOption[];
  format: string;
  onPickFormat: (label: string) => void;
  state: DownloadState;
  onDownload: () => void;
}) {
  const t = useJoTheme();
  const st = useStyles();
  const done = state === "done";
  const busy = state === "busy";
  return (
    <Card style={st.moduleCard} radius={22}>
      <View style={st.moduleRow}>
        <View style={st.moduleIcon}>
          <Icon size={19} color={t.ink2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[f.t(14, 600), { color: t.ink }]} numberOfLines={1}>
            {label}
          </Text>
          {subLoading ? (
            <Shimmer height={12} radius={6} style={{ width: 110, marginTop: 4 }} />
          ) : (
            <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={onDownload}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={done ? `${label} downloaded. Download again as ${format}` : `Download ${label} as ${format}`}
          accessibilityState={{ busy, disabled: busy }}
          style={[st.dlButton, { backgroundColor: done ? t.okTint : t.accent }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.onAccent} />
          ) : done ? (
            <Check size={19} color={t.ok} />
          ) : (
            <Download size={19} color={t.onAccent} />
          )}
        </TouchableOpacity>
      </View>
      <View style={st.formats}>
        {formats.map((fm) => {
          const on = fm.label === format;
          return (
            <TouchableOpacity
              key={fm.label}
              onPress={() => onPickFormat(fm.label)}
              disabled={!fm.available}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityLabel={fm.available ? fm.label : `${fm.label}, not available for ${label}`}
              accessibilityState={{ selected: on, disabled: !fm.available }}
              style={[
                st.format,
                {
                  backgroundColor: on ? hair(t, 0.08, t.raised) : "transparent",
                  borderColor: on ? hair(t, 0.22, t.lineStrong) : hair(t, 0.07, t.lineMid),
                  opacity: fm.available ? 1 : 0.4,
                },
              ]}
            >
              <Text style={[f.t(11.5, 600), { color: on ? t.ink : t.muted }]}>{fm.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

/* ── Daily / MTD tabs ────────────────────────────────────────────────── */

export function DateStrip({
  items,
  value,
  onChange,
}: {
  items: { key: string; top: string; main: string; a11y: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const t = useJoTheme();
  const st = useStyles();
  return (
    <View style={st.strip}>
      {items.map((it) => {
        const on = it.key === value;
        const fg = on ? t.onAccent : t.ink;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={it.a11y}
            accessibilityState={{ selected: on }}
            style={[
              st.stripItem,
              { backgroundColor: on ? t.accent : t.card, borderColor: on ? t.accent : t.cardBorder },
            ]}
          >
            <Text style={[f.t(10.5), { color: fg, opacity: 0.75 }]} numberOfLines={1}>
              {it.top}
            </Text>
            <Text style={[f.d(17, 0), { color: fg }]} numberOfLines={1}>
              {it.main}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function DocCard({
  kicker,
  title,
  sub,
  badge,
  stats,
  sites,
}: {
  kicker: string;
  title: string;
  sub: string;
  badge: { label: string; tone: JoTone };
  stats: DocStat[];
  sites: DocSite[];
}) {
  const t = useJoTheme();
  const st = useStyles();
  return (
    <Card style={st.docCard}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={[capsStyle(11.5, 0.06), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
          {kicker}
        </Text>
        <StatusPill label={badge.label} tone={badge.tone} />
      </View>
      <Text style={[f.d(22, -0.02, 1.15), { color: t.ink, marginTop: 8 }]}>{title}</Text>
      <Text style={[f.t(12), { color: t.muted, marginTop: 4 }]}>{sub}</Text>
      <View style={st.statGrid}>
        {stats.map((x) => (
          <View key={x.label} style={st.stat} accessible accessibilityLabel={`${x.label}: ${x.value}`}>
            <Text style={[f.d(20, -0.02), { color: toneColor(t, x.tone) }]} numberOfLines={1}>
              {x.value}
            </Text>
            <Text style={[f.t(11), { color: t.ink3, marginTop: 4 }]} numberOfLines={2}>
              {x.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[f.t(12.5, 600), { color: t.ink, marginTop: 16 }]}>Sites included</Text>
      {sites.length === 0 ? (
        <Text style={[f.t(12), { color: t.muted, marginTop: 6, paddingVertical: 9 }]}>
          No site had activity in this period.
        </Text>
      ) : (
        sites.map((x, i) => (
          <View
            key={x.siteCode}
            style={[st.siteRow, { marginTop: i ? 0 : 6 }]}
            accessible
            accessibilityLabel={`${x.name}: ${x.meta}`}
          >
            <Text style={[f.t(13), { color: t.ink, flex: 1 }]} numberOfLines={1}>
              {x.name}
            </Text>
            <Text style={[f.t(12), { color: t.muted }]} numberOfLines={1}>
              {x.meta}
            </Text>
            <View style={[st.dot, { backgroundColor: toneColor(t, x.tone) }]} />
          </View>
        ))
      )}
    </Card>
  );
}

/** Loading placeholder shaped like the document card. */
export function DocCardSkeleton() {
  const st = useStyles();
  return (
    <Card style={st.docCard}>
      <Shimmer height={12} radius={6} style={{ width: 170 }} />
      <Shimmer height={24} radius={8} style={{ width: 200, marginTop: 12 }} />
      <Shimmer height={12} radius={6} style={{ width: 140, marginTop: 8 }} />
      <View style={st.statGrid}>
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} height={58} radius={16} style={{ flexGrow: 1, flexBasis: "45%" }} />
        ))}
      </View>
      {[0, 1, 2].map((i) => (
        <Shimmer key={i} height={14} radius={6} style={{ marginTop: i ? 14 : 22 }} />
      ))}
    </Card>
  );
}

/** Bottom action bar: the accent "Download PDF" button. */
export function DownloadBar({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const t = useJoTheme();
  const st = useStyles();
  return (
    <View style={st.bar} pointerEvents="box-none">
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Download PDF"
        accessibilityState={{ busy, disabled: busy }}
        style={st.cta}
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <>
            <FileText size={18} color={t.onAccent} />
            <Text style={[f.t(14, 700), { color: t.onAccent }]}>Download PDF</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}
