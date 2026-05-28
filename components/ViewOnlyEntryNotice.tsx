import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ShieldOff, ArrowLeft, LogIn } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ViewOnlyEntryNoticeProps {
  /** What the user was trying to enter, e.g. "chemical readings". */
  what: string;
}

/**
 * Shown when a user lands on a write-only entry screen without an open
 * attendance session (chemical-entry, temp-rh-entry, water-entry). Read-only
 * mode unlocks the list views, not data entry — starting the day is the only
 * path forward.
 */
export function ViewOnlyEntryNotice({ what }: ViewOnlyEntryNoticeProps) {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
        >
          <ArrowLeft size={20} color="#475569" />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <View className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 items-center justify-center mb-6">
          <ShieldOff size={36} color="#b45309" />
        </View>
        <Text className="text-xl font-bold text-slate-900 dark:text-white text-center">
          View-only mode
        </Text>
        <Text className="mt-3 text-base text-slate-600 dark:text-slate-300 text-center leading-6">
          Start your day to record {what}. You&apos;re currently in view-only
          mode and can&apos;t submit entries.
        </Text>
        <Pressable
          onPress={() => router.replace("/attendance")}
          className="mt-8 w-full rounded-xl py-4 flex-row items-center justify-center bg-red-600 active:opacity-90"
        >
          <LogIn size={18} color="white" />
          <Text className="ml-2 text-white font-semibold text-base">
            Start Day
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default ViewOnlyEntryNotice;
