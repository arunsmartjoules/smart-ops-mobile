/**
 * Data for the JoulePays Home (components/home/JoulePaysHome): the site's
 * billing month from the trend sheet, read-only.
 *
 * - `getMonth`: `GET /api/trend-sheet/entry/:site/days?month=` (the month
 *   screen's call, gated on `trend_sheet_entry`).
 * - `getContract`: the site's row of `GET /api/trend-sheet/dashboard`
 *   (gated on `trend_sheet_dashboard`; it carries revenue, so it is only
 *   asked for by roles that can see the savings dashboard).
 *
 * Offline behaviour is "last good answer", as for the JouleCool Home
 * (HomeDashboardService): every successful answer is kept in AsyncStorage per
 * user + site + month and served back flagged `isFromCache` when the request
 * fails. AsyncStorage is wiped on sign-out, so a shared phone never shows the
 * previous person's figures.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import logger from "@/utils/logger";
import { pickContractSite, type JoulePaysContract } from "@/utils/joulePaysHome";
import type { TrendDayList } from "@/utils/trendSheet";

const MODULE = "JOULEPAYS_HOME";
const CACHE_PREFIX = "joulepays_home:v1:";

export type HomeLoaded<T> =
  | { ok: true; data: T; isFromCache: boolean }
  /** `offline`: no answer and nothing cached. */
  | { ok: false; offline: boolean; error: string };

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => {});
}

/**
 * One GET with the cache behind it. A 4xx answer (no access, site not set up)
 * is passed on as an error and never replaced by a cached copy: the cache is
 * for a missing network, not for a refusal.
 */
async function load<T>(
  cacheKey: string,
  url: string,
  read: (data: unknown) => T | null,
): Promise<HomeLoaded<T>> {
  try {
    const res = await apiFetch(url);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success) {
      const data = read(body.data);
      if (data != null) {
        writeCache(cacheKey, data);
        return { ok: true, data, isFromCache: false };
      }
      return { ok: false, offline: false, error: "The answer had nothing for this site." };
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      return { ok: false, offline: false, error: body?.error || `HTTP ${res.status}` };
    }
  } catch (error) {
    logger.warn("JoulePaysHomeService: request failed", { module: MODULE, url, error });
  }
  const cached = await readCache<T>(cacheKey);
  if (cached != null) return { ok: true, data: cached, isFromCache: true };
  return { ok: false, offline: true, error: "No connection" };
}

function isDayList(v: unknown): v is TrendDayList {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<TrendDayList>;
  return typeof d.from === "string" && typeof d.to === "string" && Array.isArray(d.days) && !!d.summary;
}

/** The site's billing month by name ("YYYY-MM"), day by day, with its Electricity summary. */
function getMonth(userId: string, siteCode: string, month: string): Promise<HomeLoaded<TrendDayList>> {
  return load(
    `${userId}:${siteCode}:days:${month}`,
    `${API_BASE_URL}/api/trend-sheet/entry/${encodeURIComponent(siteCode)}/days?month=${encodeURIComponent(month)}`,
    (data) => (isDayList(data) ? data : null),
  );
}

/** The site's contract figures for its billing month by name ("YYYY-MM"), up to yesterday. */
function getContract(userId: string, siteCode: string, month: string): Promise<HomeLoaded<JoulePaysContract>> {
  return load(
    `${userId}:${siteCode}:contract:${month}`,
    `${API_BASE_URL}/api/trend-sheet/dashboard?period=month&month=${encodeURIComponent(month)}`,
    (data) => pickContractSite(data, siteCode),
  );
}

const JoulePaysHomeService = { getMonth, getContract };
export default JoulePaysHomeService;
