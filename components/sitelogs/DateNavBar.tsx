/**
 * Day stepper for the log entry screens: ‹ prev · date pill · next › in the
 * artboard's round-button language. The arrows carry a red count badge for
 * pending tasks on the neighbouring day.
 */
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { format, isToday, subDays, addDays } from "date-fns";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { Bx } from "@/components/jo/Bx";
import { f, useJoTheme } from "@/components/jo/ui";

interface DateNavBarProps {
  date: Date;
  onDateChange: (date: Date) => void;
  showPicker: boolean;
  onShowPicker: (show: boolean) => void;
  /** Count of pending tasks on the previous day */
  prevCount?: number;
  /** Count of pending tasks on the next day */
  nextCount?: number;
}

export function DateNavBar({
  date,
  onDateChange,
  showPicker,
  onShowPicker,
  prevCount = 0,
  nextCount = 0,
}: DateNavBarProps) {
  const t = useJoTheme();
  const label = useMemo(() => {
    if (isToday(date)) return "Today";
    return format(date, "dd MMM yyyy");
  }, [date]);

  const arrow = (dir: "prev" | "next", count: number) => (
    <TouchableOpacity
      onPress={() => onDateChange(dir === "prev" ? subDays(date, 1) : addDays(date, 1))}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${dir === "prev" ? "Previous" : "Next"} day${count > 0 ? `, ${count} pending` : ""}`}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.raised,
        borderWidth: 1,
        borderColor: t.lineMid,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Bx name={dir === "prev" ? "bx-chevron-left" : "bx-chevron-right"} size={22} color={t.ink} />
      {count > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: t.bad,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[f.t(10, 700), { color: t.onAccent }]}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {arrow("prev", prevCount)}
        <TouchableOpacity
          onPress={() => onShowPicker(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Date: ${label}. Change date`}
          style={{
            flex: 1,
            height: 40,
            borderRadius: 20,
            backgroundColor: t.raised,
            borderWidth: 1,
            borderColor: t.lineMid,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <Bx name="bx-calendar" size={15} color={t.accentInk} />
          <Text style={[f.t(13.5, 600), { color: t.ink }]}>{label}</Text>
          <Bx name="bx-chevron-down" size={16} color={t.muted} />
        </TouchableOpacity>
        {arrow("next", nextCount)}
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
