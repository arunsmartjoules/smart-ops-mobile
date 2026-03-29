import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LogEntryModule } from "@/components/sitelogs/LogEntryModule";

/**
 * Chemical Dosing Entry Screen
 * Refactored to use generic LogEntryModule for clean state management and 
 * strict "To-Do" filtering.
 */
export default function ChemicalTaskList() {
  const router = useRouter();
  const { siteCode } = useLocalSearchParams<{ siteCode?: string }>();
  
  return (
    <LogEntryModule 
      type="Chemical" 
      siteCode={siteCode}
      onBack={() => router.back()}
    />
  );
}
