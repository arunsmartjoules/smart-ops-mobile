import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { format, subDays } from "date-fns";

interface DateRangePickerProps {
  onRangeSelect: (start: Date | null, end: Date | null) => void;
  selectedRange?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  onRangeSelect,
  selectedRange,
}) => {
  const presets = [
    { label: "Today", getRange: () => [new Date(), new Date()] },
    {
      label: "Yesterday",
      getRange: () => [subDays(new Date(), 1), subDays(new Date(), 1)],
    },
    {
      label: "Last 7 Days",
      getRange: () => [subDays(new Date(), 7), new Date()],
    },
    {
      label: "Last 30 Days",
      getRange: () => [subDays(new Date(), 30), new Date()],
    },
  ];

  return (
    <View className="mb-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 px-1">
          {presets.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              onPress={() => {
                const [start, end] = preset.getRange();
                onRangeSelect(start, end);
              }}
              className={`px-4 py-2 rounded-full border ${
                selectedRange === preset.label
                  ? "bg-blue-600 border-blue-600"
                  : "bg-white border-slate-200"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selectedRange === preset.label
                    ? "text-white"
                    : "text-slate-600"
                }`}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => onRangeSelect(null, null)}
            className="px-4 py-2 rounded-full border bg-white border-slate-200"
          >
            <Text className="text-xs font-bold text-slate-600">Clear</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};
