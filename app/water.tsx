import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LogEntryModule } from "@/components/sitelogs/LogEntryModule";

/**
 * Water Monitoring Entry Screen
 * Refactored to use generic LogEntryModule for clean state management and 
 * strict "To-Do" filtering.
 */
export default function WaterTaskList() {
  const router = useRouter();
  const { siteCode } = useLocalSearchParams<{ siteCode?: string }>();

  return (
    <LogEntryModule 
      type="Water" 
      siteCode={siteCode}
      onBack={() => router.back()}
    />
  );
}
