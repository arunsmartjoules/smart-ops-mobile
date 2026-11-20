/**
 * Consumption Trend Sheet on the phone: daily readings for JoulePays sites,
 * entered with or without a network.
 *
 * Two local tables (database/schema):
 *   trend_day_context  the server's day (GET /api/trend-sheet/entry/:site/days/:date)
 *   trend_entries      what this phone saved, one row per site, date and category
 *
 * A save never waits for the network. It is written to `trend_entries` as
 * `pending`, queued as a `trend_category_save` item, and shown at once with
 * figures worked out by utils/trendCalc (the server's own arithmetic). The
 * sync engine sends the queue; `replaySave` below takes the server's answer:
 * the day context it returns replaces the cached one and the entry becomes
 * `synced`, `replaced` (the server already held a newer save) or `failed`
 * (the server refused it, with its reason).
 *
 * The server is the only source of stored figures: nothing here is ever sent
 * as a figure, only readings.
 *
 * Does not import the sync engine (the engine imports this file). Screens
 * call `syncEngine.flushQueue()` themselves after a save.
 */
import { and, eq, gt, inArray, lt, lte, or } from "drizzle-orm";
import { db, ensureDatabaseConnection, trendDayContext, trendEntries } from "@/database";
import cacheManager from "./CacheManager";
import { getSelectedSiteCode } from "./SiteSelection";
import siteResolver from "./SiteResolver";
import { refreshTrendSites, trendSiteCodes } from "./TrendSheetSites";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import logger from "@/utils/logger";
import { istTodayString } from "@/utils/istDate";
import { CALC_VERSION, type TrendCategory } from "@/utils/trendCalc";
import {
  addDaysYmd,
  carryFromPhone,
  mergeDay,
  trendEntryId,
  type TrendDayContext,
  type TrendDayList,
  type TrendDayView,
  type TrendLocalEntry,
  type TrendSaveBody,
  type TrendSyncStatus,
} from "@/utils/trendSheet";

const MODULE = "TREND_SHEET";

/** Cached days older than this are dropped by the pull. */
const CONTEXT_KEEP_DAYS = 40;
/** How long an answered entry (`synced` or `replaced`) stays on the phone. */
const ANSWERED_ENTRY_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

/** The fields a screen fills in; the service adds the save time and the calc version. */
export type TrendSaveFields = Omit<TrendSaveBody, "client_saved_at" | "calc_version">;

export interface TrendQueuePayload {
  entry_id: string;
  site_code: string;
  entry_date: string;
  category: TrendCategory;
  body: TrendSaveBody;
}

export type TrendLoaded<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number | null };

// --- Change notices ----------------------------------------------------------------------

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener must never break a save or a sync.
    }
  });
}

