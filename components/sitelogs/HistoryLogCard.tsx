/**
 * The history log card — extracted from app/history/site-history.tsx so the
 * Logs tab and the history screen render byte-identical rows instead of
 * drifting copies.
 */
import React, { memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { format } from "date-fns";
import {
  Activity,
  Thermometer,
  Droplets,
  FlaskRound,
  MapPin,
  Maximize2,
  Snowflake,
  History as HistoryIcon,
} from "lucide-react-native";

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
    const getLogIcon = () => {
      if (logName === "Temp RH") return Thermometer;
      if (logName === "Water") return Droplets;
      if (logName === "Chemical Dosing") return FlaskRound;
      if (logName === "Chiller Logs") return Snowflake;
      return HistoryIcon;
    };

    const IconComp = getLogIcon();
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
    const isPendingTone = logStatus === "Open" || logStatus === "Inprogress";

    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 rounded-xl mb-2.5 p-3"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center flex-1 mr-3">
            <View className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 items-center justify-center mr-2.5">
              <IconComp size={14} color="#64748b" />
            </View>
            <View className="flex-1">
              <Text
                className="text-slate-900 dark:text-slate-50 font-bold text-sm"
                numberOfLines={1}
              >
                {logName === "Chiller Logs"
                  ? item.asset_name || item.chiller_id || "Unknown Asset"
                  : item.task_name ||
                    format(
                      new Date(item.created_at || item.createdAt),
                      "dd MMM yyyy",
                    )}
              </Text>
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                {logName === "Chiller Logs"
                  ? format(
                      new Date(
                        item.reading_time || item.created_at || item.createdAt,
                      ),
                      "dd MMM, HH:mm",
                    )
                  : `${formatScheduledDate(item.scheduled_date)} • ${format(
                      new Date(item.created_at || item.createdAt),
                      "HH:mm",
                    )}`}{" "}
                • {resolvedName || "Unknown"}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <View
              className={`px-1.5 py-0.5 rounded ${item.isSynced !== false ? "bg-green-50" : "bg-amber-50"}`}
            >
              <Text
                className={`text-[10px] font-bold uppercase tracking-wider ${item.isSynced !== false ? "text-green-600" : "text-amber-600"}`}
              >
                {item.isSynced !== false ? "Synced" : "Pending"}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 mb-2">
          {item.log_name === "Temp RH" && (
            <View className="flex-row justify-between">
              <View>
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  Temp
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  {item.temperature}°C
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  RH
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  {item.rh}%
                </Text>
              </View>
            </View>
          )}
          {item.log_name === "Water" && (
            <View className="flex-row flex-wrap gap-y-1">
              <View className="w-1/3">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  TDS
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.tds}
                </Text>
              </View>
              <View className="w-1/3">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  pH
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.ph}
                </Text>
              </View>
              <View className="w-1/3 items-end">
                <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  Hard
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                  {item.hardness}
                </Text>
              </View>
            </View>
          )}
          {item.log_name === "Chemical Dosing" && (
            <View>
              <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                Dosing
              </Text>
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-xs">
                {item.chemical_dosing}
              </Text>
            </View>
          )}
          {(logName === "Chiller Logs" || item.chiller_id) && (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Activity size={10} color="#0d9488" />
                <Text className="text-xs font-bold text-teal-600 ml-1">
                  {item.compressor_load_percentage}% LOAD
                </Text>
              </View>
              <Text className="text-slate-400 text-[10px] font-bold">
                ID: {item.chiller_id?.slice(-6) || "N/A"}
              </Text>
            </View>
          )}

          {/* New: Image Thumbnail - Made more compact */}
          {(item.attachment || item.attachments) && (
            <View className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity 
                onPress={() => onPreviewImage(item.attachment || item.attachments)}
                className="flex-row items-center"
              >
                <View className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 mr-2.5">
                  {/* expo-image: disk+memory cached and decoded to the 40×40
                      render bounds, instead of RN Image re-decoding the full-res
                      S3 original into a thumbnail on every mount/scroll. */}
                  <Image
                    source={{ uri: item.attachment || item.attachments }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={100}
                  />
                  <View className="absolute inset-0 bg-black/10 items-center justify-center">
                    <Maximize2 size={10} color="white" />
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-slate-600 dark:text-slate-400 text-xs" numberOfLines={1}>
                    Tap to preview attachment
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center">
            <MapPin size={10} color="#94a3b8" />
            <Text className="text-slate-400 text-xs ml-1">
              {item.site_code}
            </Text>
          </View>
          <View
            className={`px-1.5 py-0.5 rounded-full ${isPendingTone ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}
          >
            <Text
              className={`text-[10px] font-bold ${isPendingTone ? "text-amber-600" : "text-green-600"}`}
            >
              {logStatus}
            </Text>
          </View>
        </View>
        {item.remarks && (
          <View className="flex-row items-center mt-1.5">
            <Text
              className="text-slate-400 text-xs italic"
              numberOfLines={1}
            >
              {`"${item.remarks}"`}
            </Text>
          </View>
        )}
      </TouchableOpacity>
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
