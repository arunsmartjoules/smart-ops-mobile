import { useRef } from "react";
import { router } from "expo-router";
import { LogEntryModule } from "@/components/sitelogs/LogEntryModule";
import { consumeRouteParams } from "@/utils/routeParams";

/**
 * Temp & RH Monitoring Entry Screen.
 *
 * Params travel via the routeParams store (set before router.push) so this
 * component has no navigation hooks of its own — no useLocalSearchParams,
 * no useRouter, nothing that can throw "Couldn't find a navigation context".
 * The global `router` is hookless.
 */
export default function TempRHLogList() {
  const paramsRef = useRef(
    consumeRouteParams<{
      siteCode?: string;
      editId?: string;
      shift?: "A" | "B" | "C";
    }>("/temp-rh"),
  );

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/site-logs");
  };

  return (
    <LogEntryModule
      type="TempRH"
      siteCode={paramsRef.current.siteCode}
      editId={paramsRef.current.editId}
      initialShift={paramsRef.current.shift ?? null}
      onBack={handleBack}
    />
  );
}
