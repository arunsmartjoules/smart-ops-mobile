import React from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { 
  CheckCircle2, 
  FlaskConical, 
  ChevronDown, 
  Droplets, 
  Activity, 
  Beaker, 
  Thermometer, 
  CloudRain 
} from "lucide-react-native";
import { TaskItem } from "@/services/SiteConfigService";
import { LogImagePicker } from "./LogImagePicker";

interface UnifiedLogItemProps {
  item: TaskItem;
  type: "Chemical" | "Water" | "TempRH";
  value: any;
  onUpdateValue: (taskId: string, field: string, value: string) => void;
  onSelectDosing?: (taskId: string) => void;
  isUploading?: boolean;
}

export const UnifiedLogItem = React.memo(({
  item,
  type,
  value,
  onUpdateValue,
  onSelectDosing,
  isUploading = false
}: UnifiedLogItemProps) => {
  const subtitle = item.meta?.remarks || null;
  const isCompleted = item.status === "Completed";

  return (
    <View
      className={`bg-white dark:bg-slate-900 rounded-xl p-4 mb-3 border ${
        isCompleted ? "border-green-200 dark:border-green-900" : "border-slate-100 dark:border-slate-800"
      }`}
    >
      {/* Header */}
      <View className="mb-3 flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-base">
            {item.name || "Unnamed Area"}
          </Text>
          {subtitle && (
            <Text className="text-slate-400 text-[10px] italic mt-0.5">
              {subtitle}
            </Text>
          )}
        </View>
        {isCompleted && (
          <CheckCircle2 size={16} color="#16a34a" />
        )}
      </View>

      {/* Input Fields based on Type */}
      {type === "Chemical" && (
        <View className="flex-row items-center gap-2 mb-3">
          <TouchableOpacity
            onPress={() => onSelectDosing?.(item.id)}
            className="flex-row flex-1 items-center bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <View className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/30 items-center justify-center mr-3">
              <FlaskConical size={14} color="#9333ea" />
            </View>
            <Text className={`font-bold text-sm ${value.dosing ? "text-slate-900 dark:text-slate-50" : "text-slate-400"}`}>
              {value.dosing || "Select Option"}
            </Text>
            <View className="flex-1" />
            <ChevronDown size={16} color="#94a3b8" />
          </TouchableOpacity>
          <LogImagePicker
            value={value.attachment}
            onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
            uploadPath={`chemical/${item.id}`}
            compact
          />
        </View>
      )}

      {type === "Water" && (
        <>
          <View className="flex-row space-x-2 gap-2 mb-3">
            <View className="flex-1">
              <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
                <Droplets size={14} color="#3b82f6" />
                <TextInput
                  value={value.tds}
                  onChangeText={(t) => onUpdateValue(item.id, "tds", t)}
                  placeholder="TDS"
                  keyboardType="numeric"
                  className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
                />
              </View>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
                <Activity size={14} color="#10b981" />
                <TextInput
                  value={value.ph}
                  onChangeText={(t) => onUpdateValue(item.id, "ph", t)}
                  placeholder="pH"
                  keyboardType="numeric"
                  className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
                />
              </View>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-slate-200 dark:border-slate-700">
                <Beaker size={14} color="#8b5cf6" />
                <TextInput
                  value={value.hardness}
                  onChangeText={(t) => onUpdateValue(item.id, "hardness", t)}
                  placeholder="Hard"
                  keyboardType="numeric"
                  className="flex-1 py-3 ml-1 font-bold text-slate-900 dark:text-slate-50 text-xs"
                />
              </View>
            </View>
          </View>
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
              <TextInput
                placeholder="Remarks..."
                value={value.remarks}
                onChangeText={(t) => onUpdateValue(item.id, "remarks", t)}
                className="py-2 text-xs font-medium text-slate-600 dark:text-slate-400"
              />
            </View>
            <LogImagePicker
              value={value.attachment}
              onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
              uploadPath={`water/${item.id}`}
              compact
            />
          </View>
        </>
      )}

      {type === "TempRH" && (
        <View className="flex-row space-x-3 gap-3 items-center mb-3">
          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
              <Thermometer size={16} color="#ef4444" />
              <TextInput
                value={value.temp}
                onChangeText={(t) => onUpdateValue(item.id, "temp", t)}
                placeholder="Temp"
                keyboardType="numeric"
                className="flex-1 py-3 ml-2 font-bold text-slate-900 dark:text-slate-50"
              />
              <Text className="text-xs text-slate-400 font-bold">°C</Text>
            </View>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
              <CloudRain size={16} color="#3b82f6" />
              <TextInput
                value={value.rh}
                onChangeText={(t) => onUpdateValue(item.id, "rh", t)}
                placeholder="RH"
                keyboardType="numeric"
                className="flex-1 py-3 ml-2 font-bold text-slate-900 dark:text-slate-50"
              />
              <Text className="text-xs text-slate-400 font-bold">%</Text>
            </View>
          </View>
          <LogImagePicker
            value={value.attachment}
            onImageChange={(url) => onUpdateValue(item.id, "attachment", url || "")}
            uploadPath={`temprh/${item.id}`}
            compact
            disabled={isUploading}
          />
        </View>
      )}

      {/* Common Remarks Field (if not already handled in Water) */}
      {type !== "Water" && (
        <View className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 border border-slate-200 dark:border-slate-700">
          <TextInput
            placeholder="Add remarks..."
            value={value.remarks}
            onChangeText={(t) => onUpdateValue(item.id, "remarks", t)}
            className="py-2 text-xs font-medium text-slate-600 dark:text-slate-400"
            placeholderTextColor="#94a3b8"
          />
        </View>
      )}
    </View>
  );
}, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.status === next.item.status &&
    JSON.stringify(prev.value) === JSON.stringify(next.value) &&
    prev.isUploading === next.isUploading
  );
});
