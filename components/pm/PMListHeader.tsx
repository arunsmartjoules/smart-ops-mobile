/**
 * Preventive-maintenance list chrome — artboard `r_pm` (app.dc.html 625–663):
 * search + filter button, the status chip strip with counts, and the
 * "N PMs · sort" line. The site, the date range and the screen name live in
 * the shared Ops header (<OpsTabs />) above this.
 *
 * Features the artboard doesn't draw are presented in the same language:
 * the asset-QR scan sits inside the search field, an active QR filter is a
 * removable pill above the count line, and offline / read-only states are
 * slim tinted notices.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Bx, type BxName } from "@/components/jo/Bx";
import { Chip, SearchField, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";

export interface PMChip {
  key: string;
  label: string;
  count: number;
}

const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16 },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chips: { marginTop: 12, marginHorizontal: -16 },
  chipsInner: { paddingHorizontal: 16, gap: 6 },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  count: { ...f.t(13), color: t.muted },
  countNum: { ...f.t(13, 600), color: t.ink },
  sort: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortText: { ...f.t(12.5), color: t.muted },
  qrPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingLeft: 10,
    paddingRight: 8,
    marginTop: 10,
    borderRadius: 15,
    backgroundColor: t.accentTint,
    borderWidth: 1,
    borderColor: t.accent,
    maxWidth: "100%",
  },
  qrText: { ...f.t(12, 600), color: t.ink, flexShrink: 1 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  noticeText: { ...f.t(12), flex: 1, lineHeight: 16.5 },
}));

export function PMNotice({
  icon,
  text,
  tone,
}: {
  icon: BxName;
  text: string;
  tone: "warn" | "mute";
}) {
  const t = useJoTheme();
  const s = useStyles();
  const fg = tone === "warn" ? t.warn : t.ink2;
  return (
    <View
      style={[
        s.notice,
        {
          backgroundColor: tone === "warn" ? t.warnTint : t.muteTint,
          borderColor: tone === "warn" ? t.warnTint : t.line,
        },
      ]}
      accessibilityRole="alert"
    >
      <Bx name={icon} size={17} color={fg} />
      <Text style={[s.noticeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function PMListHeader({
  search,
  onChangeSearch,
  onScanPress,
  onFilterPress,
  filterActive,
  chips,
  activeChip,
  onSelectChip,
  count,
  sortLabel,
  onSort,
  qrAssetFilter,
  onClearQr,
  offline,
  readOnly,
}: {
  search: string;
  onChangeSearch: (v: string) => void;
  onScanPress: () => void;
  /** Opens the PM filter sheet (which date column, status). */
  onFilterPress: () => void;
  /** True when a non-default filter is applied — the button fills. */
  filterActive: boolean;
  chips: PMChip[];
  activeChip: string;
  onSelectChip: (key: string) => void;
  count: number;
  sortLabel: string;
  onSort: () => void;
  qrAssetFilter: string | null;
  onClearQr: () => void;
  offline: boolean;
  readOnly: boolean;
}) {
  const t = useJoTheme();
  const s = useStyles();

  return (
    <View style={s.top}>
      <View style={s.searchRow}>
        <SearchField
          value={search}
          onChangeText={onChangeSearch}
          placeholder="Search asset, PM type or area"
          style={{ flex: 1, minWidth: 0 }}
          right={
            <TouchableOpacity
              onPress={onScanPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Scan asset QR code"
            >
              <Bx name="bx-qr-scan" size={18} color={t.accentInk} />
            </TouchableOpacity>
          }
        />
        <TouchableOpacity
          style={[
            s.filterBtn,
            filterActive && { backgroundColor: t.selBg, borderColor: t.selBg },
          ]}
          onPress={onFilterPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Filter PM tasks${filterActive ? ", filters applied" : ""}`}
          accessibilityState={{ selected: filterActive }}
        >
          <Bx
            name="bx-slider-alt"
            size={19}
            color={filterActive ? t.selFg : t.ink}
          />
        </TouchableOpacity>
      </View>

      {offline ? (
        <PMNotice
          icon="bx-wifi-off"
          tone="warn"
          text="Offline — showing PMs saved on this phone. Your updates sync automatically."
        />
      ) : null}
      {readOnly ? (
        <PMNotice
          icon="bx-lock-alt"
          tone="mute"
          text="Read-only — start your day to begin or update PMs."
        />
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chips}
        contentContainerStyle={s.chipsInner}
      >
        {chips.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            count={c.count}
            selected={c.key === activeChip}
            onPress={() => onSelectChip(c.key)}
          />
        ))}
      </ScrollView>

      {qrAssetFilter ? (
        <View style={s.qrPill}>
          <Bx name="bx-qr-scan" size={14} color={t.accentInk} />
          <Text style={s.qrText} numberOfLines={1}>
            {qrAssetFilter}
          </Text>
          <TouchableOpacity
            onPress={onClearQr}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear asset filter"
          >
            <Bx name="bx-x" size={16} color={t.muted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={s.countRow}>
        <Text style={s.count}>
          <Text style={s.countNum}>{count}</Text> PMs
        </Text>
        <TouchableOpacity
          onPress={onSort}
          style={s.sort}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${sortLabel}. Change sort`}
        >
          <Bx name="bx-sort-down" size={16} color={t.muted} />
          <Text style={s.sortText}>{sortLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
