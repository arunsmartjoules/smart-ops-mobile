/**
 * The history log card — extracted from app/history/site-history.tsx so the
 * Logs tab and the history screen render byte-identical rows instead of
 * drifting copies. Drawn in the artboard's list-card language.
 */
import React, { memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { format } from "date-fns";
import { Bx } from "@/components/jo/Bx";
import { Card, StatusPill, f, useJoTheme } from "@/components/jo/ui";
import { typeLook } from "@/components/sitelogs/LogsKit";

export const formatScheduledDate = (raw: string | null | undefined) => {
  if (!raw) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  return format(
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    "dd MMM yyyy",
  );
};

export const HistoryLogCard = memo(
  ({
    item,
    logName,
    resolvedName,
    onPress,
    onLongPress,
    onPreviewImage,
  }: {
    item: any;
    logName: string;
    resolvedName?: string;
    onPress: () => void;
    onLongPress: () => void;
    onPreviewImage: (url: string) => void;
  }) => {
    const t = useJoTheme();
    const look = typeLook(t, logName);
    // Normalize so legacy "In-progress" / "in_progress" and canonical
    // "Inprogress" render identically (label + colour). Empty/null = Completed
    // (a chiller_readings row only exists once submitted).
    const rawStatus = String(item.status || "Completed");
    const normStatus = rawStatus.toLowerCase().replace(/[\s_-]+/g, "");
    const logStatus =
      normStatus === "completed" || normStatus === ""
        ? "Completed"
        : normStatus === "inprogress"
          ? "Inprogress"
          : normStatus === "open" || normStatus === "pending"
            ? "Open"
            : rawStatus;

    const statusTone =
      logStatus === "Completed" ? "ok" : logStatus === "Inprogress" ? "info" : logStatus === "Open" ? "bad" : "mute";
    const synced = item.isSynced !== false;
    const title =
      logName === "Chiller Logs"
        ? item.asset_name || item.chiller_id || "Unknown Asset"
        : item.task_name || format(new Date(item.created_at || item.createdAt), "dd MMM yyyy");
    const when =
      logName === "Chiller Logs"
        ? format(new Date(item.reading_time || item.created_at || item.createdAt), "dd MMM, HH:mm")
        : `${formatScheduledDate(item.scheduled_date)} • ${format(new Date(item.created_at || item.createdAt), "HH:mm")}`;

    const readings: { label: string; value: string }[] = [];
    if (item.log_name === "Temp RH") {
      readings.push({ label: "Temp", value: `${item.temperature}°C` }, { label: "RH", value: `${item.rh}%` });
    }
    if (item.log_name === "Water") {
      readings.push(
        { label: "TDS", value: String(item.tds) },
        { label: "pH", value: String(item.ph) },
        { label: "Hard", value: String(item.hardness) },
      );
    }
    if (item.log_name === "Chemical Dosing") {
      readings.push({ label: "Dosing", value: String(item.chemical_dosing ?? "") });
    }
    if (logName === "Chiller Logs" || item.chiller_id) {
      readings.push(
        { label: "Load", value: `${item.compressor_load_percentage}%` },
        { label: "ID", value: item.chiller_id?.slice(-6) || "N/A" },
      );
    }
    const attachment = item.attachment || item.attachments;

    return (
      <Card
        radius={22}
        style={{ marginBottom: 8 }}
      >
        <TouchableOpacity
          onPress={onPress}
          onLongPress={onLongPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${logStatus}`}
          accessibilityHint="Long-press to delete"
          style={{ padding: 14 }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: look.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bx name={look.icon} size={19} color={look.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.t(14.5, 600), { color: t.ink }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
                {when} • {resolvedName || "Unknown"}
              </Text>
            </View>
            <StatusPill label={synced ? "Synced" : "Pending"} tone={synced ? "ok" : "warn"} dot />
          </View>

          {readings.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
              {readings.map((r) => (
                <View
                  key={r.label}
                  style={{ flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: t.raised, paddingVertical: 8, paddingHorizontal: 10 }}
                >
                  <Text style={[f.t(11, 500), { color: t.muted }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <Text style={[f.d(16, -0.02, 1.2), { color: t.ink, marginTop: 2 }]} numberOfLines={1}>
                    {r.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {attachment ? (
            <TouchableOpacity
              onPress={() => onPreviewImage(attachment)}
              activeOpacity={0.8}
              accessibilityRole="imagebutton"
              accessibilityLabel="Preview attachment"
              style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, overflow: "hidden", backgroundColor: t.raised }}>
                {/* expo-image: disk+memory cached and decoded to the 40×40
                    render bounds, instead of RN Image re-decoding the full-res
                    S3 original into a thumbnail on every mount/scroll. */}
                <Image
                  source={{ uri: attachment }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={100}
                />
              </View>
              <Text style={[f.t(12.5), { color: t.ink3, flex: 1 }]} numberOfLines={1}>
                Tap to preview attachment
              </Text>
              <Bx name="bx-fullscreen" size={15} color={t.muted} />
            </TouchableOpacity>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: t.line,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Bx name="bx-map-pin" size={13} color={t.muted} />
              <Text style={[f.t(11.5), { color: t.muted }]}>{item.site_code}</Text>
            </View>
            <StatusPill label={logStatus} tone={statusTone} />
          </View>
          {item.remarks ? (
            <Text style={[f.t(12), { color: t.muted, fontStyle: "italic", marginTop: 6 }]} numberOfLines={1}>
              {`"${item.remarks}"`}
            </Text>
          ) : null}
        </TouchableOpacity>
      </Card>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.isSynced === nextProps.item.isSynced &&
      prevProps.item.status === nextProps.item.status &&
      prevProps.resolvedName === nextProps.resolvedName
    );
  },
);
HistoryLogCard.displayName = "HistoryLogCard";
