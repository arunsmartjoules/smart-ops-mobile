/**
 * Reports tab data.
 *
 *  - Module exports: rows come from each module's own list endpoint for the
 *    selected site + date range and are turned into CSV on the device. No
 *    module has a backend Excel/PDF export endpoint, so CSV is the only
 *    format offered for them.
 *  - Daily / MTD documents: the portfolio-wide JouleCool reports
 *    (`/api/daily-report`, `/api/monthly-report`). The screen only needs a
 *    handful of headline numbers, so the large report payload is reduced to a
 *    `DocSummary` here; that summary is cached in AsyncStorage per user + date
 *    so the card still renders offline. The PDF itself always comes from the
 *    backend renderer (same bytes as the scheduled email).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { apiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import { formatISTDateTime } from "../utils/istDate";
import { toCsv } from "../utils/fileExport";

/* ── Shared ──────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

export type Loaded<T> =
  | { success: true; data: T; isFromCache?: boolean }
  | { success: false; error: string };

/** The report aggregates are heavy queries — allow longer than the 30s default. */
const REPORT_TIMEOUT_MS = 90_000;
const LIST_TIMEOUT_MS = 60_000;
/** Rows per list request, and the most pages one export will pull. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

async function getJson(path: string, timeout: number): Promise<{ status: number; body: any }> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {}, timeout);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function errorFrom(status: number, body: any, fallback: string): string {
  if (status === 403) return "You don't have access to this data.";
  return (typeof body?.error === "string" && body.error) || `${fallback} (HTTP ${status}).`;
}

const s = (v: unknown): string => (v == null ? "" : String(v));
/** Timestamp column → "12 May 2026, 14:30" IST; calendar dates pass through untouched. */
const dt = (v: unknown): string => (v == null || v === "" ? "" : formatISTDateTime(v as string));
const norm = (v: unknown) => s(v).trim().toLowerCase();

/* ── Module exports ──────────────────────────────────────────────────── */

export type ReportModuleKey =
  | "tickets"
  | "incidents"
  | "pm"
  | "sitelogs"
  | "attendance"
  | "comms";

export interface ModuleScope {
  siteCode: string;
  /** `sites.name` — client communication rows key the site by name, not code. */
  siteName: string;
  from: string; // YYYY-MM-DD (IST)
  to: string; // YYYY-MM-DD (IST)
}

interface Column {
  label: string;
  get: (r: Row) => string | number;
}

interface ModuleDef {
  /** List path for one page. */
  path: (scope: ModuleScope, page: number, limit: number) => string;
  /**
   * True when the endpoint can't narrow to the site itself, so the count has
   * to come from the filtered rows rather than `pagination.total`.
   */
  clientFiltered?: boolean;
  keep?: (r: Row, scope: ModuleScope) => boolean;
  columns: Column[];
}

