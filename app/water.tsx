import { useRef } from "react";
import { router } from "expo-router";
import { LogEntryModule } from "@/components/sitelogs/LogEntryModule";
import { consumeRouteParams } from "@/utils/routeParams";

/**
 * Water Monitoring Entry Screen. Hookless for navigation (see temp-rh.tsx
 * for the rationale): params travel via the routeParams store, `router` is
 * the global non-hook export.
 */
export default function WaterTaskList() {
  const paramsRef = useRef(
    consumeRouteParams<{ siteCode?: string; editId?: string }>("/water"),
  );

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/site-logs");
  };

  return (
    <LogEntryModule
      type="Water"
      siteCode={paramsRef.current.siteCode}
      editId={paramsRef.current.editId}
      onBack={handleBack}
    />
  );
}
