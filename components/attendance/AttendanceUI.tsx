/**
 * Attendance tab presentation — Claude Design "JouleOps App" artboard,
 * attendance section: accent hero (shift pill, big duration, In/Out well,
 * black punch button, geofence line), 7-day week strip and the month card
 * with All / Flagged / Full filters over hairline history rows.
 *
 * Pure presentation: every handler and value comes from the screen.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx, type BxName } from "@/components/jo/Bx";
import {
  GlossFill,
  Card,
  Chip,
  HeroCard,
  HeroTag,
  JoSheet,
  PrimaryButton,
  SecondaryButton,
  Shimmer,
  StatusPill,
  f,
  useJoTheme,
  type JoTheme,
} from "@/components/jo/ui";
import { JO_DARK } from "@/constants/jo";
import type { AttendanceLog, Site } from "@/services/AttendanceService";
import {
  EARLY_CHECKOUT_MINUTES,
  dateKeyParts,
  durationMinutes,
  formatHm,
  logDateKey,
  safeTime,
  type DayKind,
  type WeekCell,
} from "./lib";

/**
 * The hero's pill and punch button are ALWAYS near-black (artboard #0A0A0C)
 * whatever the page theme, so whatever sits on them takes the dark palette.
 */
const ON_BLACK = JO_DARK;

/* ── Hero ──────────────────────────────────────────────────────────────── */