/** Called whenever a cached day or a local entry changes (a save, a sync answer, a pull). */
export function subscribeTrendSheet(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// --- The update block (AC-49) --------------------------------------------------------------

let serverNeedsNewerApp = false;

/**
 * True once the server has refused a save from this build as outdated. The
 * entry screens also compare each cached day's `calc_version` with this
 * build's, so the block shows before a save is ever refused.
 */
export function isTrendCalcOutdated(day?: Pick<TrendDayContext, "calc_version"> | null): boolean {
  return serverNeedsNewerApp || (!!day && day.calc_version > CALC_VERSION);
}

// --- Local tables ----------------------------------------------------------------------------

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readContext(siteCode: string, date: string): Promise<TrendDayContext | null> {
  ensureDatabaseConnection();
  const rows = await db
    .select()
    .from(trendDayContext)
    .where(and(eq(trendDayContext.site_code, siteCode), eq(trendDayContext.entry_date, date)))
    .limit(1);
  return parseJson<TrendDayContext>(rows[0]?.payload);
}

/**
 * Cache a day. `askedAt` is when a plain fetch sent its request: such an answer
 * is stored only when nothing newer is cached, because a save's answer that
 * arrived after the fetch was sent may already hold the save the fetch's server
 * read missed. A save's answer (no `askedAt`) is read after the save committed,
 * so it always wins, stamped with its arrival time.
 */
async function writeContext(day: TrendDayContext, askedAt?: number): Promise<void> {
  ensureDatabaseConnection();
  const row = {
    site_code: day.site_code,
    entry_date: day.date,
    payload: JSON.stringify(day),
    fetched_at: askedAt ?? Date.now(),
  };
  await db
    .insert(trendDayContext)
    .values(row)
    .onConflictDoUpdate({
      target: [trendDayContext.site_code, trendDayContext.entry_date],
      set: { payload: row.payload, fetched_at: row.fetched_at },
      // A stamp in the future came from a clock that has since been set back;
      // it must not block every later fetch of this day.
      ...(askedAt === undefined
        ? {}
        : { setWhere: or(lte(trendDayContext.fetched_at, askedAt), gt(trendDayContext.fetched_at, Date.now())) }),
    });
}

type EntryRow = typeof trendEntries.$inferSelect;

function toEntry(row: EntryRow): TrendLocalEntry | null {
  const body = parseJson<TrendSaveBody>(row.payload);
  if (!body) return null;
  return {
    site_code: row.site_code,
    entry_date: row.entry_date,
    category: row.category as TrendCategory,
    body,
    client_saved_at: row.client_saved_at,
    sync_status: row.sync_status as TrendSyncStatus,
    last_error: row.last_error,
  };
}

/** Every entry this phone holds for a site, whatever its state. */
async function readEntries(siteCode: string): Promise<TrendLocalEntry[]> {
  ensureDatabaseConnection();
  const rows = await db.select().from(trendEntries).where(eq(trendEntries.site_code, siteCode));
  return rows.map(toEntry).filter((e): e is TrendLocalEntry => e !== null);
}

async function setEntryState(id: string, status: TrendSyncStatus, lastError: string | null): Promise<void> {
  await db
    .update(trendEntries)
    .set({ sync_status: status, last_error: lastError, updated_at: Date.now() })
    .where(eq(trendEntries.id, id));
}

// --- Reading a day ---------------------------------------------------------------------------

const dayUrl = (siteCode: string, date: string) =>
  `${API_BASE_URL}/api/trend-sheet/entry/${encodeURIComponent(siteCode)}/days/${date}`;

/** The cached day with this phone's entries laid over it, or null when the day was never loaded. */
async function viewFromCache(siteCode: string, date: string): Promise<TrendDayView | null> {
  const [context, entries] = await Promise.all([readContext(siteCode, date), readEntries(siteCode)]);
  if (!context) return null;
  return mergeDay(carryFromPhone(context, entries), entries);
}

/**
 * Ask the server for a day and cache it. `status` is null when the network
 * failed, so a caller can tell "offline" from a real refusal. The day returned
 * is the cached one, which is the newer copy when a save's answer landed while
 * this request was out.
 */
async function fetchDay(siteCode: string, date: string): Promise<TrendLoaded<TrendDayContext>> {
  try {
    const askedAt = Date.now();
    const res = await apiFetch(dayUrl(siteCode, date));
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && body.data) {
      const day = body.data as TrendDayContext;
      await writeContext(day, askedAt);
      return { ok: true, data: (await readContext(siteCode, date)) ?? day };
    }
    return { ok: false, error: body?.error || `HTTP ${res.status}`, status: res.status };
  } catch (error) {
    logger.warn("TrendSheetService: day fetch failed", { module: MODULE, siteCode, date, error });
    return { ok: false, error: "No connection", status: null };
  }
}

// --- Saving ----------------------------------------------------------------------------------

/**
 * Save one category on the phone and queue it for the server. Saving the same
 * category again replaces the earlier entry, and the earlier queue item with
 * it, so only the latest save is ever sent.
 */
async function saveCategory(
  siteCode: string,
  date: string,
  category: TrendCategory,
  fields: TrendSaveFields,
): Promise<TrendLocalEntry> {
  ensureDatabaseConnection();
  const id = trendEntryId(siteCode, date, category);
  const body: TrendSaveBody = {
    ...fields,
    client_saved_at: new Date().toISOString(),
    calc_version: CALC_VERSION,
  };

  const queued = await cacheManager.getPendingQueueItemsByType("trend_category_save");
  for (const item of queued) {
    if (item.payload?.entry_id === id) await cacheManager.dequeue(item.id);
  }

  const row = {
    id,
    site_code: siteCode,
    entry_date: date,
    category,
    payload: JSON.stringify(body),
    client_saved_at: body.client_saved_at,
    sync_status: "pending" as const,
    last_error: null,
    updated_at: Date.now(),
  };
  await db.insert(trendEntries).values(row).onConflictDoUpdate({ target: trendEntries.id, set: row });

  const payload: TrendQueuePayload = { entry_id: id, site_code: siteCode, entry_date: date, category, body };
  const queueId = await cacheManager.enqueue({
    entity_type: "trend_category_save",
    operation: "update",
    payload,
  });
  if (!queueId) {
    // Without a queue item the entry would look saved and never reach the server.
    await db.delete(trendEntries).where(eq(trendEntries.id, id));
    throw new Error("This entry could not be stored on the phone. Try again.");
  }

  notify();
  return {
    site_code: siteCode,
    entry_date: date,
    category,
    body,
    client_saved_at: body.client_saved_at,
    sync_status: "pending",
    last_error: null,
  };
}

