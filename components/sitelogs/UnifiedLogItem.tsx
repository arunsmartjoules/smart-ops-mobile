import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import {
  Check,
  Droplets,
  Activity,
  Beaker,
  Thermometer,
  CloudRain,
  MapPin,
} from "lucide-react-native";
import { TaskItem } from "@/services/SiteConfigService";
import { LogImagePicker } from "./LogImagePicker";
import { ds } from "@/constants/ds";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

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
    // The scheduling label; `remarks` is the technician's note, not this.
    const location = item.meta?.meta_date || null;

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
        style={[
          itemStyles.card,
          !isFilled && { borderColor: ds.flame[900] },
        ]}
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

        {/* Chemical: dosing done — a checkbox, toggling Yes / No */}
        {type === "Chemical" && (
          <TouchableOpacity
            onPress={() =>
              onUpdateValue(
                item.id,
                "dosing",
                value.dosing === "Yes" ? "No" : "Yes",
              )
            }
            activeOpacity={0.85}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value.dosing === "Yes" }}
            accessibilityLabel="Dosing done"
            style={[
              itemStyles.field,
              itemStyles.checkRow,
              !hasText(value.dosing) && { borderColor: ds.flame[900] },
            ]}
          >
            <View
              style={[
                itemStyles.checkbox,
                value.dosing === "Yes" && {
                  backgroundColor: ds.thunder[100],
                  borderColor: ds.thunder[100],
                },
              ]}
            >
              {value.dosing === "Yes" ? (
                <Check size={13} color={ds.white} strokeWidth={3} />
              ) : null}
            </View>
            <Text style={itemStyles.checkLabel}>Dosing done</Text>
            <Text
              style={[
                itemStyles.checkState,
                !hasText(value.dosing) && { color: ds.flame[100] },
              ]}
            >
              {value.dosing || "Not set"}
            </Text>
          </TouchableOpacity>
        )}

        {/* TempRH: Temp + RH */}
        {type === "TempRH" && (
          <View className="flex-row gap-2 mb-2.5">
            <View
              style={[
                itemStyles.field,
                !hasText(value.temp) && { borderColor: ds.flame[900] },
              ]}
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
              style={[
                itemStyles.field,
                !hasText(value.rh) && { borderColor: ds.flame[900] },
              ]}
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
                style={[
                  itemStyles.field,
                  { gap: 6, paddingHorizontal: 10 },
                  !hasText(value[key]) && { borderColor: ds.flame[900] },
                ]}
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
          <View style={[itemStyles.field, { paddingVertical: 0 }]}>
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

const itemStyles = StyleSheet.create({
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    ...soShadow,
  },
  checkRow: { flex: undefined, gap: 10, paddingVertical: 12 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ds.carbon[800],
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: ds.carbon[100],
  },
  checkState: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ds.pageBg,
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
