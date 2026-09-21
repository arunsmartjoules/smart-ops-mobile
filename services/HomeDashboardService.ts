/**
 * Home dashboard data — `/api/home-dashboard/*`.
 *
 * Both calls are read-only aggregates, so offline behaviour is "last good
 * answer": every successful response is kept in AsyncStorage per
 * user + site + scope and served back (flagged `isFromCache`) when the network
 * fails. AsyncStorage is wiped on sign-out, so a shared device never shows the
 * previous operator's numbers.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

export interface EfficiencyReading {
  value: number | null;
  previous: number | null;
  asOf: string | null;
}

export interface HomeSummary {
  site: { siteCode: string; name: string | null };
  period: { from: string; to: string };
  tickets: { raised: number; resolved: number; open: number; slaBreached: number };
  breachAlert: {
    breached: number;
    atRisk: number;
    nextDueInMin: number | null;
    ticketNo: string | null;
    title: string | null;
    area: string | null;
  } | null;
  logs: { expected: number; completed: number };
  pm: { planned: number; completed: number };
  incidents: { raised: number; open: number };
  attendance: { present: number; onShift: number };
  efficiency: { highSide: EfficiencyReading; lowSide: EfficiencyReading };
}

export interface HomeSlaMonth {
  month: string;
  score: number | null;
  pct: number | null;
}

export interface HomeSla extends HomeSlaMonth {
  kpis: { key: string; label: string; score: number; target: number }[];
  months: HomeSlaMonth[];
}

export type Loaded<T> =
  | { success: true; data: T; isFromCache?: boolean }
  | { success: false; error: string };

const CACHE_PREFIX = "home_dashboard:v1:";

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(
    () => {},
  );
}

async function load<T>(path: string, cacheKey: string): Promise<Loaded<T>> {
  try {
    const res = await centralApiFetch(`${API_BASE_URL}${path}`);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && body.data) {
      writeCache(cacheKey, body.data);
      return { success: true, data: body.data as T };
    }
    // A 4xx is a real answer (bad params, no access) — don't paper over it
    // with stale numbers.
    if (res.status < 500) {
      return { success: false, error: body?.error || `HTTP ${res.status}` };
    }
    logger.warn("Home dashboard server error", { path, status: res.status });
  } catch (error) {
    logger.warn("Home dashboard fetch failed", { path, error });
  }
  const cached = await readCache<T>(cacheKey);
  if (cached) return { success: true, data: cached, isFromCache: true };
  return { success: false, error: "Unable to load dashboard" };
}

const HomeDashboardService = {
  getSummary(userId: string, siteCode: string, from: string, to: string) {
    const qs = new URLSearchParams({ site_code: siteCode, from, to });
    return load<HomeSummary>(
      `/api/home-dashboard/summary?${qs.toString()}`,
      `${userId}:${siteCode}:summary:${from}:${to}`,
    );
  },

  getSla(userId: string, siteCode: string, month: string) {
    const qs = new URLSearchParams({ site_code: siteCode, month });
    return load<HomeSla>(
      `/api/home-dashboard/sla?${qs.toString()}`,
      `${userId}:${siteCode}:sla:${month}`,
    );
  },
};

export default HomeDashboardService;
