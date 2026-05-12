/**
 * SiteResolver — Consolidated site resolution singleton.
 *
 * Site access is governed by the backend `site_user` table. The mobile app must
 * never display sites — or any site-scoped data — that the user is not assigned
 * to in that table.
 *
 * Resolution policy:
 *  - Online  → API `/api/site-users/user/{userId}` is authoritative. Result is
 *              persisted to SQLite + AsyncStorage and any locally-cached data
 *              for unauthorized site_codes is purged.
 *  - Offline → fall back to SQLite `user_sites`, then AsyncStorage cache.
 *
 * The previous "infer sites from cached tickets/PMs/logs" fallback was removed:
 * it bypassed access control by treating leaked local data as authoritative.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  db,
  userSites,
  tickets,
  pmInstances,
  siteLogs,
  incidents,
  chillerReadings,
  areas,
  attendanceLogs,
} from "@/database";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import logger from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Site {
  id: string;
  user_id: string;
  site_id: string | null;
  site_code: string;
  site_name: string;
  name: string; // Compatibility alias
}

export type ResolutionSource =
  | "api"
  | "sqlite"
  | "async_storage"
  | "none";

export interface ResolutionState {
  /** True once `initialize()` has emitted at least one resolution result. */
  initialized: boolean;
  /** Authorized sites for the current user. Empty array = no access. */
  sites: Site[];
  /** Where the result came from (or `none` when no source produced data). */
  source: ResolutionSource | null;
  /** True if the latest resolution was confirmed online via the API. */
  authoritative: boolean;
  /** Last network state observed at resolution time. */
  online: boolean;
  /** Set when an offline-only resolution was used due to API failure. */
  staleReason: "offline" | "api_unavailable" | null;
}

export interface SiteResolver {
  getSites(): Site[];
  getState(): ResolutionState;
  subscribe(listener: (sites: Site[]) => void): () => void;
  subscribeState(listener: (state: ResolutionState) => void): () => void;
  refresh(userId: string): Promise<void>;
  initialize(userId: string): Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_CACHE_KEY = "@user_sites_cache_";
const normalizeIdentityKey = (value: string) => value.trim().toLowerCase();

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  return centralApiFetch(`${API_BASE_URL}${endpoint}`, options);
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected !== true) return false;
    // isInternetReachable is null on first boot; treat null as online so we
    // attempt the API rather than blindly trusting cache.
    return state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

// ─── SiteResolver implementation ─────────────────────────────────────────────

class SiteResolverImpl implements SiteResolver {
  private _sites: Site[] = [];
  private _listeners: Set<(sites: Site[]) => void> = new Set();
  private _stateListeners: Set<(state: ResolutionState) => void> = new Set();
  private _state: ResolutionState = {
    initialized: false,
    sites: [],
    source: null,
    authoritative: false,
    online: false,
    staleReason: null,
  };
  private _inflight: Map<string, Promise<void>> = new Map();

  private _dedupeSitesByCode(sites: Site[]): Site[] {
    const seen = new Set<string>();
    const deduped: Site[] = [];
    for (const site of sites) {
      const key = String(site.site_code || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(site);
    }
    return deduped;
  }

  // ── public accessors ─────────────────────────────────────────────────────

  getSites(): Site[] {
    return this._sites;
  }

  getState(): ResolutionState {
    return { ...this._state, sites: [...this._state.sites] };
  }

  subscribe(listener: (sites: Site[]) => void): () => void {
    this._listeners.add(listener);
    listener(this._sites);
    return () => {
      this._listeners.delete(listener);
    };
  }

  subscribeState(listener: (state: ResolutionState) => void): () => void {
    this._stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this._stateListeners.delete(listener);
    };
  }

  // ── initialize ────────────────────────────────────────────────────────────

  async initialize(userId: string): Promise<void> {
    const identityKey = normalizeIdentityKey(userId);
    if (!identityKey) return;

    // Coalesce concurrent calls per user
    const existing = this._inflight.get(identityKey);
    if (existing) return existing;

    const work = this._runInitialize(identityKey).finally(() => {
      this._inflight.delete(identityKey);
    });
    this._inflight.set(identityKey, work);
    return work;
  }

