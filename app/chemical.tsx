import { useRef } from "react";
import { router } from "expo-router";
import { LogEntryModule } from "@/components/sitelogs/LogEntryModule";
import { consumeRouteParams } from "@/utils/routeParams";

/**
 * Chemical Dosing Entry Screen. Hookless for navigation (see temp-rh.tsx
 * for the rationale).
 */
export default function ChemicalTaskList() {
  const paramsRef = useRef(
    consumeRouteParams<{ siteCode?: string; editId?: string }>("/chemical"),
  );

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/site-logs");
  };

  return (
    <LogEntryModule
      type="Chemical"
      siteCode={paramsRef.current.siteCode}
      editId={paramsRef.current.editId}
      onBack={handleBack}
    />
  );
}
