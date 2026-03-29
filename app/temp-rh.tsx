import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LogEntryModule } from "@/components/sitelogs/LogEntryModule";

/**
 * Temp & RH Monitoring Entry Screen
 * Refactored to use generic LogEntryModule for clean state management and 
 * strict "To-Do" filtering.
 */
export default function TempRHLogList() {
  const router = useRouter();
  const { siteCode } = useLocalSearchParams<{ siteCode?: string }>();

  return (
    <LogEntryModule 
      type="TempRH" 
      siteCode={siteCode}
      onBack={() => router.back()}
    />
  );
}