export function AttendanceHero({
  pillLabel,
  pillOn,
  hours,
  mins,
  inTime,
  outTime,
  punch,
  geoNote,
  geoError,
  roleNote,
}: {
  pillLabel: string;
  pillOn: boolean;
  hours: string;
  mins: string;
  inTime: string;
  outTime: string;
  /** Null for roles that never punch (managers, regional managers, admins). */
  punch: { label: string; icon: BxName; onPress: () => void; busy: boolean } | null;
  geoNote: string;
  geoError: boolean;
  /** Shown instead of the geofence line when there is no punch button. */
  roleNote?: string;
}) {
  const t = useJoTheme();
  const unit = [f.t(15, 600), { color: t.onAccent, opacity: 0.7, marginBottom: 8 }];
  return (
    <HeroCard rings={1} radius={26} style={{ marginTop: 14, padding: 16 }}>
      <HeroTag label={pillLabel} color={pillOn ? ON_BLACK.ok : ON_BLACK.ink2} dot />

      <View
        style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 12 }}
        accessible
        accessibilityLabel={`Worked today: ${hours} hours ${mins} minutes`}
      >
        <Text style={[f.d(54, -0.05), { color: t.onAccent }]}>{hours}</Text>
        <Text style={[unit, { marginLeft: 4, marginRight: 10 }]}>h</Text>
        <Text style={[f.d(54, -0.05), { color: t.onAccent }]}>{mins}</Text>
        <Text style={[unit, { marginLeft: 4 }]}>m</Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          marginTop: 14,
          backgroundColor: t.heroWell,
          borderRadius: 14,
          paddingVertical: 9,
        }}
      >
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={[f.t(11, 500), { color: t.onAccent, opacity: 0.68 }]}>In</Text>
          <Text style={[f.t(15, 700), { color: t.onAccent, marginTop: 2 }]}>{inTime}</Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 12, borderLeftWidth: 1, borderLeftColor: t.heroDivider }}>
          <Text style={[f.t(11, 500), { color: t.onAccent, opacity: 0.68 }]}>Out</Text>
          <Text style={[f.t(15, 700), { color: t.onAccent, marginTop: 2 }]}>{outTime}</Text>
        </View>
      </View>

      {punch ? (
        <TouchableOpacity
          onPress={punch.onPress}
          disabled={punch.busy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={punch.label}
          accessibilityState={{ disabled: punch.busy, busy: punch.busy }}
          style={{
            height: 48,
            marginTop: 12,
            borderRadius: 24,
            backgroundColor: ON_BLACK.page,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            opacity: punch.busy ? 0.8 : 1,
          }}
        >
          <GlossFill color={ON_BLACK.page} fg={ON_BLACK.ink} radius={24} />
          {punch.busy ? (
            <ActivityIndicator size="small" color={ON_BLACK.ink} />
          ) : (
            <>
              <Bx name={punch.icon} size={19} color={ON_BLACK.ink} />
              <Text style={[f.t(14, 600), { color: ON_BLACK.ink }]}>{punch.label}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, opacity: 0.72 }}>
        <Bx
          name={punch ? (geoError ? "bx-error" : "bx-map-pin") : "bx-info-circle"}
          size={14}
          color={t.onAccent}
        />
        <Text style={[f.t(11.5), { color: t.onAccent, flexShrink: 1 }]} numberOfLines={2}>
          {punch ? geoNote : roleNote}
        </Text>
      </View>
    </HeroCard>
  );
}

/* ── Week strip ────────────────────────────────────────────────────────── */

const WEEK_LABEL: Record<WeekCell["kind"], string> = {
  today: "today",
  full: "full shift",
  active: "on shift",
  short: "early checkout",
  missed: "missed",
  leave: "leave",
  none: "no record",
};

function weekColors(t: JoTheme, kind: WeekCell["kind"]) {
  switch (kind) {
    case "today":
      return { bg: t.accent, fg: t.onAccent, bd: "transparent" };
    case "full":
    case "active":
      return { bg: t.okTint, fg: t.ok, bd: "transparent" };
    case "short":
      return { bg: t.warnTint, fg: t.warn, bd: "transparent" };
    case "missed":
      return { bg: t.badTint, fg: t.bad, bd: "transparent" };
    case "leave":
      return { bg: t.infoTint, fg: t.info, bd: "transparent" };
    default:
      return { bg: "transparent", fg: t.faint, bd: t.lineMid };
  }
}

export function WeekStrip({ cells }: { cells: WeekCell[] }) {
  const t = useJoTheme();
  return (
    <Card radius={22} style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 8, flexDirection: "row", gap: 4 }}>
      {cells.map((c) => {
        const col = weekColors(t, c.kind);
        return (
          <View
            key={c.key}
            style={{ flex: 1, alignItems: "center", gap: 6 }}
            accessible
            accessibilityLabel={`${c.dow} ${c.day}, ${WEEK_LABEL[c.kind]}`}
          >
            <Text style={[f.t(10.5), { color: t.muted }]}>{c.dow}</Text>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: col.bg,
                borderWidth: 1.5,
                borderColor: col.bd,
              }}
            >
              {c.kind === "today" ? <GlossFill color={col.bg} fg={col.fg} radius={16} bleed={1.5} /> : null}
              <Text style={[f.t(12.5, 600), { color: col.fg }]}>{c.day}</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/* ── Month card ────────────────────────────────────────────────────────── */

export const HISTORY_FILTERS = ["All", "Flagged", "Full"] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

function MonthStep({
  icon,
  enabled,
  onPress,
  label,
}: {
  icon: BxName;
  enabled: boolean;
  onPress: () => void;
  label: string;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!enabled}
      activeOpacity={0.7}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: t.raised,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Bx name={icon} size={19} color={enabled ? t.ink : t.faint} />
    </TouchableOpacity>
  );
}

export function MonthCard({
  label,
  summary,
  hasOlder,
  hasNewer,
  onOlder,
  onNewer,
  filter,
  onFilter,
  loading,
  error,
  onRetry,
  rows,
  emptyText,
  now,
  onCustomRange,
  onClearCustomRange,
}: {
  label: string;
  summary: string;
  hasOlder: boolean;
  hasNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  /** Opens the custom date-range sheet. */
  onCustomRange?: () => void;
  /** Set while a custom range is shown: back to the month view. */
  onClearCustomRange?: () => void;
  filter: HistoryFilter;
  onFilter: (f: HistoryFilter) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  rows: { log: AttendanceLog; kind: DayKind }[];
  emptyText: string;
  now: Date;
}) {
  const t = useJoTheme();
  return (
    <Card style={{ marginTop: 12, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[f.t(15, 600), { color: t.ink }]}>{label}</Text>
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {onCustomRange ? (
            <MonthStep icon="bx-calendar-edit" enabled onPress={onCustomRange} label="Custom date range" />
          ) : null}
          {onClearCustomRange ? (
            <MonthStep icon="bx-x" enabled onPress={onClearCustomRange} label="Back to monthly view" />
          ) : (
            <>
              <MonthStep icon="bx-chevron-left" enabled={hasOlder} onPress={onOlder} label="Previous month" />
              <MonthStep icon="bx-chevron-right" enabled={hasNewer} onPress={onNewer} label="Next month" />
            </>
          )}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
        {HISTORY_FILTERS.map((k) => (
          <Chip key={k} label={k} height={32} selected={filter === k} onPress={() => onFilter(k)} />
        ))}
      </View>

      <View style={{ marginTop: 8 }}>
        {loading ? (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 11,
                borderTopWidth: 1,
                borderTopColor: t.line,
              }}
            >
              <Shimmer height={34} radius={10} style={{ width: 40 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Shimmer height={12} radius={6} style={{ width: "70%" }} />
                <Shimmer height={10} radius={5} style={{ width: "45%" }} />
              </View>
              <Shimmer height={14} radius={7} style={{ width: 48 }} />
            </View>
          ))
        ) : rows.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: t.line }}>
            <Bx name={error ? "bx-error-circle" : "bx-calendar-check"} size={24} color={error ? t.bad : t.faint} />
            <Text style={[f.t(13, 500), { color: t.muted, textAlign: "center" }]}>
              {error ? "Couldn't load attendance" : emptyText}
            </Text>
            {error ? (
              <TouchableOpacity onPress={onRetry} accessibilityRole="button" hitSlop={8}>
                <Text style={[f.t(13, 600), { color: t.accentInk }]}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          rows.map((row) => <HistoryRow key={row.log.id} log={row.log} kind={row.kind} now={now} />)
        )}
      </View>
    </Card>
  );
}