const qs = (o: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

const MODULES: Record<ReportModuleKey, ModuleDef> = {
  // GET /api/complaints/site/:siteCode — fromDate/toDate bound created_at in IST.
  tickets: {
    path: (sc, page, limit) =>
      `/api/complaints/site/${encodeURIComponent(sc.siteCode)}?${qs({ page, limit, fromDate: sc.from, toDate: sc.to })}`,
    columns: [
      { label: "Ticket No", get: (r) => s(r.ticket_no) },
      { label: "Site", get: (r) => s(r.site_code) },
      { label: "Title", get: (r) => s(r.title) },
      { label: "Location", get: (r) => s(r.location) },
      { label: "Area / Asset", get: (r) => s(r.area_asset) },
      { label: "Category", get: (r) => s(r.category) },
      { label: "Status", get: (r) => s(r.status) },
      { label: "Priority", get: (r) => s(r.priority) },
      { label: "Assigned To", get: (r) => s(r.assigned_to) },
      { label: "Created By", get: (r) => s(r.created_user) },
      { label: "Created", get: (r) => dt(r.created_at) },
      { label: "Resolved", get: (r) => dt(r.resolved_at) },
    ],
  },
  // GET /api/incidents — fromDate/toDate bound incident_created_time in IST.
  incidents: {
    path: (sc, page, limit) =>
      `/api/incidents?${qs({ page, limit, site_code: sc.siteCode, fromDate: sc.from, toDate: sc.to })}`,
    columns: [
      { label: "Incident ID", get: (r) => s(r.incident_id) },
      { label: "Site", get: (r) => s(r.site_code) },
      { label: "Fault Symptom", get: (r) => s(r.fault_symptom) },
      { label: "Fault Type", get: (r) => s(r.fault_type) },
      { label: "Severity", get: (r) => s(r.severity) },
      { label: "Asset / Location", get: (r) => s(r.asset_location) },
      { label: "Operating Condition", get: (r) => s(r.operating_condition) },
      { label: "Status", get: (r) => s(r.status) },
      { label: "RCA Status", get: (r) => s(r.rca_status) },
      { label: "Raised By", get: (r) => s(r.raised_by) },
      { label: "Immediate Action", get: (r) => s(r.immediate_action_taken) },
      { label: "Root Cause", get: (r) => s(r.root_cause) },
      { label: "Corrective Action", get: (r) => s(r.corrective_action) },
      { label: "Preventive Action", get: (r) => s(r.preventive_action) },
      { label: "Created", get: (r) => dt(r.incident_created_time) },
      { label: "Resolved", get: (r) => dt(r.incident_resolved_time) },
      { label: "Remarks", get: (r) => s(r.remarks) },
    ],
  },
  // GET /api/pm-instances/site/:siteCode — from_date/to_date bound start_due_date.
  pm: {
    path: (sc, page, limit) =>
      `/api/pm-instances/site/${encodeURIComponent(sc.siteCode)}?${qs({ page, limit, from_date: sc.from, to_date: sc.to })}`,
    columns: [
      { label: "Scheduled Date", get: (r) => s(r.start_due_date) },
      { label: "Site", get: (r) => s(r.site_code) },
      { label: "Instance ID", get: (r) => s(r.instance_id) },
      { label: "Asset", get: (r) => s(r.asset_id) },
      { label: "Asset Type", get: (r) => s(r.asset_type) },
      { label: "Activity", get: (r) => s(r.title) },
      { label: "Frequency", get: (r) => s(r.frequency) },
      { label: "Status", get: (r) => s(r.status) },
      { label: "Assigned To", get: (r) => s(r.assigned_to_name) },
      { label: "Completed On", get: (r) => dt(r.completed_on) },
      { label: "Remarks", get: (r) => s(r.remarks) },
    ],
  },
  // GET /api/site-logs — the real-column list (not the mobile legacy shape);
  // scheduled_date_from/to bound the calendar scheduled_date.
  sitelogs: {
    path: (sc, page, limit) =>
      `/api/site-logs?${qs({ page, limit, site_code: sc.siteCode, scheduled_date_from: sc.from, scheduled_date_to: sc.to })}`,
    columns: [
      { label: "Scheduled Date", get: (r) => s(r.scheduled_date) },
      { label: "Site", get: (r) => s(r.site_code) },
      { label: "Log Type", get: (r) => s(r.log_name) },
      { label: "Log ID", get: (r) => s(r.log_id) },
      { label: "Task", get: (r) => s(r.task_name) },
      { label: "Shift", get: (r) => s(r.shift_label) },
      { label: "Temperature", get: (r) => s(r.temperature) },
      { label: "RH", get: (r) => s(r.rh) },
      { label: "TDS", get: (r) => s(r.tds) },
      { label: "pH", get: (r) => s(r.ph) },
      { label: "Hardness", get: (r) => s(r.hardness) },
      { label: "Chemical Dosing", get: (r) => s(r.chemical_dosing) },
      { label: "Status", get: (r) => s(r.status) },
      { label: "Reading By", get: (r) => s(r.assigned_to) || s(r.executor_id) },
      { label: "Entry Time", get: (r) => dt(r.entry_time) },
      { label: "Remarks", get: (r) => s(r.remarks) },
    ],
  },
  // GET /api/attendance — date_from/date_to bound the calendar `date` column.
  attendance: {
    path: (sc, page, limit) =>
      `/api/attendance?${qs({ page, limit, site_code: sc.siteCode, date_from: sc.from, date_to: sc.to })}`,
    columns: [
      { label: "Date", get: (r) => s(r.date) },
      { label: "Employee", get: (r) => s((r.users as Row | null)?.name) },
      { label: "Employee Code", get: (r) => s((r.users as Row | null)?.employee_code) },
      { label: "Site", get: (r) => s((r.sites as Row | null)?.name) || s(r.site_code) },
      { label: "Check-In", get: (r) => dt(r.check_in_time) },
      { label: "Check-Out", get: (r) => dt(r.check_out_time) },
      { label: "Check-In Lat", get: (r) => s(r.check_in_latitude) },
      { label: "Check-In Long", get: (r) => s(r.check_in_longitude) },
      { label: "Status", get: (r) => s(r.status) },
      { label: "Remarks", get: (r) => s(r.remarks) },
    ],
  },
  // GET /api/customer-communication-logs — rows key the site by free-text
  // name, so (like the web page) the date range goes to the server as filter
  // rules on the DATE column and the site is matched by name on the device.
  comms: {
    clientFiltered: true,
    path: (sc, page, limit) =>
      `/api/customer-communication-logs?${qs({
        page,
        limit,
        filters: JSON.stringify([
          { fieldId: "communication_date", operator: ">=", value: sc.from },
          { fieldId: "communication_date", operator: "<=", value: sc.to },
        ]),
      })}`,
    keep: (r, sc) => norm(r.site_name) === norm(sc.siteName),
    columns: [
      { label: "CC ID", get: (r) => s(r.cc_id) },
      { label: "Date", get: (r) => s(r.communication_date) },
      { label: "Time", get: (r) => s(r.communication_time) },
      { label: "Site", get: (r) => s(r.site_name) },
      { label: "Stream", get: (r) => s(r.stream) },
      { label: "Type", get: (r) => s(r.communication_type) },
      { label: "Priority", get: (r) => s(r.priority) },
      { label: "Status", get: (r) => s(r.status) },
      { label: "Input From", get: (r) => s(r.input_from) },
      { label: "Role", get: (r) => s(r.role_of_person) },
      { label: "Description", get: (r) => s(r.detailed_description) },
      { label: "Owner", get: (r) => s(r.owner) },
      { label: "Assignee", get: (r) => s(r.assignee) },
      { label: "Expected Action", get: (r) => s(r.expected_action) },
      { label: "Expected Closure", get: (r) => s(r.expected_closure_date) },
      { label: "Resolution", get: (r) => s(r.resolution_summary) },
      { label: "Logged By", get: (r) => s(r.email_address) },
    ],
  },
};

async function fetchPage(path: string): Promise<{ rows: Row[]; total: number | null }> {
  const { status, body } = await getJson(path, LIST_TIMEOUT_MS);
  if (status < 200 || status >= 300 || !body?.success) {
    throw new Error(errorFrom(status, body, "Could not load the data"));
  }
  const rows: Row[] = Array.isArray(body.data) ? body.data : [];
  const total = Number(body.pagination?.total);
  return { rows, total: Number.isFinite(total) ? total : null };
}

/** Every row for the scope, page by page (bounded by MAX_PAGES). */
async function fetchAll(def: ModuleDef, scope: ModuleScope): Promise<{ rows: Row[]; truncated: boolean }> {
  const rows: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(def.path(scope, page, PAGE_SIZE));
    rows.push(...res.rows);
    const total = res.total;
    if (res.rows.length < PAGE_SIZE || (total != null && rows.length >= total)) {
      return { rows: def.keep ? rows.filter((r) => def.keep!(r, scope)) : rows, truncated: false };
    }
  }
  return { rows: def.keep ? rows.filter((r) => def.keep!(r, scope)) : rows, truncated: true };
}

