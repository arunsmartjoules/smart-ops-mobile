/**
 * SiteResolver — Consolidated site resolution singleton.
 *
 * Replaces the fragmented logic spread across `useSites`, `siteCache`,
 * and the sites logic in `attendanceCache`.
 *
 * Resolution priority (first non-empty result wins):
 *  1. SQLite `user_sites` WHERE `user_id = ?`
 *  2. AsyncStorage `@user_sites_cache_{userId}`
 *  3. Infer distinct `site_code` values from `tickets`, `pm_instances`, `site_logs`
 *  4. API `/api/site-users/user/{userId}`
 *
 * API errors during `refresh()` are logged but do not throw.
 * If all four steps fail, `getSites()` returns [].
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { eq } from "drizzle-orm";
import { db, userSites, tickets, pmInstances, siteLogs } from "@/database";
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

export interface SiteResolver {
  getSites(): Site[];
  subscribe(listener: (sites: Site[]) => void): () => void;
  refresh(userId: string): Promise<void>;
  initialize(userId: string): Promise<void>;
}

// ─── AsyncStorage key ─────────────────────────────────────────────────────────

const SITE_CACHE_KEY = "@user_sites_cache_";
const normalizeIdentityKey = (value: string) => value.trim().toLowerCase();

// ─── Shared apiFetch helper ───────────────────────────────────────────────────

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  return centralApiFetch(`${API_BASE_URL}${endpoint}`, options);
}

// ─── SiteResolver implementation ─────────────────────────────────────────────

class SiteResolverImpl implements SiteResolver {
  private _sites: Site[] = [];
  private _listeners: Set<(sites: Site[]) => void> = new Set();

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

  // ── getSites ──────────────────────────────────────────────────────────────

  getSites(): Site[] {
    return this._sites;
  }

  // ── subscribe ─────────────────────────────────────────────────────────────

  subscribe(listener: (sites: Site[]) => void): () => void {
    this._listeners.add(listener);
    // Call immediately with current sites
    listener(this._sites);
    return () => {
      this._listeners.delete(listener);
    };
  }

  // ── initialize ────────────────────────────────────────────────────────────

  async initialize(userId: string): Promise<void> {
    const identityKey = normalizeIdentityKey(userId);
    const start = Date.now();
    logger.info("SiteResolver initialize", {
      module: "SITE_RESOLVER",
      identityKey,
      isEmailKey: identityKey.includes("@"),
    });

    // Step 1: SQLite user_sites WHERE user_id = ?
    try {
      const rows = await db
        .select()
        .from(userSites)
        .where(eq(userSites.user_id, identityKey));

      if (rows.length > 0) {
        const sites = this._dedupeSitesByCode(rows.map((r) => ({
          id: r.id,
          user_id: identityKey,
          site_id: r.site_id ?? null,
          site_code: r.site_code,
          site_name: r.site_name,
          name: r.site_name,
        })));
        logger.debug("SiteResolver: resolved from SQLite user_sites", {
          module: "SITE_RESOLVER",
          userId: identityKey,
          count: sites.length,
          source: "sqlite_user_sites",
        });
        this._emit(sites, start);
        return;
      }
    } catch (error) {
      logger.error("SiteResolver: SQLite user_sites query failed", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        error,
        source: "sqlite_user_sites",
      });
    }

    // Step 2: AsyncStorage @user_sites_cache_{userId}
    try {
      const raw = await AsyncStorage.getItem(`${SITE_CACHE_KEY}${identityKey}`);
      if (raw) {
        const cached = JSON.parse(raw) as Array<Record<string, any>>;
        if (Array.isArray(cached) && cached.length > 0) {
          const sites = this._dedupeSitesByCode(cached.map((r) => ({
            id: r.id ?? `${identityKey}_${r.site_code}`,
            user_id: r.user_id ?? identityKey,
            site_id: r.site_id ?? null,
            site_code: r.site_code,
            site_name: r.site_name ?? r.name ?? r.site_code,
            name: r.site_name ?? r.name ?? r.site_code,
          })));
          logger.debug("SiteResolver: resolved from AsyncStorage cache", {
            module: "SITE_RESOLVER",
            userId: identityKey,
            count: sites.length,
            source: "async_storage",
          });
          this._emit(sites, start);
          return;
        }
      }
    } catch (error) {
      logger.error("SiteResolver: AsyncStorage read failed", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        error,
        source: "async_storage",
      });
    }

    // Step 3: Infer distinct site_code values from local data tables.
    // Keep this as a fallback only; do not return yet because API/user mapping
    // is authoritative and may be narrower than local historical data.
    let inferredSites: Site[] = [];
    try {
      const [ticketRows, pmRows, logRows] = await Promise.all([
        db.select({ site_code: tickets.site_code }).from(tickets),
        db.select({ site_code: pmInstances.site_code }).from(pmInstances),
        db.select({ site_code: siteLogs.site_code }).from(siteLogs),
      ]);

      const allCodes = new Set<string>([
        ...ticketRows.map((r) => r.site_code),
        ...pmRows.map((r) => r.site_code),
        ...logRows.map((r) => r.site_code),
      ]);

      if (allCodes.size > 0) {
        inferredSites = Array.from(allCodes).map((code) => ({
          id: `${identityKey}_${code}`,
          user_id: identityKey,
          site_id: null,
          site_code: code,
          site_name: code,
          name: code,
        }));
        logger.debug("SiteResolver: resolved by inference from data tables", {
          module: "SITE_RESOLVER",
          userId: identityKey,
          count: inferredSites.length,
          source: "inference",
        });
      }
    } catch (error) {
      logger.error("SiteResolver: inference from data tables failed", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        error,
        source: "inference",
      });
    }

    // Step 4: API fetch /api/site-users/user/{userId}
    try {
      const response = await apiFetch(`/api/site-users/user/${encodeURIComponent(identityKey)}`);
      if (response.ok) {
        const result = await response.json();
        const data: any[] = result.data || [];
        if (data.length > 0) {
          const sites = this._dedupeSitesByCode(data.map((r) => ({
            id: r.id ?? `${identityKey}_${r.site_code}`,
            user_id: identityKey,
            site_id: r.site_id ?? null,
            site_code: r.site_code,
            site_name: r.site_name ?? r.name ?? r.site_code,
            name: r.site_name ?? r.name ?? r.site_code,
          })));
          logger.debug("SiteResolver: resolved from API", {
            module: "SITE_RESOLVER",
            userId: identityKey,
            count: sites.length,
            source: "api",
          });
          // Persist to both caches for future offline use
          await this._persistToCaches(identityKey, sites);
          this._emit(sites, start);
          return;
        }
      } else {
        logger.warn("SiteResolver: API returned non-ok status", {
          module: "SITE_RESOLVER",
          userId: identityKey,
          status: response.status,
          source: "api",
        });
      }
    } catch (error) {
      logger.error("SiteResolver: API fetch failed", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        error,
        source: "api",
      });
    }

    if (inferredSites.length > 0) {
      logger.warn("SiteResolver: falling back to inferred sites (API unavailable)", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        count: inferredSites.length,
      });
      this._emit(this._dedupeSitesByCode(inferredSites), start);
      return;
    }

    // All steps failed — emit empty list
    logger.warn("SiteResolver: all resolution steps failed, returning []", {
      module: "SITE_RESOLVER",
      userId: identityKey,
    });
    this._emit([], start);
  }

  // ── refresh ───────────────────────────────────────────────────────────────

  async refresh(userId: string): Promise<void> {
    const identityKey = normalizeIdentityKey(userId);
    try {
      const response = await apiFetch(`/api/site-users/user/${encodeURIComponent(identityKey)}`);
      if (!response.ok) {
        logger.warn("SiteResolver.refresh: API returned non-ok status", {
          module: "SITE_RESOLVER",
          userId: identityKey,
          status: response.status,
          source: "api_refresh",
        });
        return;
      }

      const result = await response.json();
      const data: any[] = result.data || [];
      const sites = this._dedupeSitesByCode(data.map((r) => ({
        id: r.id ?? `${identityKey}_${r.site_code}`,
        user_id: identityKey,
        site_id: r.site_id ?? null,
        site_code: r.site_code,
        site_name: r.site_name ?? r.name ?? r.site_code,
        name: r.site_name ?? r.name ?? r.site_code,
      })));

      // Persist to both SQLite and AsyncStorage
      await this._persistToCaches(identityKey, sites);

      logger.debug("SiteResolver.refresh: persisted and emitting", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        count: sites.length,
      });

      this._emit(sites, Date.now());
    } catch (error) {
      // Log but do not throw — existing cached sites remain active
      logger.error("SiteResolver.refresh: API error (non-fatal)", {
        module: "SITE_RESOLVER",
        userId: identityKey,
        error,
      });
    }
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private _emit(sites: Site[], startMs: number): void {
    this._sites = sites;
    const elapsed = Date.now() - startMs;
    if (elapsed > 500) {
      logger.warn("SiteResolver: emission exceeded 500ms budget", {
        module: "SITE_RESOLVER",
        elapsedMs: elapsed,
      });
    }
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
  }

  private async _persistToCaches(userId: string, sites: Site[]): Promise<void> {
    // Persist to SQLite user_sites
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

    // Persist to AsyncStorage
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
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const siteResolver = new SiteResolverImpl();
export default siteResolver;
