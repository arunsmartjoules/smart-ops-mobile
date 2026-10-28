/**
 * Why "Complete & sign" can't go ahead yet, in the operator's words.
 *
 * The button used to be disabled in these states, which gives no feedback at
 * all — indistinguishable from a frozen app ("no spinner, no response",
 * KIMS Valliyath, Oct 2026). A tap must always answer, so the screens now ask
 * here and show the reason instead of ignoring the tap.
 */
export type LogEntryType = "TempRH" | "Water" | "Chemical";

export function describeLogLock(state: {
  type: LogEntryType;
  loading: boolean;
  total: number;
  filled: number;
}): string | null {
  if (state.loading) return "Still loading this log's rooms — give it a moment and tap again.";
  if (state.total === 0) {
    return "No rooms are loaded for this site and shift on this phone. Pull down to refresh; if nothing appears, the log may already be completed or not scheduled.";
  }
  const left = state.total - state.filled;
  if (left <= 0) return null;
  const rooms = `${left} of ${state.total} room${state.total === 1 ? "" : "s"}`;
  switch (state.type) {
    case "TempRH":
      return `${rooms} still need both Temp and RH.`;
    case "Water":
      return `${rooms} still need at least one of TDS, pH or hardness.`;
    case "Chemical":
      return `${rooms} still need a dosing answer.`;
  }
}

/** Chiller form: field key → the label shown on screen. */
export const CHILLER_FIELD_LABELS: Record<string, string> = {
  condenserInletTemp: "Cond. Inlet",
  condenserOutletTemp: "Cond. Outlet",
  evaporatorInletTemp: "Evap. Inlet",
  evaporatorOutletTemp: "Evap. Outlet",
  saturatedCondenserTemp: "Sat. Cond.",
  saturatedSuctionTemp: "Sat. Suction",
  setPointCelsius: "Set Point",
  dischargePressure: "Discharge",
  mainSuctionPressure: "Main Suction",
  condenserInletPressure: "Cond. Inlet P.",
  condenserOutletPressure: "Cond. Outlet P.",
  evaporatorInletPressure: "Evap. Inlet P.",
  evaporatorOutletPressure: "Evap. Outlet P.",
  load: "Comp. Load",
  inlineBtuMeter: "BTU Meter",
};

export function describeChillerLock(state: { hasChiller: boolean; missing: readonly string[] }): string | null {
  if (!state.hasChiller) return "Select the chiller first.";
  if (state.missing.length === 0) return null;
  const names = state.missing.map((f) => CHILLER_FIELD_LABELS[f] ?? f);
  const shown = names.slice(0, 4).join(", ");
  const more = names.length > 4 ? ` and ${names.length - 4} more` : "";
  return `${names.length} required reading${names.length === 1 ? " is" : "s are"} still empty: ${shown}${more}.`;
}