  private async _runInitialize(identityKey: string): Promise<void> {
    const start = Date.now();
    const online = await isOnline();

    logger.info("SiteResolver initialize", {
      module: "SITE_RESOLVER",
      identityKey,
      online,
    });

    // ── 1. Online: API is authoritative ──────────────────────────────────
    if (online) {
      const apiResult = await this._fetchFromApi(identityKey);
      if (apiResult.ok) {
        await this._persistToCaches(identityKey, apiResult.sites);
        await this._purgeUnauthorizedSiteData(apiResult.sites);
        this._emit(apiResult.sites, start, {
          source: "api",
          authoritative: true,
          online: true,
          staleReason: null,
        });
        return;
      }
      // API failed — fall through to cache, but flag as stale
      logger.warn(
        "SiteResolver: API unreachable while online, falling back to cache",
        { module: "SITE_RESOLVER", identityKey, error: apiResult.error },
      );
    }

    const staleReason: "offline" | "api_unavailable" = online
      ? "api_unavailable"
      : "offline";

    // ── 2. SQLite cache ───────────────────────────────────────────────────
    const fromSqlite = await this._readSqliteCache(identityKey);
    if (fromSqlite.length > 0) {
      this._emit(fromSqlite, start, {
        source: "sqlite",
        authoritative: false,
        online,
        staleReason,
      });
      return;
    }

    // ── 3. AsyncStorage cache ─────────────────────────────────────────────
    const fromStorage = await this._readAsyncStorageCache(identityKey);
    if (fromStorage.length > 0) {
      // Hydrate SQLite for next time
      await this._persistToCaches(identityKey, fromStorage).catch(() => {});
      this._emit(fromStorage, start, {
        source: "async_storage",
        authoritative: false,
        online,
        staleReason,
      });
      return;
    }

    // ── 4. Nothing available ──────────────────────────────────────────────
    logger.warn("SiteResolver: no sites resolved (API + cache empty)", {
      module: "SITE_RESOLVER",
      identityKey,
      online,
    });
    this._emit([], start, {
      source: "none",
      authoritative: online, // if online and API said empty, that IS authoritative
      online,
      staleReason: online ? null : "offline",
    });
  }

  // ── refresh ───────────────────────────────────────────────────────────────

  async refresh(userId: string): Promise<void> {
    const identityKey = normalizeIdentityKey(userId);
    if (!identityKey) return;

    const online = await isOnline();
    if (!online) {
      logger.debug("SiteResolver.refresh: skipped — offline", {
        module: "SITE_RESOLVER",
        identityKey,
      });
      return;
    }

    const apiResult = await this._fetchFromApi(identityKey);
    if (!apiResult.ok) {
      logger.warn("SiteResolver.refresh: API call failed", {
        module: "SITE_RESOLVER",
        identityKey,
        error: apiResult.error,
      });
      return;
    }

    await this._persistToCaches(identityKey, apiResult.sites);
    await this._purgeUnauthorizedSiteData(apiResult.sites);
    this._emit(apiResult.sites, Date.now(), {
      source: "api",
      authoritative: true,
      online: true,
      staleReason: null,
    });
  }

  // ── private: API ──────────────────────────────────────────────────────────

