/**
 * Efficiency reports — read-only rows from
 *   GET /api/high-side-efficiency   (high_side_efficiency_report)
 *   GET /api/low-side-efficiency    (low_side_efficiency_report)
 * (backend services/sitelogs). The same list endpoints and the same filter
 * payload the web /efficiency page sends: `filters` JSON with a `site_id`
 * equality and a `report_date` between. The tables name the column `site_id`
 * but it holds `sites.site_code` values (see the repositories), so the site
 * code goes in it. The server also caps rows to the caller's assigned sites.
 *
 * Offline behaviour matches HomeDashboardService: the last good answer per
 * user + side + site + period is kept in AsyncStorage and served back
 * (flagged `isFromCache`) when the network fails. AsyncStorage is cleared on
 * sign-out, so a shared device never shows the previous operator's numbers.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

export type EffSide = "high" | "low";

/** One day's efficiency row. Numeric columns are Postgres `numeric`, which
 *  node-pg serialises as strings — consumers must coerce (lib.toNum). */
export interface EffRow {
  id: string;
  source_id?: number | null;
  report_date: string | null;
  day?: string | null;
  site_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_synced_at?: string | null;
  // high side
  plant_consumption?: number | string | null;
  trh_delivered?: number | string | null;
  plant_sec?: number | string | null;
  chiller_consumption?: number | string | null;
  chwp_consumption?: number | string | null;
  cndp_consumption?: number | string | null;
  ct_consumption?: number | string | null;
  // low side
  tonnage?: number | string | null;
  total_consumption?: number | string | null;
  low_side_sec?: number | string | null;
  low_side_with_heater_sec?: number | string | null;
}

export type Loaded<T> =
  | { success: true; data: T; isFromCache?: boolean }
  | { success: false; error: string };

const API_PATH: Record<EffSide, string> = {
  high: "/api/high-side-efficiency",
  low: "/api/low-side-efficiency",
};

/**
 * One row per site per day (a few days carry a duplicate), so this covers a
 * custom range of well over a year; the server caps pages at 10,000.
 */
const ROW_LIMIT = 1000;

const CACHE_PREFIX = "efficiency:v1:";

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => {});
}

const EfficiencyService = {
  /** Rows for one site over [from, to] (inclusive "YYYY-MM-DD"), oldest first. */
  async getRows(
    userId: string,
    side: EffSide,
    siteCode: string,
    from: string,
    to: string,
  ): Promise<Loaded<EffRow[]>> {
    const filters = [
      { id: "global-site", fieldId: "site_id", operator: "equals", value: siteCode },
      { id: "eff-date-range", fieldId: "report_date", operator: "between", value: from, valueEnd: to },
    ];
    const qs = new URLSearchParams({
      page: "1",
      limit: String(ROW_LIMIT),
      sortBy: "report_date",
      sortOrder: "asc",
      filters: JSON.stringify(filters),
    });
    const path = `${API_PATH[side]}?${qs.toString()}`;
    const cacheKey = `${userId}:${side}:${siteCode}:${from}:${to}`;

    try {
      const res = await centralApiFetch(`${API_BASE_URL}${path}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.success && Array.isArray(body.data)) {
        writeCache(cacheKey, body.data);
        return { success: true, data: body.data as EffRow[] };
      }
      // A 4xx is a real answer (bad params, no access) — don't paper over it
      // with stale numbers.
      if (res.status < 500) {
        return { success: false, error: body?.error || `HTTP ${res.status}` };
      }
      logger.warn("Efficiency server error", { path, status: res.status });
    } catch (error) {
      logger.warn("Efficiency fetch failed", { path, error });
    }
    const cached = await readCache<EffRow[]>(cacheKey);
    if (cached) return { success: true, data: cached, isFromCache: true };
    return { success: false, error: "Unable to load efficiency data" };
  },
};

export default EfficiencyService;