/* ── History row ───────────────────────────────────────────────────────── */

const HistoryRow = React.memo(function HistoryRow({
  log,
  kind,
  now,
}: {
  log: AttendanceLog;
  kind: DayKind;
  now: Date;
}) {
  const t = useJoTheme();
  const mins = durationMinutes(log, now);
  const { day, dow } = dateKeyParts(logDateKey(log));
  const inT = safeTime(log.check_in_time, "h:mm a");
  const outT = safeTime(log.check_out_time, "h:mm a");

  const times =
    kind === "leave" || !log.check_in_time ? "No punches" : `${inT} → ${outT}`;

  let note: string;
  let noteColor: string;
  if (kind === "full") {
    note = "Full shift";
    noteColor = t.muted;
  } else if (kind === "active") {
    note = "On shift · in progress";
    noteColor = t.ok;
  } else if (kind === "short") {
    const shortBy = Math.max(0, EARLY_CHECKOUT_MINUTES - (mins ?? 0));
    note = `Early checkout · ${formatHm(shortBy)} short`;
    noteColor = t.warn;
  } else if (kind === "leave") {
    note = "Leave";
    noteColor = t.info;
  } else {
    note = log.check_in_time ? "Missed checkout" : log.status === "Absent" ? "Absent" : "No check-in";
    noteColor = t.bad;
  }

  const showDur = kind !== "leave" && kind !== "missed" && mins != null;
  const durColor = !showDur ? t.faint : kind === "short" ? t.warn : t.ink;
  const site = log.site_name || log.site_code || "No site";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 11,
        borderTopWidth: 1,
        borderTopColor: t.line,
      }}
    >
      <View style={{ width: 40, alignItems: "center", flexShrink: 0 }}>
        <Text style={[f.d(19, -0.025, 1.05), { color: t.ink }]}>{day}</Text>
        <Text style={[f.t(10.5), { color: t.muted, marginTop: 2 }]}>{dow}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(13, 500), { color: t.ink }]} numberOfLines={1}>
          {times}
        </Text>
        <Text style={[f.t(11.5), { color: noteColor, marginTop: 2 }]} numberOfLines={1}>
          {note} · <Text style={{ color: t.muted }}>{site}</Text>
        </Text>
      </View>
      <Text style={[f.t(13, 600), { color: durColor }]}>{showDur ? formatHm(mins) : "—"}</Text>
    </View>
  );
});

/* ── Offline note ──────────────────────────────────────────────────────── */

