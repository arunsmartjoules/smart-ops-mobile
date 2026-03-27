import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react-native";
import { format, isToday, subDays, addDays } from "date-fns";
import DateTimePicker from "@react-native-community/datetimepicker";

interface DateNavBarProps {
  date: Date;
  onDateChange: (date: Date) => void;
  showPicker: boolean;
  onShowPicker: (show: boolean) => void;
  /** Count of pending tasks on the previous day */
  prevCount?: number;
  /** Count of pending tasks on the next day */
  nextCount?: number;
  accentColor?: string;
}

export function DateNavBar({
  date,
  onDateChange,
  showPicker,
  onShowPicker,
  prevCount = 0,
  nextCount = 0,
  accentColor = "#dc2626",
}: DateNavBarProps) {
  const label = useMemo(() => {
    if (isToday(date)) return "Today";
    return format(date, "dd MMM yyyy");
  }, [date]);

  return (
    <>
      <View className="flex-row items-center gap-2 mt-2">
        {/* ‹ prev day */}
        <TouchableOpacity
          onPress={() => onDateChange(subDays(date, 1))}
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center"
        >
          <ChevronLeft size={18} color="#64748b" />
          {prevCount > 0 && (
            <View
              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full items-center justify-center px-0.5"
              style={{ backgroundColor: "#dc2626" }}
            >
              <Text className="text-white text-[8px] font-black leading-none">
                {prevCount > 99 ? "99+" : prevCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* date label — takes all remaining space */}
        <TouchableOpacity
          onPress={() => onShowPicker(true)}
          className="flex-1 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex-row items-center justify-center gap-1.5"
        >
          <Calendar size={13} color={accentColor} />
          <Text
            className="font-bold text-sm text-slate-900 dark:text-slate-50"
          >
            {label}
          </Text>
        </TouchableOpacity>

        {/* › next day */}
        <TouchableOpacity
          onPress={() => onDateChange(addDays(date, 1))}
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center"
        >
          <ChevronRight size={18} color="#64748b" />
          {nextCount > 0 && (
            <View
              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full items-center justify-center px-0.5"
              style={{ backgroundColor: "#dc2626" }}
            >
              <Text className="text-white text-[8px] font-black leading-none">
                {nextCount > 99 ? "99+" : nextCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_, selected) => {
            onShowPicker(false);
            if (selected) onDateChange(selected);
          }}
        />
      )}
    </>
  );
}