/** An error the queue classifies by `statusCode` (4xx counts towards giving up, 5xx is transient). */
function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/**
 * Statuses that say nothing about the readings themselves, so the entry stays
 * `pending`. Thrown without a status code: the queue counts any 4xx towards
 * dead lettering, and these would otherwise burn its five retries and strand
 * the entry as "Not sent yet" with nothing left to send it.
 */
const NOT_A_REFUSAL = new Set([401, 408, 426, 429]);

/**
 * Send one queued save (the sync engine's `trend_category_save` branch).
 *
 * Resolves when the server has answered for good: stored (`synced`), already
 * newer (`replaced`) or refused (`failed`, with its reason). A refusal resolves
 * too, so the queue drops an item the server will never take; the entry keeps
 * the readings and the reason, and saving again queues it afresh.
 *
 * Throws when the readings were not judged at all: a server error (with its
 * 5xx status, so a payload the server keeps failing on is given up after the
 * queue's high cap, see `giveUpSave`), or a status in `NOT_A_REFUSAL`, an
 * outdated app or no network (no status code, so no retry is burnt).
 */
async function replaySave(payload: TrendQueuePayload): Promise<void> {
  const { entry_id: id, site_code: siteCode, entry_date: date, category, body } = payload;
  const res = await apiFetch(`${dayUrl(siteCode, date)}/categories/${category}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);

  // The entry may have been saved again while this request was in flight;
  // only the save this answer belongs to may change its state.
  const current = await db.select().from(trendEntries).where(eq(trendEntries.id, id)).limit(1);
  const mine = current[0]?.client_saved_at === body.client_saved_at;

  if (res.ok && json?.success && json.data?.day) {
    const day = json.data.day as TrendDayContext;
    await writeContext(day);
    if (mine) {
      if (json.data.applied === false) {
        const by = day.categories.find((c) => c.category === category)?.entered_by_name;
        await setEntryState(id, "replaced", `Replaced by a newer save by ${by || "someone else"}`);
      } else {
        await setEntryState(id, "synced", null);
      }
    }
    notify();
    return;
  }

  // A 2xx with no day in it is not a refusal of the readings: try again later.
  if (res.ok) throw httpError("Unexpected answer from the server", 502);

  const code: string | undefined = typeof json?.code === "string" ? json.code : undefined;
  const message: string = json?.error || `HTTP ${res.status}`;

  if (code === "CLIENT_OUTDATED") {
    // Not a refusal of the readings: the entry stays pending and is sent again
    // once the app is updated. No status code, so the queue burns no retries.
    serverNeedsNewerApp = true;
    notify();
    throw new Error("Update the app to enter readings");
  }

  if (res.status >= 500) throw httpError(message, res.status);
  if (NOT_A_REFUSAL.has(res.status)) throw new Error(message);

  if (code === "ENTRY_MODE_CHANGED" && json?.details?.day) {
    // The block changed shape while this save was queued: show it in its new form.
    await writeContext(json.details.day as TrendDayContext);
  }
  if (mine) {
    const reason =
      code === "ENTRY_MODE_CHANGED"
        ? /now takes units/i.test(message)
          ? "This block now takes units"
          : "This block now takes readings"
        : message;
    await setEntryState(id, "failed", reason);
  }
  notify();
  logger.warn("TrendSheetService: save refused", { module: MODULE, siteCode, date, category, status: res.status, code });
}

/** What a technician sees when the server kept failing on a save. */
export const TREND_SAVE_GIVEN_UP =
  "The server could not take this entry after many tries. Save it again to send it.";

/**
 * The sync engine dead lettered this save's queue item (the server kept
 * erroring on it). Without this the entry would stay "Not sent yet" with
 * nothing left to send it, and sign-out would wipe it. Marking it `failed`
 * shows the problem and lets a new save queue it again. A newer save of the
 * same category has its own queue item and is left alone.
 */
async function giveUpSave(payload: TrendQueuePayload): Promise<void> {
  ensureDatabaseConnection();
  const current = await db.select().from(trendEntries).where(eq(trendEntries.id, payload.entry_id)).limit(1);
  if (current[0]?.client_saved_at !== payload.body.client_saved_at) return;
  await setEntryState(payload.entry_id, "failed", TREND_SAVE_GIVEN_UP);
  notify();
}

/** Remove a `replaced` notice (or a `failed` entry the user chose to discard). */
async function discardEntry(siteCode: string, date: string, category: TrendCategory): Promise<void> {
  ensureDatabaseConnection();
  const id = trendEntryId(siteCode, date, category);
  const queued = await cacheManager.getPendingQueueItemsByType("trend_category_save");
  for (const item of queued) {
    if (item.payload?.entry_id === id) await cacheManager.dequeue(item.id);
  }
  await db.delete(trendEntries).where(eq(trendEntries.id, id));
  notify();
}

/** Drop the `replaced` notices of a day once the user has seen them. */
async function acknowledgeReplaced(siteCode: string, date: string): Promise<void> {
  ensureDatabaseConnection();
  await db
    .delete(trendEntries)
    .where(
      and(
        eq(trendEntries.site_code, siteCode),
        eq(trendEntries.entry_date, date),
        eq(trendEntries.sync_status, "replaced"),
      ),
    );
}

// --- Day list (week strip, month screen) ---------------------------------------------------

async function listDays(
  siteCode: string,
  range: { month: string } | { from: string; to: string },
): Promise<TrendLoaded<TrendDayList>> {
  const qs =
    "month" in range
      ? `month=${encodeURIComponent(range.month)}`
      : `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  try {
    const res = await apiFetch(
      `${API_BASE_URL}/api/trend-sheet/entry/${encodeURIComponent(siteCode)}/days?${qs}`,
    );
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && body.data) return { ok: true, data: body.data as TrendDayList };
    return { ok: false, error: body?.error || `HTTP ${res.status}`, status: res.status };
  } catch (error) {
    logger.warn("TrendSheetService: day list fetch failed", { module: MODULE, siteCode, error });
    return { ok: false, error: "No connection", status: null };
  }
}