  private async _fetchFromApi(
    identityKey: string,
  ): Promise<
    | { ok: true; sites: Site[] }
    | { ok: false; error: string }
  > {
    try {
      const response = await apiFetch(
        `/api/site-users/user/${encodeURIComponent(identityKey)}`,
      );
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }
      const result = await response.json();
      const data: any[] = Array.isArray(result?.data) ? result.data : [];
      const sites = this._dedupeSitesByCode(
        data.map((r) => ({
          id: r.id ?? `${identityKey}_${r.site_code}`,
          user_id: identityKey,
          site_id: r.site_id ?? null,
          site_code: r.site_code,
          site_name: r.site_name ?? r.name ?? r.site_code,
          name: r.site_name ?? r.name ?? r.site_code,
        })),
      );
      return { ok: true, sites };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  // ── private: SQLite cache read ───────────────────────────────────────────

  private async _readSqliteCache(identityKey: string): Promise<Site[]> {
    try {
      const rows = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, identityKey));
      if (rows.length === 0) return [];
      return this._dedupeSitesByCode(
        rows.map((r) => ({
          id: r.id,
          user_id: identityKey,
          site_id: r.site_id ?? null,
          site_code: r.site_code,
          site_name: r.site_name,
          name: r.site_name,
        })),
      );
    } catch (error) {
      logger.error("SiteResolver: SQLite read failed", {
        module: "SITE_RESOLVER",
        identityKey,
        error,
      });
      return [];
    }
  }

  // ── private: AsyncStorage cache read ─────────────────────────────────────

  private async _readAsyncStorageCache(identityKey: string): Promise<Site[]> {
    try {
      const raw = await AsyncStorage.getItem(`${SITE_CACHE_KEY}${identityKey}`);
      if (!raw) return [];
      const cached = JSON.parse(raw) as Array<Record<string, any>>;
      if (!Array.isArray(cached) || cached.length === 0) return [];
      return this._dedupeSitesByCode(
        cached.map((r) => ({
          id: r.id ?? `${identityKey}_${r.site_code}`,
          user_id: r.user_id ?? identityKey,
          site_id: r.site_id ?? null,
          site_code: r.site_code,
          site_name: r.site_name ?? r.name ?? r.site_code,
          name: r.site_name ?? r.name ?? r.site_code,
        })),
      );
    } catch (error) {
      logger.error("SiteResolver: AsyncStorage read failed", {
        module: "SITE_RESOLVER",
        identityKey,
        error,
      });
      return [];
    }
  }

  // ── private: persist & emit ──────────────────────────────────────────────

  private _emit(
    sites: Site[],
    startMs: number,
    meta: {
      source: ResolutionSource;
      authoritative: boolean;
      online: boolean;
      staleReason: "offline" | "api_unavailable" | null;
    },
  ): void {
    this._sites = sites;
    this._state = {
      initialized: true,
      sites,
      source: meta.source,
      authoritative: meta.authoritative,
      online: meta.online,
      staleReason: meta.staleReason,
    };

    const elapsed = Date.now() - startMs;
    if (elapsed > 500) {
      logger.warn("SiteResolver: emission exceeded 500ms budget", {
        module: "SITE_RESOLVER",
        elapsedMs: elapsed,
      });
    }

    logger.debug("SiteResolver emit", {
      module: "SITE_RESOLVER",
      count: sites.length,
      source: meta.source,
      authoritative: meta.authoritative,
      online: meta.online,
      staleReason: meta.staleReason,
    });

    for (const listener of this._listeners) {
      try {
        listener(sites);
      } catch (err) {
        logger.error("SiteResolver: listener threw", {
          module: "SITE_RESOLVER",
          error: err,
        });
      }
    }
    const stateSnapshot = this.getState();
    for (const listener of this._stateListeners) {
      try {
        listener(stateSnapshot);
      } catch (err) {
        logger.error("SiteResolver: state listener threw", {
          module: "SITE_RESOLVER",
          error: err,
        });
      }
    }
  }

  private async _persistToCaches(userId: string, sites: Site[]): Promise<void> {
    // SQLite: replace user's mapping with the authoritative set
    try {
      await db.delete(userSites).where(eq(userSites.user_id, userId));
      for (const site of sites) {
        await db
          .insert(userSites)
          .values({
            id: site.id,
            user_id: site.user_id,
            site_id: site.site_id,
            site_code: site.site_code,
            site_name: site.site_name,
          })
          .onConflictDoUpdate({
            target: userSites.id,
            set: {
              user_id: site.user_id,
              site_id: site.site_id,
              site_code: site.site_code,
              site_name: site.site_name,
            },
          });
      }
    } catch (error) {
      logger.error("SiteResolver: SQLite persist failed", {
        module: "SITE_RESOLVER",
        userId,
        error,
      });
    }

    try {
      await AsyncStorage.setItem(
        `${SITE_CACHE_KEY}${userId}`,
        JSON.stringify(sites),
      );
    } catch (error) {
      logger.error("SiteResolver: AsyncStorage persist failed", {
        module: "SITE_RESOLVER",
        userId,
        error,
      });
    }
  }

  /**
   * Delete locally-cached site-scoped rows for any site_code the user is no
   * longer authorized for. Only invoked after an authoritative API result.
   */
  private async _purgeUnauthorizedSiteData(authorized: Site[]): Promise<void> {
    const allowedCodes = authorized
      .map((s) => s.site_code)
      .filter((c): c is string => typeof c === "string" && c.length > 0);

    try {
      if (allowedCodes.length === 0) {
        // User has no sites — wipe all site-scoped caches.
        await db.delete(tickets);
        await db.delete(incidents);
        await db.delete(siteLogs);
        await db.delete(chillerReadings);
        await db.delete(pmInstances);
        await db.delete(areas);
        await db.delete(attendanceLogs);
      } else {
        await db.delete(tickets).where(notInArray(tickets.site_code, allowedCodes));
        await db.delete(incidents).where(notInArray(incidents.site_code, allowedCodes));
        await db.delete(siteLogs).where(notInArray(siteLogs.site_code, allowedCodes));
        await db
          .delete(chillerReadings)
          .where(notInArray(chillerReadings.site_code, allowedCodes));
        await db.delete(pmInstances).where(notInArray(pmInstances.site_code, allowedCodes));
        await db.delete(areas).where(notInArray(areas.site_code, allowedCodes));
        await db
          .delete(attendanceLogs)
          .where(notInArray(attendanceLogs.site_code, allowedCodes));
      }
    } catch (error) {
      logger.error("SiteResolver: purge unauthorized site data failed", {
        module: "SITE_RESOLVER",
        allowedCodes,
        error,
      });
    }
  }
}

// Silence unused-import warnings — these helpers are reserved for future use.
void inArray;
void sql;

// ─── Singleton export ─────────────────────────────────────────────────────────

export const siteResolver = new SiteResolverImpl();
export default siteResolver;
