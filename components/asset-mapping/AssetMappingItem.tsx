/**
 * One asset row in the Asset Directory — the artboard's asset card: a 42
 * icon well (type icon), uppercase type caps, the name, then the place with
 * a map pin and the status pill, and a chevron.
 *
 * Kept from the old row in the same language: the asset ID (mono, right of
 * the caps line), high / low side in the caps, the Critical and "Reading…"
 * pills, and the time since the last capture / approval.
 */
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { StatusPill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { MappedAsset } from "@/services/AssetMappingService";
import {
  PROCESSING,
  criticalityTone,
  formatAge,
  getMappingStatus,
  lastActivity,
  placeOf,
  sideLabel,
  typeIcon,
  typeMeta,
} from "./lib";

const AssetMappingItem = React.memo(
  ({ item, onPress }: { item: MappedAsset; onPress: (item: MappedAsset) => void }) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const s = useStyles();
    const t = useJoTheme();
    const status = getMappingStatus(item);
    const meta = typeMeta(item);
    const critical = criticalityTone(item);
    const typeLine = [item.equipment_type || item.asset_type || "Type not set", sideLabel(item)]
      .filter(Boolean)
      .join(" · ");
    const place = placeOf(item);
    const updated = lastActivity(item);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={s.card}
        accessibilityRole="button"
        accessibilityLabel={`${item.asset_name}, ${status.label}`}
      >
        <View style={s.well}>
          <Bx name={typeIcon(meta.abbr)} size={20} color={t.ink2} />
        </View>

        <View style={s.body}>
          <View style={s.capsRow}>
            <Text style={s.caps} numberOfLines={1}>
              {typeLine}
            </Text>
            <Text style={s.id} numberOfLines={1}>
              {item.asset_id}
            </Text>
          </View>
          <Text style={s.name} numberOfLines={2}>
            {item.asset_name}
          </Text>
          <View style={s.metaRow}>
            {place ? (
              <View style={s.metaItem}>
                <Bx name="bx-map" size={13} color={t.muted} />
                <Text style={s.metaText} numberOfLines={1}>
                  {place}
                </Text>
              </View>
            ) : null}
            <StatusPill label={status.label} tone={status.tone} height={20} />
            {critical ? (
              <StatusPill label={critical.label} tone={critical.tone} solid={critical.solid} height={20} />
            ) : null}
            {item.nameplate_processing ? (
              <StatusPill label={PROCESSING.label} tone={PROCESSING.tone} height={20} />
            ) : null}
            {updated ? (
              <View style={s.metaItem}>
                <Bx name="bx-time-five" size={13} color={t.faint} />
                <Text style={[s.metaText, { color: t.faint }]}>{formatAge(updated)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Bx name="bx-chevron-right" size={20} color={t.faint} />
      </TouchableOpacity>
    );
  },
);

AssetMappingItem.displayName = "AssetMappingItem";

export default AssetMappingItem;

const useStyles = makeJoStyles((t) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  well: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  capsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  caps: {
    ...f.t(11, 600, 0.06),
    textTransform: "uppercase",
    color: t.muted,
    flexShrink: 1,
  },
  id: { ...f.m(10.5), color: t.faint, marginLeft: "auto" },
  name: { ...f.t(14, 600), color: t.ink, marginTop: 3 },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 5,
    marginTop: 6,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 },
  metaText: { ...f.t(11.5), color: t.muted, flexShrink: 1 },
}));
