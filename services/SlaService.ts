/**
 * SLA scorecard data — `/api/sla/:siteCode/*` (backend services/sla).
 *
 * Read-only, so offline behaviour is "last good answer", the same as
 * HomeDashboardService: every successful response is kept in AsyncStorage per
 * user + site + month (+ deliverable) and served back flagged `isFromCache`
 * when the network or server fails. A 4xx is a real answer (pre-cutoff month
 * for a non-admin → 403, unknown deliverable → 400) and is never papered over
 * with a stale copy.
 *
 * Shapes mirror backend services/sla/src/services/slaCalculator.ts
 * (`SlaReport`) and slaDrillDown.ts (`DrillDown`). Percent-style fields
 * (`performanceRating`, `commitmentPct`, `actualPct`, `weight`) are fractions
 * 0..1; scores are out of the deliverable's target (normally 5).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

export type SlaCategoryKey = "comfort" | "qos" | "responsiveness" | "resolution";

export interface SlaDeliverable {
  key: string;
  category: SlaCategoryKey;
  deliverable: string;
  commitment: string;
  unit: string;
  reviewSystem: string;
  sourceModule?: string;
  commitmentPct: number;
  targetScore: number;
  weight: number;
  actualPct: number;
  actualScore: number;
  numerator: number;
  denominator: number;
  note?: string;
}

export interface SlaCategory {
  category: SlaCategoryKey;
  label: string;
  /** Absent on reports stored before templates existed — only `false` hides. */
  applicable?: boolean;
  weight: number;
  targetScore: number;
  achievedScore: number;
  weightedTarget: number;
  weightedAchieved: number;
  deliverables: SlaDeliverable[];
}

export interface SlaBand {
  level: number;
  label: string;
  range: string;
  feeImplication: string;
  minPct: number;
  maxPct: number;
}

export interface SlaReport {
  site: { siteCode: string; name: string | null };
  period: {
    monthKey: string;
    monthStart: string;
    monthEnd: string;
    daysInMonth: number;
    quarterStart: string;
    quarterEnd: string;
    isFullMonth?: boolean;
  };
  totals: { targetScore: number; achievedScore: number; performanceRating: number };
  band: { level: number; label: string; range: string; feeImplication: string };
  categories: SlaCategory[];
  template?: { id: number | null; name: string; weightedScoring: boolean };
  implications: SlaBand[];
  /** When the report was materialized into the SLA store ("last synced"). */
  computedAt?: string;
}

export type SlaCell = string | number | null;

export interface SlaDrillColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

export interface SlaDrillStep {
  label: string;
  detail?: string;
  value: string;
  accent?: boolean;
}

export interface SlaDrillDown {
  deliverableKey: string;
  category: string;
  deliverable: string;
  formula: string;
  commitment: string;
  unit: string;
  sourceModule?: string;
  numerator: { label: string; value: number };
  denominator: { label: string; value: number };
  actualPct: number;
  actualScore: number;
  targetScore: number;
  commitmentPct: number;
  columns: SlaDrillColumn[];
  rows: Record<string, SlaCell>[];
  steps: SlaDrillStep[];
  notes: string[];
}

export type SlaLoaded<T> =
  | { success: true; data: T; isFromCache?: boolean }
  | { success: false; error: string; status?: number };

const CACHE_PREFIX = "sla:v1:";
/**
 * Drill-downs can carry thousands of source rows. Android's AsyncStorage
 * reads a value through a ~2 MB cursor window, so anything near that is not
 * cached at all rather than written and then failing to read back.
 */
const MAX_CACHE_CHARS = 900_000;

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return;
  }
  if (raw.length > MAX_CACHE_CHARS) return;
  AsyncStorage.setItem(CACHE_PREFIX + key, raw).catch(() => {});
}

async function load<T>(path: string, cacheKey: string): Promise<SlaLoaded<T>> {
  try {
    const res = await centralApiFetch(`${API_BASE_URL}${path}`);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && body.data) {
      writeCache(cacheKey, body.data);
      return { success: true, data: body.data as T };
    }
    if (res.status < 500) {
      return {
        success: false,
        status: res.status,
        error: body?.error || `HTTP ${res.status}`,
      };
    }
    logger.warn("SLA server error", { path, status: res.status });
  } catch (error) {
    logger.warn("SLA fetch failed", { path, error });
  }
  const cached = await readCache<T>(cacheKey);
  if (cached) return { success: true, data: cached, isFromCache: true };
  return { success: false, error: "Unable to load SLA data" };
}

const SlaService = {
  /** GET /api/sla/:siteCode/summary?month=YYYY-MM */
  getSummary(userId: string, siteCode: string, month: string) {
    return load<SlaReport>(
      `/api/sla/${encodeURIComponent(siteCode)}/summary?month=${encodeURIComponent(month)}`,
      `${userId}:${siteCode}:summary:${month}`,
    );
  },

  /** GET /api/sla/:siteCode/drilldown/:deliverableKey?month=YYYY-MM */
  getDrilldown(userId: string, siteCode: string, month: string, deliverableKey: string) {
    return load<SlaDrillDown>(
      `/api/sla/${encodeURIComponent(siteCode)}/drilldown/${encodeURIComponent(
        deliverableKey,
      )}?month=${encodeURIComponent(month)}`,
      `${userId}:${siteCode}:drill:${month}:${deliverableKey}`,
    );
  },

  /** Backend-rendered exports, relative to API_BASE_URL (for saveBackendFile). */
  exportPath(siteCode: string, month: string, kind: "pdf" | "xlsx") {
    return `/api/sla/${encodeURIComponent(siteCode)}/export.${kind}?month=${encodeURIComponent(month)}`;
  },
};

export default SlaService;
