/**
 * A site-log row belongs to the category of the schedule slot it was seeded
 * from. `meta_date` carries that slot's label ("Temp RH (1/3) - 03-11-2026",
 * "Water - 03-11-2026"). A row whose own log_name is another category was
 * filed under the wrong template on the server (Kondapur's Water "WTP
 * Parameters" inside the Temp RH shifts) — the server no longer creates or
 * keeps those, so a phone that already pulled one drops it.
 */

/** Temp RH / Water / Chemical Dosing, or null for anything else. */
function categoryOf(name?: string | null): string | null {
  const lower = String(name ?? "").toLowerCase();
  if (!lower.trim()) return null;
  if (lower.includes("temp")) return "Temp RH";
  if (lower.includes("chemical")) return "Chemical Dosing";
  if (lower.includes("water")) return "Water";
  return null;
}

/** The log name a schedule label starts with: "Temp RH (1/3) - 03-11-2026" → "Temp RH". */
function slotLogName(metaDate: string): string {
  return metaDate.split(" - ")[0]!.replace(/\s*\(\d\/\d\)\s*$/, "").trim();
}

/**
 * True when the row's log_name and its slot's label are both known categories
 * and differ. Anything unparseable is kept.
 */
export function isForeignCategorySiteLog(row: {
  log_name?: string | null;
  meta_date?: string | null;
}): boolean {
  if (!row.meta_date) return false;
  const own = categoryOf(row.log_name);
  const slot = categoryOf(slotLogName(row.meta_date));
  if (!own || !slot) return false;
  return own !== slot;
}
