/**
 * Top of every Ops / Resources screen (Ops shown):
 *
 *   [site ▾]                              [📅 This month · 01–31 Oct ▾]
 *   Tickets   PM   Site Logs   Incidents   Assets
 *   ───────
 *
 * The site and the date range sit ABOVE the sub-tabs because they apply to
 * all of them: the site is the app-wide selection (useSites), the range is the
 * shared Ops range (services/OpsDateRange). Screens without a date dimension
 * (Assets) pass `showDate={false}`.
 *
 * Sub-tabs are text tabs over a hairline, the active one in ink with an
 * accent underline the width of its label. The bottom bar's "Ops" /
 * "Resources" item opens the last one used. Sub-tabs the role can't view are
 * left out. Sub-tabs flagged `isNew` carry a small "New" badge.
 *
 * Resources (SLA · Efficiency · Reports · Client comms) shows the site only — SLA is
 * monthly and Reports has its own periods, so the shared Ops range doesn't
 * apply there.
 */
import React, { useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { router, usePathname } from "expo-router";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import { SUB_TABS, rememberSubTab, type SubTabGroup } from "@/components/jo/modules";
import {
  DateButton,
  GlossFill,
  JoSheet,
  NewBadge,
  PrimaryButton,
  SheetOption,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { Bx } from "@/components/jo/Bx";
import {
  PRESET_LABEL,
  formatOpsRange,
  rangeForPreset,
  setOpsDateRange,
  useOpsDateRange,
  type OpsDatePreset,
} from "@/services/OpsDateRange";
import { istDateString } from "@/utils/istDate";

const PRESETS: Exclude<OpsDatePreset, "custom">[] = ["today", "week", "month", "lastMonth", "last3"];

/** "YYYY-MM-DD" → local-noon Date for the picker (clear of midnight edges). */
function isoToPickerDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

export function OpsTabs({ showDate = true }: { showDate?: boolean }) {
  return <SubTabsHeader group="ops" showDate={showDate} />;
}

export function ResourcesTabs() {
  return <SubTabsHeader group="resources" showDate={false} />;
}

function SubTabsHeader({ group, showDate }: { group: SubTabGroup; showDate: boolean }) {
  const t = useJoTheme();
  const s = useStyles();
  const pathname = usePathname();
  const { canView } = usePermissions();
  const { user } = useAuth();
  const { sites, selectedSite, selectSite } = useSites(user?.user_id || user?.id);
  const range = useOpsDateRange();
  const [sheet, setSheet] = useState<null | "site" | "date" | "custom">(null);
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const [pickerFor, setPickerFor] = useState<null | "from" | "to">(null);

  const tabs = SUB_TABS[group].filter((o) => canView(o.perm));
  const active = tabs.find((o) => pathname === o.path || pathname.startsWith(`${o.path}/`))?.key;

  React.useEffect(() => {
    if (active) rememberSubTab(group, active);
  }, [group, active]);

  const siteName = selectedSite?.site_name || selectedSite?.site_code || "Select site";
  const canSwitchSite = sites.length > 1;

  const close = () => {
    setSheet(null);
    setPickerFor(null);
  };

  const onPickDate = (_e: unknown, date?: Date) => {
    const which = pickerFor;
    if (Platform.OS !== "ios") setPickerFor(null);
    if (!date || !which) return;
    const iso = istDateString(date);
    setDraft((r) => {
      const next = { ...r, [which]: iso };
      if (next.from > next.to) {
        if (which === "from") next.to = next.from;
        else next.from = next.to;
      }
      return next;
    });
  };

  return (
    <View>
      {/* ── Site + date: apply to every sub-tab ── */}
      <View style={s.filters}>
        <TouchableOpacity
          onPress={canSwitchSite ? () => setSheet("site") : undefined}
          disabled={!canSwitchSite}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Site: ${siteName}${canSwitchSite ? ". Change site" : ""}`}
          style={s.site}
        >
          <Bx name="bx-buildings" size={16} color={t.accentInk} />
          <Text style={[f.t(12.5, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
            {siteName}
          </Text>
          {canSwitchSite ? <Bx name="bx-chevron-down" size={16} color={t.muted} /> : null}
        </TouchableOpacity>
        {showDate ? (
          <DateButton
            label={PRESET_LABEL[range.preset]}
            meta={formatOpsRange(range.from, range.to)}
            onPress={() => setSheet("date")}
            style={{ flexShrink: 1 }}
          />
        ) : null}
      </View>

      {/* ── Sub-tabs ── */}
      {tabs.length > 1 ? (
        <View style={s.wrap} accessibilityRole="tablist">
          {tabs.map((o) => {
            const on = o.key === active;
            return (
              <TouchableOpacity
                key={o.key}
                onPress={() => {
                  if (on) return;
                  router.navigate(o.href as any);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.isNew ? `${o.label}, new` : o.label}
                style={s.tab}
              >
                {/* Shrink-wrapped so the underline matches the label's width. */}
                <View style={s.labelWrap}>
                  <Text
                    style={[f.t(13.5, on ? 600 : 500), { color: on ? t.ink : t.muted }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {o.label}
                  </Text>
                  <View style={[s.underline, { backgroundColor: on ? t.accent : "transparent" }]}>
                    {on ? <GlossFill color={t.accent} radius={{ topLeft: 2, topRight: 2 }} /> : null}
                  </View>
                  {/* Out of flow, in the tab's top padding, so it never squeezes the label. */}
                  {o.isNew ? <NewBadge style={s.newBadge} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* ── Sheets ── */}
      <JoSheet visible={sheet === "site"} onClose={close} title="Site" subtitle="Applies across the app.">
        <ScrollView style={{ maxHeight: 420, marginTop: 16 }} contentContainerStyle={{ gap: 6 }}>
          {sites.map((site) => (
            <SheetOption
              key={site.site_code}
              label={site.site_name || site.site_code}
              meta={site.site_code}
              selected={site.site_code === selectedSite?.site_code}
              onPress={() => {
                void selectSite(site);
                close();
              }}
            />
          ))}
        </ScrollView>
      </JoSheet>

      <JoSheet visible={sheet === "date"} onClose={close} title="Date range" subtitle="Applies to Tickets, PM, Site Logs history and Incidents.">
        <View style={{ gap: 6, marginTop: 16 }}>
          {PRESETS.map((p) => {
            const r = rangeForPreset(p);
            return (
              <SheetOption
                key={p}
                label={PRESET_LABEL[p]}
                meta={formatOpsRange(r.from, r.to)}
                selected={range.preset === p}
                onPress={() => {
                  setOpsDateRange(r);
                  close();
                }}
              />
            );
          })}
          <SheetOption
            label="Custom range"
            meta={range.preset === "custom" ? formatOpsRange(range.from, range.to) : "Pick dates"}
            selected={range.preset === "custom"}
            onPress={() => {
              setDraft({ from: range.from, to: range.to });
              setSheet("custom");
            }}
          />
        </View>
      </JoSheet>

      <JoSheet visible={sheet === "custom"} onClose={close} title="Custom range">
        <View style={s.rangeRow}>
          {(["from", "to"] as const).map((which) => (
            <TouchableOpacity
              key={which}
              style={[s.rangeField, pickerFor === which ? { borderColor: t.accent } : null]}
              activeOpacity={0.8}
              onPress={() => setPickerFor(pickerFor === which ? null : which)}
              accessibilityRole="button"
              accessibilityLabel={`${which === "from" ? "From" : "To"} date, ${formatOpsRange(draft[which], draft[which])}`}
            >
              <Text style={[f.t(11), { color: t.muted }]}>{which === "from" ? "From" : "To"}</Text>
              <Text style={[f.t(14.5, 600), { color: t.ink, marginTop: 4 }]}>
                {formatOpsRange(draft[which], draft[which], "")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {pickerFor ? (
          <DateTimePicker
            value={isoToPickerDate(draft[pickerFor])}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onPickDate}
          />
        ) : null}
        <PrimaryButton
          label="Apply range"
          style={{ marginTop: 14 }}
          onPress={() => {
            setOpsDateRange({ preset: "custom", from: draft.from, to: draft.to });
            close();
          }}
        />
      </JoSheet>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  filters: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  site: {
    height: 36,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 11,
    paddingRight: 10,
    borderRadius: 18,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.09)" : t.lineMid,
  },
  wrap: {
    flexDirection: "row",
    marginTop: 6,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.lineMid,
  },
  // Each tab is its label's width plus an equal share of the spare room, so
  // the gaps between labels match (flex: 1 gave every tab the same width,
  // leaving "PM" floating in a wide box next to a tight "Incidents").
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  labelWrap: {
    alignItems: "stretch",
    maxWidth: "100%",
  },
  // Superscript: up in the tab's top padding, past the label's end.
  newBadge: { position: "absolute", top: -12, right: -14 },
  underline: {
    height: 3,
    marginTop: 9,
    // Sits on the strip's hairline.
    marginBottom: -1,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  rangeRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  rangeField: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    backgroundColor: t.sheetField,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
}));
