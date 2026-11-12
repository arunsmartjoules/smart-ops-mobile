/**
 * An incident can affect several assets (2026-11). The server keeps
 * `asset_locations` (every asset, PRIMARY FIRST) and still keeps
 * `asset_location` = the primary, which SLA, the monthly report, API v2 and
 * older app builds read.
 *
 * Rows written before the change come back with `asset_locations: []` (or
 * without the field) until the server backfill runs, so every screen reads the
 * list through `incidentAssets()` — never `asset_location` on its own.
 *
 * Mirrors backend services/tickets/src/repositories/incidentsRepository.ts
 * (`cleanAssetList`). Pure: no React Native imports, so jest can load it.
 */

/** The server keeps at most this many assets per incident. */
export const MAX_INCIDENT_ASSETS = 50;

/** Any list-ish input → trimmed, de-duplicated names, order kept, capped. */
export function cleanAssetList(input: unknown): string[] {
  let raw: unknown = input;
  // The local SQLite copy stores the list as JSON text.
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        raw = JSON.parse(s);
      } catch {
        return [];
      }
    } else {
      raw = [s];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const name = v.trim();
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= MAX_INCIDENT_ASSETS) break;
  }
  return out;
}

/**
 * Every asset an incident (server row, local SQLite row or form) names,
 * primary first: the list when it has entries, else the single legacy
 * `asset_location`, else none.
 */
export function incidentAssets(
  row: { asset_locations?: unknown; asset_location?: string | null } | null | undefined,
): string[] {
  if (!row) return [];
  const list = cleanAssetList(row.asset_locations);
  if (list.length > 0) return list;
  const single = typeof row.asset_location === "string" ? row.asset_location.trim() : "";
  return single ? [single] : [];
}

/** Add `value` if it is missing, remove it if present. Keeps order (primary first). */
export function toggleAsset(list: string[], value: string, max = MAX_INCIDENT_ASSETS): string[] {
  if (list.includes(value)) return list.filter((a) => a !== value);
  if (list.length >= max) return list;
  return [...list, value];
}

/** The two fields the API wants, kept in step: the list and its primary. */
export function assetFields(list: string[]): { asset_locations: string[]; asset_location: string | null } {
  const clean = cleanAssetList(list);
  return { asset_locations: clean, asset_location: clean[0] ?? null };
}