/** This phone's unsent and refused entries for a site, for the week strip. */
async function unsentEntries(siteCode: string): Promise<TrendLocalEntry[]> {
  const entries = await readEntries(siteCode);
  return entries.filter((e) => e.sync_status === "pending" || e.sync_status === "failed");
}

// --- Pull (sync engine `trend_sheet` domain) -------------------------------------------------

async function prune(today: string): Promise<void> {
  await db.delete(trendDayContext).where(lt(trendDayContext.entry_date, addDaysYmd(today, -CONTEXT_KEEP_DAYS)));
  await db
    .delete(trendEntries)
    .where(
      and(
        inArray(trendEntries.sync_status, ["synced", "replaced"]),
        lt(trendEntries.updated_at, Date.now() - ANSWERED_ENTRY_KEEP_MS),
      ),
    );
}

/** Cache yesterday, today and tomorrow for one site. Returns how many days failed. */
async function loadAround(siteCode: string, today: string, checkCancelled: () => void): Promise<number> {
  let failed = 0;
  for (const date of [addDaysYmd(today, -1), today, addDaysYmd(today, 1)]) {
    checkCancelled();
    const result = await fetchDay(siteCode, date);
    if (!result.ok) failed += 1;
  }
  return failed;
}

/**
 * The selected site just changed to a trend sheet site: cache its days now,
 * so the tab works offline without waiting out the pull's 15 minute TTL. The
 * sync engine calls this; a failure is left to the next pull.
 */
async function prefetchSite(siteCode: string, checkCancelled: () => void): Promise<void> {
  const failed = await loadAround(siteCode, istTodayString(), checkCancelled);
  notify();
  if (failed > 0) {
    logger.warn("TrendSheetService: site prefetch partial", { module: MODULE, siteCode, failed });
  }
}

/**
 * Refresh the site list, then yesterday, today and tomorrow for the selected
 * site when it is a trend sheet site (tomorrow so its opening readings are on
 * the phone before the network goes). Throws when anything failed, so the
 * engine does not mark the domain fresh. `checkCancelled` throws when
 * sign-out has asked the running sync to stop.
 */
async function pull(userId: string, checkCancelled: () => void): Promise<void> {
  const before = trendSiteCodes().join("|");
  const { fresh: listFresh } = await refreshTrendSites(userId);
  const codes = trendSiteCodes();
  if (codes.join("|") !== before) notify();

  const today = istTodayString();
  // The site the Ops header shows: the stored choice when it is still an
  // authorized site, else the first authorized one (hooks/useSiteResolver).
  const authorized = siteResolver.getSites().map((s) => s.site_code);
  const stored = await getSelectedSiteCode(userId);
  const selected =
    stored && (authorized.length === 0 || authorized.includes(stored)) ? stored : (authorized[0] ?? null);
  const failed = selected && codes.includes(selected) ? await loadAround(selected, today, checkCancelled) : 0;

  try {
    await prune(today);
  } catch (error) {
    logger.warn("TrendSheetService: prune failed", { module: MODULE, error });
  }
  notify();
  // The tab depends on the site list: a list that could not be refreshed must be asked for again soon.
  if (!listFresh) throw new Error("trend sheet pull partial: the site list could not be refreshed");
  if (failed > 0) throw new Error(`trend sheet pull partial: ${failed} day(s) failed`);
}

const TrendSheetService = {
  viewFromCache,
  fetchDay,
  saveCategory,
  replaySave,
  giveUpSave,
  discardEntry,
  acknowledgeReplaced,
  listDays,
  unsentEntries,
  pull,
  prefetchSite,
};

export default TrendSheetService;
