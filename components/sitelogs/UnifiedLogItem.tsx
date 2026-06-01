import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import {
  Droplets,
  Activity,
  Beaker,
  Thermometer,
  CloudRain,
  MapPin,
} from "lucide-react-native";
import { TaskItem } from "@/services/SiteConfigService";
import { LogImagePicker } from "./LogImagePicker";

interface UnifiedLogItemProps {
  item: TaskItem;
  type: "Chemical" | "Water" | "TempRH";
  value: any;
  onUpdateValue: (taskId: string, field: string, value: string) => void;
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
    isUploading = false,
    index,
    total,
  }: UnifiedLogItemProps) => {
    const location = item.meta?.remarks || null;

    const isFilled =
      type === "Chemical"
        ? hasText(value.dosing)
        : type === "Water"
          ? hasText(value.tds) || hasText(value.ph) || hasText(value.hardness)
          : hasText(value.temp) && hasText(value.rh);

    const pad = (n?: number) =>
      n == null ? "" : String(n).padStart(2, "0");
    const indexLabel =
      index != null && total != null ? `${pad(index)} / ${total}` : null;

    return (
      <View
        className={`bg-white dark:bg-slate-900 rounded-2xl p-3 mb-2.5 border ${
          isFilled
            ? "border-emerald-200 dark:border-emerald-900/40"
            : "border-red-100 dark:border-red-900/30"
        }`}
      >
        {/* Header: area + location + index */}
        <View className="flex-row items-start justify-between gap-2 mb-2.5">
          <View className="flex-1 min-w-0">
            <Text
              className="text-slate-900 dark:text-slate-50 font-bold text-[13px]"
              numberOfLines={1}
            >
              {item.name || "Unnamed Area"}
            </Text>
            {location && (
              <View className="flex-row items-center gap-1 mt-0.5">
                <MapPin size={10} color="#94a3b8" />
                <Text
                  className="text-slate-400 dark:text-slate-500 text-[10px] flex-1"
                  numberOfLines={1}
                >
                  {location}
                </Text>
              </View>
            )}
          </View>
          {indexLabel && (
            <View
              className={`px-2 py-1 rounded-md shrink-0 border ${
                isFilled
                  ? "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"
                  : "bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/40"
              }`}
            >
              <Text
                className={`text-[9.5px] font-semibold ${
                  isFilled
                    ? "text-slate-400 dark:text-slate-500"
                    : "text-red-500 dark:text-red-400"
                }`}
              >
                {indexLabel}
              </Text>
            </View>
          )}
        </View>

        {/* Chemical: Yes / No */}
        {type === "Chemical" && (
          <View className="flex-row items-center gap-2 mb-2.5">
            <TouchableOpacity
              onPress={() => onUpdateValue(item.id, "dosing", "Yes")}
              className={`flex-1 rounded-xl border px-3 py-3 items-center justify-center ${
                value.dosing === "Yes"
                  ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20"
                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  value.dosing === "Yes"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-slate-500 dark:text-slate-300"
                }`}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onUpdateValue(item.id, "dosing", "No")}
              className={`flex-1 rounded-xl border px-3 py-3 items-center justify-center ${
                value.dosing === "No"
                  ? "bg-amber-50 border-amber-500 dark:bg-amber-900/20"
                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  value.dosing === "No"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-slate-500 dark:text-slate-300"
                }`}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TempRH: Temp + RH */}
        {type === "TempRH" && (
          <View className="flex-row gap-2 mb-2.5">
            <View
              className={`flex-1 flex-row items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 border ${
                hasText(value.temp)
                  ? "border-slate-100 dark:border-slate-700"
                  : "border-red-100 dark:border-red-900/40"
              }`}
            >
              <Thermometer size={14} color="#ef4444" />
              <View className="flex-1">
                <Text className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">
                  Temp °C
                </Text>
                <TextInput
                  value={value.temp}
                  onChangeText={(t) => onUpdateValue(item.id, "temp", t)}
                  placeholder="— —"
                  keyboardType="numeric"
                  placeholderTextColor="#94a3b8"
                  className="text-[14px] font-bold text-slate-900 dark:text-slate-50 p-0 m-0"
                />
              </View>
            </View>
            <View
              className={`flex-1 flex-row items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 border ${
                hasText(value.rh)
                  ? "border-slate-100 dark:border-slate-700"
                  : "border-red-100 dark:border-red-900/40"
              }`}
            >
              <CloudRain size={14} color="#3b82f6" />
              <View className="flex-1">
                <Text className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">
                  RH %
                </Text>
                <TextInput
                  value={value.rh}
                  onChangeText={(t) => onUpdateValue(item.id, "rh", t)}
                  placeholder="— —"
                  keyboardType="numeric"
                  placeholderTextColor="#94a3b8"
                  className="text-[14px] font-bold text-slate-900 dark:text-slate-50 p-0 m-0"
                />
              </View>
            </View>
          </View>
        )}

        {/* Water: TDS / pH / Hardness */}
        {type === "Water" && (
          <View className="flex-row gap-2 mb-2.5">
            {[
              { key: "tds", label: "TDS", Icon: Droplets, color: "#3b82f6" },
              { key: "ph", label: "pH", Icon: Activity, color: "#10b981" },
              {
                key: "hardness",
                label: "Hard",
                Icon: Beaker,
                color: "#8b5cf6",
              },
            ].map(({ key, label, Icon, color }) => (
              <View
                key={key}
                className={`flex-1 flex-row items-center gap-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl px-2.5 py-2 border ${
                  hasText(value[key])
                    ? "border-slate-100 dark:border-slate-700"
                    : "border-red-100 dark:border-red-900/40"
                }`}
              >
                <Icon size={13} color={color} />
                <View className="flex-1">
                  <Text className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">
                    {label}
                  </Text>
                  <TextInput
                    value={value[key]}
                    onChangeText={(t) => onUpdateValue(item.id, key, t)}
                    placeholder="—"
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    className="text-[13px] font-bold text-slate-900 dark:text-slate-50 p-0 m-0"
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Remark + attachments */}
        <View className="flex-row items-center gap-2">
          <View className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 border border-slate-100 dark:border-slate-700">
            <TextInput
              placeholder="Add a remark…"
              value={value.mainRemarks}
              onChangeText={(t) => onUpdateValue(item.id, "mainRemarks", t)}
              className="py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <LogImagePicker
            value={value.attachment}
            onImageChange={(url) =>
              onUpdateValue(item.id, "attachment", url || "")
            }
            uploadPath={`${type.toLowerCase()}/${item.id}`}
            compact
            disabled={isUploading}
          />
        </View>
      </View>
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
