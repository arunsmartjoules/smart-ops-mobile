import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import {
  Check,
  Minus,
  Droplets,
  Activity,
  Beaker,
  Thermometer,
  CloudRain,
  MapPin,
} from "lucide-react-native";
import { TaskItem } from "@/services/SiteConfigService";
import { LogImagePicker } from "./LogImagePicker";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
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
  const itemStyles = useItemStyles();
  const ds = useDs();
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
                <MapPin size={10} color={ds.carbon[600]} />
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

        {/* TempRH: Temp + RH */}
        {type === "TempRH" && (
          <View className="flex-row gap-2 mb-2.5">
            <View
              style={[
                itemStyles.field,
                !hasText(value.temp) && { borderColor: ds.flame[900] },
              ]}
            >
              <Thermometer size={14} color={ds.flame[100]} />
              <View className="flex-1">
                <Text className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">
                  Temp °C
                </Text>
                <TextInput
                  value={value.temp}
                  onChangeText={(t) => onUpdateValue(item.id, "temp", t)}
                  placeholder="— —"
                  keyboardType="numeric"
                  placeholderTextColor={ds.carbon[600]}
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
                  placeholderTextColor={ds.carbon[600]}
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
                color: ds.sky[100],
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
                    placeholderTextColor={ds.carbon[600]}
                    className="text-[13px] font-bold text-slate-900 dark:text-slate-50 p-0 m-0"
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Dosing (Chemical only) + remark + attachments — one row */}
        <View className="flex-row items-center gap-2">
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
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 6 }}
              style={[
                itemStyles.checkbox,
                value.dosing === "Yes" && {
                  backgroundColor: ds.controlOn,
                  borderColor: ds.controlOn,
                },
                !hasText(value.dosing) && { borderColor: ds.flame[900] },
              ]}
            >
              {value.dosing === "Yes" ? (
                <Check size={16} color={ds.onControl} strokeWidth={3} />
              ) : value.dosing === "No" ? (
                <Minus size={16} color={ds.carbon[500]} strokeWidth={3} />
              ) : null}
            </TouchableOpacity>
          )}
          <View
            style={[
              itemStyles.field,
              { paddingVertical: 0, height: ROW_FIELD_HEIGHT },
            ]}
          >
            <TextInput
              placeholder="Add a remark…"
              value={value.mainRemarks}
              onChangeText={(t) => onUpdateValue(item.id, "mainRemarks", t)}
              className="flex-1 p-0 text-xs font-medium text-slate-600 dark:text-slate-300"
              placeholderTextColor={ds.carbon[600]}
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

/** Shared height for the dosing checkbox and the remark input beside it. */
const ROW_FIELD_HEIGHT = 36;

const useItemStyles = makeThemedStyles((ds) => ({
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    ...soShadow,
  },
  // Square, and the same height + radius as the remark input beside it so the
  // two line up; the extra tap area comes from hitSlop, not from the box.
  checkbox: {
    width: ROW_FIELD_HEIGHT,
    height: ROW_FIELD_HEIGHT,
    borderRadius: soRadius.sm,
    borderWidth: 1.5,
    borderColor: ds.carbon[800],
    backgroundColor: ds.white,
    alignItems: "center",
    justifyContent: "center",
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
}));