export interface ModuleExport {
  csv: string;
  rowCount: number;
  /** Hit the page cap — the file holds the first PAGE_SIZE × MAX_PAGES rows. */
  truncated: boolean;
}

const ReportsService = {
  /** How many records the module has for the scope (for the row subtitle). */
  async countModule(key: ReportModuleKey, scope: ModuleScope): Promise<number> {
    const def = MODULES[key];
    if (def.clientFiltered) {
      return (await fetchAll(def, scope)).rows.length;
    }
    const res = await fetchPage(def.path(scope, 1, 1));
    return res.total ?? res.rows.length;
  },

  async exportModuleCsv(key: ReportModuleKey, scope: ModuleScope): Promise<ModuleExport> {
    const def = MODULES[key];
    const { rows, truncated } = await fetchAll(def, scope);
    const table = [def.columns.map((c) => c.label), ...rows.map((r) => def.columns.map((c) => c.get(r)))];
    return { csv: toCsv(table), rowCount: rows.length, truncated };
  },

  dailyPdf(date: string) {
    return {
      path: `/api/daily-report/pdf?${qs({ date })}`,
      filename: `JouleCool_Daily_${date}.pdf`,
    };
  },

  monthlyPdf(start: string, end: string) {
    return {
      path: `/api/monthly-report/pdf?${qs({ start, end })}`,
      filename: `JouleCool_MTD_${start}_to_${end}.pdf`,
    };
  },

  getDailySummary(userId: string, date: string) {
    return loadDoc(
      `/api/daily-report?${qs({ date })}`,
      `${userId}:daily:${date}`,
      (body) => summariseDaily(body as DailyReportSlice),
    );
  },

  getMonthlySummary(userId: string, start: string, end: string) {
    return loadDoc(
      `/api/monthly-report?${qs({ start, end })}`,
      `${userId}:mtd:${start}:${end}`,
      (body) => summariseMonthly(body as MonthlyReportSlice),
    );
  },
};

