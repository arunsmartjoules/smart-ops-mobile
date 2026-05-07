/**
 * Log Activity Master Service (mobile)
 *
 * Thin wrapper around the new backend endpoint that records start/finish
 * timestamps for `log_activity_master` rows in BOTH our database and
 * Fieldproxy. The mobile app fires these calls when the user starts /
 * finishes a site log task so the row's `startdatetime`, `enddatetime`,
 * `executor_id` and `assigned_to` columns stay accurate without manual
 * Fieldproxy updates.
 *
 * Best-effort by design: failures must not block the existing offline-first
 * site logs flow. SyncEngine + the nightly server cron will reconcile.
 */

import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";

export type LogActivityShiftLabel = "1/3" | "2/3" | "3/3" | string;

export interface LogActivityEventOptions {
  action: "start" | "finish";
  fp_id?: number;
  unique_id?: string;
  site_id?: string;
  log_type?: string;
  due_date?: string;
  shift_label?: LogActivityShiftLabel | null;
  executor_id?: string | null;
  assigned_to?: string | null;
  startdatetime?: string | null;
  enddatetime?: string | null;
}

export interface LogActivityEventResult {
  ok: boolean;
  status?: number;
  data?: any;
  error?: string;
}

const ENDPOINT = "/api/log-activity-master/event";

function buildUrl(): string {
  const base = (API_BASE_URL || "").replace(/\/$/, "");
  return `${base}${ENDPOINT}`;
}

/**
 * Convert a UI shift letter ("A" | "B" | "C") into the metadata token used
 * by Fieldproxy ("1/3" | "2/3" | "3/3"). Returns null when the letter is
 * unknown or the log type doesn't use shifts.
 */
export function uiShiftToLabel(shift?: string | null): LogActivityShiftLabel | null {
  if (!shift) return null;
  const s = String(shift).trim().toUpperCase();
  if (s === "A" || s === "1" || s === "1/3") return "1/3";
  if (s === "B" || s === "2" || s === "2/3") return "2/3";
  if (s === "C" || s === "3" || s === "3/3") return "3/3";
  return null;
}

/**
 * Record a start/finish event for a log_activity_master row. Best-effort —
 * resolves with `{ ok: false, error }` on network/4xx/5xx instead of
 * throwing, so callers can fire-and-forget without try/catch.
 */
export async function recordLogActivityEvent(
  options: LogActivityEventOptions,
): Promise<LogActivityEventResult> {
  if (options.action !== "start" && options.action !== "finish") {
    return { ok: false, error: "Invalid action" };
  }

  const payload: Record<string, unknown> = { action: options.action };
  if (options.fp_id !== undefined) payload.fp_id = options.fp_id;
  if (options.unique_id !== undefined) payload.unique_id = options.unique_id;
  if (options.site_id !== undefined) payload.site_id = options.site_id;
  if (options.log_type !== undefined) payload.log_type = options.log_type;
  if (options.due_date !== undefined) payload.due_date = options.due_date;
  if (options.shift_label !== undefined) payload.shift_label = options.shift_label;
  if (options.executor_id !== undefined) payload.executor_id = options.executor_id;
  if (options.assigned_to !== undefined) payload.assigned_to = options.assigned_to;
  if (options.startdatetime !== undefined) payload.startdatetime = options.startdatetime;
  if (options.enddatetime !== undefined) payload.enddatetime = options.enddatetime;

  try {
    const res = await apiFetch(buildUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body?.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data: body?.data ?? body };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Cache of recently-fired start events so we don't spam the endpoint when
 * the user types repeatedly into the same task. Keyed by site|logType|date|shift
 * (or by id when available). Entries clear on app reload.
 */
const startedKeys = new Set<string>();

function cacheKey(opts: LogActivityEventOptions): string {
  if (opts.fp_id) return `fp:${opts.fp_id}`;
  if (opts.unique_id) return `uid:${opts.unique_id}`;
  return [
    opts.site_id || "",
    opts.log_type || "",
    opts.due_date || "",
    opts.shift_label || "",
  ].join("|");
}

/**
 * Idempotent start: only fires once per task per app session unless `force`
 * is passed. Useful for hooking into existing auto-save / first-input
 * flows in LogEntryModule.
 */
export async function recordLogActivityStartOnce(
  options: LogActivityEventOptions,
  force: boolean = false,
): Promise<LogActivityEventResult> {
  const key = cacheKey(options);
  if (!force && startedKeys.has(key)) {
    return { ok: true, status: 0, data: { skipped: "already-started-this-session" } };
  }
  const result = await recordLogActivityEvent({ ...options, action: "start" });
  if (result.ok) startedKeys.add(key);
  return result;
}

export default {
  recordLogActivityEvent,
  recordLogActivityStartOnce,
  uiShiftToLabel,
};
