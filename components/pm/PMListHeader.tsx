/**
 * Preventive-maintenance list chrome — artboard `r_pm` (app.dc.html 625–663):
 * site pill over the 28px title, search + period button, the status chip
 * strip with counts, and the "N PMs · sort" line.
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
  head: { paddingTop: 12, paddingHorizontal: 4 },
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
    borderColor: t.lineMid,
    maxWidth: 280,
  },
  siteText: { ...f.t(12.5, 500), color: t.ink2, flexShrink: 1 },
  title: { ...f.d(28, -0.025), color: t.ink, marginTop: 4 },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  dateBtn: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
    maxWidth: 170,
    flexShrink: 0,
  },
  dateText: { ...f.t(12.5, 500), color: t.ink, flexShrink: 1 },
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
  siteName,
  onSitePress,
  search,
  onChangeSearch,
  onScanPress,
  dateLabel,
  onDatePress,
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
  siteName: string;
  /** Null when there is nothing to switch to (one site). */
  onSitePress: (() => void) | null;
  search: string;
  onChangeSearch: (v: string) => void;
  onScanPress: () => void;
  dateLabel: string;
  onDatePress: () => void;
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
      <View style={s.head}>
        <TouchableOpacity
          style={s.siteChip}
          onPress={onSitePress ?? undefined}
          disabled={!onSitePress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Site: ${siteName}${onSitePress ? ", change" : ""}`}
        >
          <Bx name="bx-buildings" size={14} color={t.accentInk} />
          <Text style={s.siteText} numberOfLines={1}>
            {siteName}
          </Text>
          {onSitePress ? (
            <Bx name="bx-chevron-down" size={15} color={t.muted} />
          ) : null}
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          Preventive maintenance
        </Text>
      </View>

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
          style={s.dateBtn}
          onPress={onDatePress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Period ${dateLabel}. Opens filters`}
        >
          <Bx name="bx-calendar" size={15} color={t.accentInk} />
          <Text style={s.dateText} numberOfLines={1}>
            {dateLabel}
          </Text>
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