export function OfflineNote() {
  const t = useJoTheme();
  return (
    <View
      style={{
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 18,
        backgroundColor: t.warnTint,
      }}
      accessibilityLiveRegion="polite"
    >
      <Bx name="bx-wifi-off" size={16} color={t.warn} />
      <Text style={[f.t(12.5, 500), { color: t.warn, flex: 1 }]}>
        Offline · showing saved attendance. Punches sync when you reconnect.
      </Text>
    </View>
  );
}

/* ── Site picker sheet ─────────────────────────────────────────────────── */

export function SiteSheet({
  visible,
  sites,
  onClose,
  onSelect,
}: {
  visible: boolean;
  sites: Site[];
  onClose: () => void;
  onSelect: (siteCode: string) => void;
}) {
  const t = useJoTheme();
  return (
    <JoSheet
      visible={visible}
      onClose={onClose}
      title="Select site"
      subtitle="More than one site is in range — pick where you are checking in."
    >
      <ScrollView style={{ marginTop: 14, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {sites.map((site) => {
          const distance = site.distanceMeters ?? site.distance;
          return (
            <TouchableOpacity
              key={site.site_code}
              onPress={() => onSelect(site.site_code)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Check in at ${site.name}${distance !== undefined ? `, ${distance} metres away` : ""}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 60,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.sheetField,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: t.raised,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bx name="bx-map-pin" size={18} color={t.accentInk} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[f.t(14.5, 600), { color: t.ink }]} numberOfLines={1}>
                  {site.name}
                </Text>
                {site.address ? (
                  <Text style={[f.t(12), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
                    {site.address}
                  </Text>
                ) : null}
              </View>
              {distance !== undefined ? <StatusPill label={`${distance} m`} tone="info" /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </JoSheet>
  );
}

/* ── Early-checkout reason sheet ───────────────────────────────────────── */

/**
 * JoSheet's look, wrapped in a KeyboardAvoidingView so the reason field
 * stays above the keyboard (JoSheet itself doesn't avoid it).
 */
export function EarlyCheckoutSheet({
  visible,
  hoursWorked,
  reason,
  onChangeReason,
  onCancel,
  onSubmit,
  busy,
}: {
  visible: boolean;
  hoursWorked: string;
  reason: string;
  onChangeReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      {/* Plain Modal + native slide, like the PM sign sheet. Reanimated
          entering animations inside a Modal left the sheet's buttons
          unreachable on Android — taps fell through to this backdrop
          (see components/sitelogs/SignatureSheet). */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}
        onPress={onCancel}
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <View
          style={{
            marginHorizontal: 8,
            marginBottom: 8 + insets.bottom,
            backgroundColor: t.input,
            borderWidth: 1,
            borderColor: t.lineMid,
            borderRadius: 38,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 22,
          }}
        >
          <View
            style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.handle, alignSelf: "center", marginBottom: 18 }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: t.warnTint,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bx name="bx-time-five" size={19} color={t.warn} />
            </View>
            <Text style={[f.d(22, -0.02), { color: t.ink, flexShrink: 1 }]}>Early checkout</Text>
          </View>
          <Text style={[f.t(12.5), { color: t.muted, marginTop: 8, lineHeight: 18 }]}>
            You worked {hoursWorked} hours (less than 7h). Please give a reason.
          </Text>

          <Text style={[f.t(12.5, 500), { color: t.ink3, marginTop: 16, marginBottom: 7, paddingHorizontal: 4 }]}>
            Reason <Text style={{ color: t.bad }}>*</Text>
          </Text>
          <TextInput
            value={reason}
            onChangeText={onChangeReason}
            placeholder="Enter reason here…"
            placeholderTextColor={t.faint}
            multiline
            textAlignVertical="top"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel="Early checkout reason"
            style={[
              f.t(14),
              {
                minHeight: 100,
                borderRadius: 20,
                backgroundColor: t.sheetField,
                borderWidth: 1.5,
                borderColor: focused ? t.accent : "transparent",
                color: t.ink,
                paddingHorizontal: 16,
                paddingTop: 13,
                paddingBottom: 13,
                lineHeight: 20,
              },
            ]}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <SecondaryButton label="Cancel" onPress={onCancel} style={{ flex: 1 }} />
            <PrimaryButton
              label="Punch out"
              icon="bx-log-out-circle"
              onPress={onSubmit}
              busy={busy}
              height={52}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