export default ReportsService;

/* ── Daily / MTD document summaries ──────────────────────────────────── */

export type DocTone = "ok" | "warn" | "bad" | "mute" | "ink";

export interface DocStat {
  value: string;
  label: string;
  tone: DocTone;
}

export interface DocSite {
  siteCode: string;
  name: string;
  meta: string;
  tone: DocTone;
}

export interface DocSummary {
  portfolioLabel: string;
  stats: DocStat[];
  sites: DocSite[];
}

const CACHE_PREFIX = "reports_doc:v1:";

async function readCache(key: string): Promise<DocSummary | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as DocSummary) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: DocSummary) {
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => {});
}

async function loadDoc(
  path: string,
  cacheKey: string,
  summarise: (data: unknown) => DocSummary,
): Promise<Loaded<DocSummary>> {
  try {
    const { status, body } = await getJson(path, REPORT_TIMEOUT_MS);
    if (status >= 200 && status < 300 && body?.success && body.data) {
      const summary = summarise(body.data);
      writeCache(cacheKey, summary);
      return { success: true, data: summary };
    }
    // A 4xx is a real answer (bad range, no access) — don't paper over it.
    if (status < 500) {
      return { success: false, error: errorFrom(status, body, "Could not load the report") };
    }
    logger.warn("Report server error", { path, status });
  } catch (error) {
    logger.warn("Report fetch failed", { path, error });
  }
  const cached = await readCache(cacheKey);
  if (cached) return { success: true, data: cached, isFromCache: true };
  return { success: false, error: "Could not load the report." };
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Share of `part` in `whole` as "92%", or "—" when there is nothing to score. */
function pct(part: number, whole: number): { text: string; value: number | null } {
  if (whole <= 0) return { text: "—", value: null };
  const p = Math.round((part / whole) * 100);
  return { text: `${p}%`, value: p };
}

/**
 * Completion-rate colour. These cut-offs are the screen's own (≥90% on track,
 * ≥75% watch, below that behind) — the reports themselves carry no thresholds.
 */
function rateTone(p: number | null): DocTone {
  if (p == null) return "mute";
  return p >= 90 ? "ok" : p >= 75 ? "warn" : "bad";
}

/** SLA score (out of 5) colour — the artboard's `sev`: ≥4.6 ok, ≥4 warn, else bad. */
function scoreTone(v: number): DocTone {
  return v >= 4.6 ? "ok" : v >= 4 ? "warn" : "bad";
}

// The parts of the backend's DailyReport this screen reads
// (backend/services/utility/src/services/dailyReportService.ts).
interface DailyReportSlice {
  portfolioLabel?: string;
  sites?: { siteCode: string; name: string; shortName: string }[];
  complaints?: {
    summary?: { raisedToday?: number; resolvedByEod?: number; stillOpen?: number };
    bySite?: { siteCode: string; raised?: number; stillOpen?: number }[];
  };
  pm?: { summary?: { planned?: number; completed?: number } };
  dailyLogs?: { summary?: Record<string, { completed?: number; planned?: number }> };
  incidents?: unknown[];
}

function summariseDaily(r: DailyReportSlice): DocSummary {
  const c = r.complaints?.summary ?? {};
  const resolved = pct(n(c.resolvedByEod), n(c.raisedToday));
  const pm = pct(n(r.pm?.summary?.completed), n(r.pm?.summary?.planned));
  const logCells = Object.values(r.dailyLogs?.summary ?? {});
  const logs = pct(
    logCells.reduce((a, x) => a + n(x?.completed), 0),
    logCells.reduce((a, x) => a + n(x?.planned), 0),
  );
  const incidents = Array.isArray(r.incidents) ? r.incidents.length : 0;
  const bySite = new Map((r.complaints?.bySite ?? []).map((x) => [x.siteCode, x]));

  return {
    portfolioLabel: r.portfolioLabel || "JouleCool Portfolio",
    stats: [
      { value: resolved.text, label: "Complaints resolved same day", tone: rateTone(resolved.value) },
      { value: pm.text, label: "PM completed", tone: rateTone(pm.value) },
      { value: logs.text, label: "Logs completed", tone: rateTone(logs.value) },
      { value: String(incidents), label: "Incidents logged", tone: incidents > 0 ? "bad" : "ok" },
    ],
    sites: (r.sites ?? []).map((site) => {
      const row = bySite.get(site.siteCode);
      const open = n(row?.stillOpen);
      return {
        siteCode: site.siteCode,
        name: site.name || site.shortName || site.siteCode,
        meta: `${n(row?.raised)} raised · ${open} open`,
        tone: open > 0 ? "warn" : "ok",
      };
    }),
  };
}

// The parts of the backend's MonthlyReport this screen reads
// (backend/services/utility/src/services/monthlyReportService.ts).
interface MonthlyReportSlice {
  portfolioLabel?: string;
  sites?: { siteCode: string; name: string; shortName: string }[];
  sla?: { sites?: { siteCode: string; achievedScore: number }[] };
  tickets?: {
    bySite?: { siteCode: string; total?: number; respondedInSla?: number; respondedDenom?: number }[];
  };
  siteLogs?: { types?: { bySite?: Record<string, { done?: number; plan?: number }> }[] };
  incidents?: { status?: string | null }[];
}

function summariseMonthly(r: MonthlyReportSlice): DocSummary {
  const tickets = r.tickets?.bySite ?? [];
  const responded = pct(
    tickets.reduce((a, x) => a + n(x.respondedInSla), 0),
    tickets.reduce((a, x) => a + n(x.respondedDenom), 0),
  );
  const slaSites = (r.sla?.sites ?? []).filter((x) => Number.isFinite(Number(x.achievedScore)));
  const avgSla = slaSites.length
    ? slaSites.reduce((a, x) => a + Number(x.achievedScore), 0) / slaSites.length
    : null;
  let done = 0;
  let plan = 0;
  for (const type of r.siteLogs?.types ?? []) {
    for (const cell of Object.values(type.bySite ?? {})) {
      done += n(cell?.done);
      plan += n(cell?.plan);
    }
  }
  const logs = pct(done, plan);
  // IncidentStatus is Open | Inprogress | Resolved | RCA Submitted.
  const openIncidents = (r.incidents ?? []).filter((i) => {
    const st = s(i.status).toLowerCase().replace(/[^a-z]/g, "");
    return st === "open" || st === "inprogress";
  }).length;
  const slaBySite = new Map(slaSites.map((x) => [x.siteCode, Number(x.achievedScore)]));
  const ticketsBySite = new Map(tickets.map((x) => [x.siteCode, n(x.total)]));

  return {
    portfolioLabel: r.portfolioLabel || "JouleCool Portfolio",
    stats: [
      { value: responded.text, label: "Tickets responded in SLA", tone: rateTone(responded.value) },
      {
        value: avgSla == null ? "—" : avgSla.toFixed(2),
        label: "Avg SLA score",
        tone: avgSla == null ? "mute" : scoreTone(avgSla),
      },
      { value: logs.text, label: "Logs completed", tone: rateTone(logs.value) },
      { value: String(openIncidents), label: "Open incidents", tone: openIncidents > 0 ? "bad" : "ok" },
    ],
    sites: (r.sites ?? []).map((site) => {
      const score = slaBySite.get(site.siteCode);
      const count = ticketsBySite.get(site.siteCode) ?? 0;
      return {
        siteCode: site.siteCode,
        name: site.name || site.shortName || site.siteCode,
        meta: score != null ? score.toFixed(2) : `${count} ticket${count === 1 ? "" : "s"}`,
        tone: score != null ? scoreTone(score) : "mute",
      };
    }),
  };
}
