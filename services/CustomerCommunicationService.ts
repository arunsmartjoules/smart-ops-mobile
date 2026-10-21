/**
 * Client communication log — `/api/customer-communication-logs`
 * (backend: services/sitelogs/src/routes/customerCommunication.ts).
 *
 * Mirrors the web workspace (web/src/app/customer-communication/page.tsx):
 * the logger is low-volume, so the whole list is pulled once and scoped to a
 * site client-side by `site_name` (the table keys rows by site NAME, not
 * site_code). The server already narrows non-admin callers to their own
 * sites.
 *
 * Reads keep a last-good copy in AsyncStorage per user and serve it back
 * (flagged `isFromCache`) when the network fails. Writes are online-only —
 * they return `offline: true` when the request never reached the server so
 * the screen can say so instead of showing a generic error.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

/** A row of `customer_communication_logger`, as the API returns it. */
export interface CommRow {
  id: string;
  cc_id?: string | null;
  source_id?: number | null;
  site_name?: string | null;
  submitted_at?: string | null;
  email_address?: string | null;
  role_of_person?: string | null;
  /** Postgres DATE → `YYYY-MM-DD`. */
  communication_date?: string | null;
  /** Postgres TIME → `HH:MM:SS`. */
  communication_time?: string | null;
  input_from?: string | null;
  /** Comma-joined list of type keys. */
  communication_type?: string | null;
  detailed_description?: string | null;
  priority?: string | null;
  /** Comma-joined owner TEAMS (the person is `assignee`). */
  owner?: string | null;
  expected_action?: string | null;
  /** Postgres DATE → `YYYY-MM-DD`. */
  expected_closure_date?: string | null;
  /** One URL per line. */
  attachments?: string | null;
  resolution_summary?: string | null;
  /** 'action' | 'feedback'. */
  stream?: string | null;
  status?: string | null;
  assignee?: string | null;
  /** JSON-encoded `[{when, who, what}]`. */
  timeline?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** A person the entry can be assigned to (same source as the web picker). */
export interface CommPerson {
  name: string;
  role: string;
}

/**
 * Body accepted by POST / PUT — the column names of
 * `createCustomerCommunicationSchema` (backend shared/src/types/schemas.ts).
 */
export type CommWrite = Partial<Omit<CommRow, "id" | "created_at" | "updated_at">>;

export type Loaded<T> =
  | { success: true; data: T; isFromCache?: boolean }
  | { success: false; error: string };

export type WriteResult =
  | { success: true; data: CommRow }
  | { success: false; error: string; offline?: boolean };

const API = `${API_BASE_URL}/api/customer-communication-logs`;
const CACHE_PREFIX = "customer_comms:v1:";

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

async function loadList<T>(url: string, cacheKey: string): Promise<Loaded<T[]>> {
  try {
    const res = await centralApiFetch(url);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && Array.isArray(body.data)) {
      writeCache(cacheKey, body.data);
      return { success: true, data: body.data as T[] };
    }
    // A 4xx is a real answer (no access, bad params) — don't hide it behind
    // a stale list.
    if (res.status < 500) {
      return { success: false, error: body?.error || `HTTP ${res.status}` };
    }
    logger.warn("Customer comms server error", { url, status: res.status });
  } catch (error) {
    logger.warn("Customer comms fetch failed", { url, error });
  }
  const cached = await readCache<T[]>(cacheKey);
  if (cached) return { success: true, data: cached, isFromCache: true };
  return { success: false, error: "Unable to load client communication" };
}

async function write(url: string, method: "POST" | "PUT", body: CommWrite): Promise<WriteResult> {
  let res: Response;
  try {
    res = await centralApiFetch(url, { method, body: JSON.stringify(body) });
  } catch (error) {
    logger.warn("Customer comms write failed", { url, method, error });
    return {
      success: false,
      offline: true,
      error: "Couldn't reach the server. Check your connection and try again.",
    };
  }
  const json = await res.json().catch(() => null);
  if (res.ok && json?.success && json.data) {
    return { success: true, data: json.data as CommRow };
  }
  return { success: false, error: json?.error || `Save failed (HTTP ${res.status})` };
}

const CustomerCommunicationService = {
  /**
   * Every entry the caller may see, newest first. Same request the web makes
   * (`?limit=5000&sortBy=submitted_at&sortOrder=desc`); site scoping is done
   * by the screen so the next `CC-####` reference can be computed across all
   * of the caller's sites, as the web does.
   */
  list(userId: string) {
    const qs = new URLSearchParams({
      limit: "5000",
      sortBy: "submitted_at",
      sortOrder: "desc",
    });
    return loadList<CommRow>(`${API}?${qs.toString()}`, `${userId}:list`);
  },

  /** Assignee options — `/api/users?limit=1000`, de-duplicated by name. */
  async people(userId: string): Promise<CommPerson[]> {
    const res = await loadList<Record<string, unknown>>(
      `${API_BASE_URL}/api/users?limit=1000`,
      `${userId}:people`,
    );
    if (!res.success) return [];
    const seen = new Set<string>();
    const out: CommPerson[] = [];
    for (const u of res.data) {
      const name = String(u.name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, role: String(u.role ?? "").trim() });
    }
    return out;
  },

  create(body: CommWrite) {
    return write(API, "POST", body);
  },

  update(id: string, patch: CommWrite) {
    return write(`${API}/${encodeURIComponent(id)}`, "PUT", patch);
  },
};

export default CustomerCommunicationService;
