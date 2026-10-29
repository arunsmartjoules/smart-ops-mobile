/**
 * One line item (room / tank / point) on a log entry screen, in the
 * artboard's chemical-entry language: a #141418 card with the reading wells
 * (big Bricolage digits + unit), the dashed photo slot and the remarks field.
 * Readings still owed get a soft red outline, as before. Chemical is a
 * compact card with a single dosed checkbox.
 */
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { TaskItem } from "@/services/SiteConfigService";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, Card, f, useJoTheme } from "@/components/jo/ui";
import { LogImagePicker } from "./LogImagePicker";
import { NumberField, RemarksField, Tag } from "./LogsKit";
import { isTempRhRoomDone } from "./completionGate";

interface UnifiedLogItemProps {
  item: TaskItem;
  type: "Chemical" | "Water" | "TempRH";
  value: any;
  onUpdateValue: (taskId: string, field: string, value: string) => void;
  /** Temp RH only: tick/untick "No access" for this room. */
  onToggleNoAccess?: (taskId: string, noAccess: boolean) => void;
  isUploading?: boolean;
  index?: number;
  total?: number;
}

const hasText = (v: any) => !!v && String(v).trim().length > 0;

export const UnifiedLogItem = React.memo(
  ({
    item,
    type,
    value,
    onUpdateValue,
    onToggleNoAccess,
    isUploading = false,
    index,
    total,
  }: UnifiedLogItemProps) => {
    const t = useJoTheme();
    // The scheduling label; `remarks` is the technician's note, not this.
    const location = item.meta?.meta_date || null;

    // "No access" (Temp RH): the room couldn't be entered, so no reading is
    // owed — the card counts as done and its fields stop being required.
    const noAccess = type === "TempRH" && value.noAccess === true;

    const isFilled =
      type === "Water"
          ? hasText(value.tds) || hasText(value.ph) || hasText(value.hardness)
          : isTempRhRoomDone(value);

    const pad = (n?: number) => (n == null ? "" : String(n).padStart(2, "0"));
    const indexLabel = index != null && total != null ? `${pad(index)} / ${total}` : null;

    // Chemical: one compact card — a checkbox (ticked = dosed, unticked = not
    // dosed; LogEntryModule defaults untouched rows to "No"), then a slim row
    // with the photo buttons and a one-line remark.
    if (type === "Chemical") {
      const dosed = value.dosing === "Yes";
      return (
        <Card style={{ paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => onUpdateValue(item.id, "dosing", dosed ? "No" : "Yes")}
            disabled={isUploading}
            activeOpacity={0.75}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dosed, disabled: isUploading }}
            accessibilityLabel={`${item.name || "Dosing point"}, dosed`}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: dosed ? t.accent : "transparent",
                borderWidth: 2,
                borderColor: dosed ? t.accent : t.disabled,
              }}
            >
              {dosed ? <GlossFill color={t.accent} fg={t.onAccent} radius={9} bleed={2} /> : null}
              {dosed ? <Bx name="bx-check" size={20} color={t.onAccent} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.t(14, 600), { color: t.ink }]} numberOfLines={1}>
                {item.name || "Unnamed Area"}
              </Text>
              <Text style={[f.t(11.5), { color: dosed ? t.ok : t.muted, marginTop: 2 }]} numberOfLines={1}>
                {dosed ? "Dosed" : "Not dosed"}
                {location ? <Text style={{ color: t.muted }}>{`  ·  ${location}`}</Text> : null}
              </Text>
            </View>
            {indexLabel ? <Tag label={indexLabel} tone={dosed ? "ok" : "mute"} /> : null}
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <LogImagePicker
              compact
              value={value.attachment}
              onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
              uploadPath={`${type.toLowerCase()}/${item.id}`}
              disabled={isUploading}
            />
            <TextInput
              value={value.mainRemarks ?? ""}
              onChangeText={(v) => onUpdateValue(item.id, "mainRemarks", v)}
              placeholder={dosed ? "Optional notes" : "Why was dosing skipped?"}
              placeholderTextColor={t.faint}
              accessibilityLabel="Remarks"
              style={[
                f.t(13),
                {
                  flex: 1,
                  minWidth: 0,
                  height: 44,
                  paddingVertical: 0,
                  paddingHorizontal: 14,
                  borderRadius: 22,
                  color: t.ink,
                  backgroundColor: t.raised,
                  borderWidth: 1,
                  borderColor: t.lineMid,
                },
              ]}
            />
          </View>
        </Card>
      );
    }

    // Temp RH rooms repeat 10-20 times a shift, so the card is kept short: a
    // smaller field, the photo buttons and a one-line remark on a single row.
    const compact = type === "TempRH";

    return (
      <Card
        style={{
          padding: compact ? 14 : 16,
          marginBottom: compact ? 8 : 10,
          borderColor: isFilled ? t.cardBorder : t.badBorder,
        }}
      >
        {/* Header: area + location + index */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={2}>
              {item.name || "Unnamed Area"}
            </Text>
            {location ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Bx name="bx-map-pin" size={13} color={t.muted} />
                <Text style={[f.t(12.5), { color: t.muted, flex: 1 }]} numberOfLines={1}>
                  {location}
                </Text>
              </View>
            ) : null}
          </View>
          {indexLabel ? <Tag label={indexLabel} tone={noAccess ? "warn" : isFilled ? "ok" : "bad"} /> : null}
        </View>

        {/* TempRH: No access + Temp + RH */}
        {type === "TempRH" && onToggleNoAccess ? (
          <TouchableOpacity
            onPress={() => onToggleNoAccess(item.id, !noAccess)}
            disabled={isUploading}
            activeOpacity={0.75}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: noAccess, disabled: isUploading }}
            accessibilityLabel={`${item.name || "Room"}, no access`}
            accessibilityHint="Tick when the room could not be entered. Temperature and RH are then not required."
            style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, minHeight: 32 }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: noAccess ? t.accent : "transparent",
                borderWidth: 2,
                borderColor: noAccess ? t.accent : t.disabled,
              }}
            >
              {noAccess ? <GlossFill color={t.accent} fg={t.onAccent} radius={8} bleed={2} /> : null}
              {noAccess ? <Bx name="bx-check" size={17} color={t.onAccent} /> : null}
            </View>
            <Text style={[f.t(13.5, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
              No access
              {noAccess ? <Text style={[f.t(12), { color: t.warn }]}>{"  ·  Temp & RH not required"}</Text> : null}
            </Text>
          </TouchableOpacity>
        ) : null}

        {type === "TempRH" && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, opacity: noAccess ? 0.45 : 1 }}>
            <NumberField
              label="Temperature"
              value={value.temp}
              onChangeText={(v) => onUpdateValue(item.id, "temp", v)}
              unit="°C"
              placeholder="— —"
              size="sm"
              editable={!noAccess}
              attention={!noAccess && !hasText(value.temp)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <NumberField
              label="RH"
              value={value.rh}
              onChangeText={(v) => onUpdateValue(item.id, "rh", v)}
              unit="%"
              placeholder="— —"
              size="sm"
              editable={!noAccess}
              attention={!noAccess && !hasText(value.rh)}
              style={{ flex: 1, minWidth: 0 }}
            />
          </View>
        )}

        {/* Water: TDS / pH / Hardness */}
        {type === "Water" && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            {[
              { key: "tds", label: "TDS" },
              { key: "ph", label: "pH" },
              { key: "hardness", label: "Hardness" },
            ].map(({ key, label }) => (
              <NumberField
                key={key}
                label={label}
                value={value[key]}
                onChangeText={(v) => onUpdateValue(item.id, key, v)}
                placeholder="—"
                size="sm"
                attention={!hasText(value[key])}
                style={{ flex: 1, minWidth: 0 }}
              />
            ))}
          </View>
        )}

        {compact ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <LogImagePicker
              compact
              value={value.attachment}
              onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
              uploadPath={`${type.toLowerCase()}/${item.id}`}
              disabled={isUploading}
            />
            <TextInput
              value={value.mainRemarks ?? ""}
              onChangeText={(v) => onUpdateValue(item.id, "mainRemarks", v)}
              placeholder={noAccess ? "Reason (optional)" : "Add a remark…"}
              placeholderTextColor={t.faint}
              accessibilityLabel="Remarks"
              style={[
                f.t(13),
                {
                  flex: 1,
                  minWidth: 0,
                  height: 44,
                  paddingVertical: 0,
                  paddingHorizontal: 14,
                  borderRadius: 22,
                  color: t.ink,
                  backgroundColor: t.raised,
                  borderWidth: 1,
                  borderColor: t.lineMid,
                },
              ]}
            />
          </View>
        ) : (
          <>
            <View style={{ marginTop: 16 }}>
              <LogImagePicker
                label="Attachment"
                value={value.attachment}
                onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
                uploadPath={`${type.toLowerCase()}/${item.id}`}
                cta="Add photo"
                disabled={isUploading}
              />
            </View>

            <RemarksField
              label="Remarks"
              value={value.mainRemarks}
              onChangeText={(v) => onUpdateValue(item.id, "mainRemarks", v)}
              placeholder="Add a remark…"
              style={{ marginTop: 14 }}
            />
          </>
        )}
      </Card>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.status === next.item.status &&
      prev.index === next.index &&
      prev.total === next.total &&
      JSON.stringify(prev.value) === JSON.stringify(next.value) &&
      prev.isUploading === next.isUploading
    );
  },
);

UnifiedLogItem.displayName = "UnifiedLogItem";
