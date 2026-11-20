/**
 * The JoulePays sites this user can enter trend sheet readings for
 * (GET /api/trend-sheet/entry/sites).
 *
 * The Ops "Trend Sheet" sub-tab shows only when the selected site is in this
 * list with at least one entry category, so the list has to be readable with
 * no network: it is cached in AsyncStorage under `trend-sites:v1:<userId>`
 * (the same pattern as the role permissions) and held in memory for the tab
 * bar, which cannot wait on storage while it renders.
 *
 * Kept free of the database and the sync engine on purpose: the navigation
 * map (components/jo/modules) reads it, and that file is imported everywhere.
 *
 * Sign-out clears AsyncStorage; the memory copy is tied to a user id, so the
 * next user on a shared phone never reads the previous user's list.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import logger from "@/utils/logger";
import type { TrendEntrySite } from "@/utils/trendSheet";

const CACHE_PREFIX = "trend-sites:v1:";

interface Snapshot {
  userId: string;
  sites: TrendEntrySite[];
  /** False until the cache (or the server) has answered for this user. */
  loaded: boolean;
}

let snapshot: Snapshot = { userId: "", sites: [], loaded: false };
const listeners = new Set<() => void>();

/**
 * Bumped by sign-out (`resetTrendSites`). A read or a request that started
 * before it must not publish or persist afterwards: its answer belongs to the
 * user who just left, and AsyncStorage has already been cleared (AC-46).
 */
let generation = 0;

/** The current sign-out generation, for work that outlives a single await. */
export function trendSitesGeneration(): number {
  return generation;
}

/**
 * Whether the signed-in role can view `trend_sheet_entry`, published by
 * PermissionsContext. `null` means "not known yet" (admins, no answer, a
 * headless background launch): the list is asked for and the server decides.
 * Known `false` skips the request, which would only answer 403.
 */
let entryViewable: boolean | null = null;

export function setTrendEntryViewable(next: boolean | null): void {
  entryViewable = next;
}

const normalize = (userId?: string | null) => (userId || "").trim();

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((fn) => fn());
}

function parseSites(raw: unknown): TrendEntrySite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is TrendEntrySite =>
      !!s && typeof s.site_code === "string" && Array.isArray((s as TrendEntrySite).categories),
  );
}

/** Seed the memory copy from storage. Safe to call often; reads storage once per user. */
export async function loadTrendSites(userId?: string | null): Promise<TrendEntrySite[]> {
  const id = normalize(userId);
  if (!id) return [];
  if (snapshot.userId === id && snapshot.loaded) return snapshot.sites;
  const startedIn = generation;
  let sites: TrendEntrySite[] = [];
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + id);
    sites = raw ? parseSites(JSON.parse(raw)) : [];
  } catch {
    sites = [];
  }
  // Signed out while storage was being read: leave the reset list alone.
  if (startedIn !== generation) return [];
  // A refresh that finished while storage was being read wins.
  if (snapshot.userId === id && snapshot.loaded) return snapshot.sites;
  publish({ userId: id, sites, loaded: true });
  return sites;
}

/**
 * Ask the server for the list and cache it. A 403 means the role has no trend
 * sheet entry, which is a real answer: the list becomes empty. A network or
 * server failure keeps whatever is cached and says so (`fresh: false`), so the
 * sync engine tries again on its next pass instead of waiting out the TTL.
 */
export async function refreshTrendSites(
  userId?: string | null,
): Promise<{ sites: TrendEntrySite[]; fresh: boolean }> {
  const id = normalize(userId);
  if (!id) return { sites: [], fresh: false };
  const startedIn = generation;
  const store = (sites: TrendEntrySite[]): { sites: TrendEntrySite[]; fresh: boolean } => {
    // Signed out while the request was out: its answer is not for anyone now.
    if (startedIn !== generation) return { sites: [], fresh: false };
    publish({ userId: id, sites, loaded: true });
    AsyncStorage.setItem(CACHE_PREFIX + id, JSON.stringify(sites)).catch(() => {});
    return { sites, fresh: true };
  };
  await loadTrendSites(id);
  // The role is known not to enter readings: the server would answer 403.
  if (entryViewable === false) return store([]);
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/trend-sheet/entry/sites`);
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.success && Array.isArray(body.data)) return store(parseSites(body.data));
    } else if (res.status === 403) {
      return store([]);
    } else {
      logger.warn("TrendSheetSites: site list request failed", {
        module: "TREND_SHEET",
        status: res.status,
      });
    }
  } catch (error) {
    logger.warn("TrendSheetSites: site list fetch failed", { module: "TREND_SHEET", error });
  }
  return { sites: snapshot.userId === id ? snapshot.sites : [], fresh: false };
}

/** The site's entry, from memory. Null when it is not a trend sheet site for this user. */
export function getTrendSite(siteCode: string | null | undefined): TrendEntrySite | null {
  if (!siteCode) return null;
  return snapshot.sites.find((s) => s.site_code === siteCode) ?? null;
}

/** AC-40: the site is in the user's list and has at least one entry category. */
export function isTrendSite(siteCode: string | null | undefined): boolean {
  const site = getTrendSite(siteCode);
  return !!site && site.categories.length > 0;
}

/** The trend sheet site codes in memory (for the pull, which runs outside React). */
export function trendSiteCodes(): string[] {
  return snapshot.sites.filter((s) => s.categories.length > 0).map((s) => s.site_code);
}

export function subscribeTrendSites(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Drop the memory copy (sign-out). Storage is cleared by the sign-out wipe itself. */
export function resetTrendSites(): void {
  generation += 1;
  publish({ userId: "", sites: [], loaded: false });
}

/**
 * The list for this user, re-rendering when it changes. Seeds from the cache;
 * the sync engine's `trend_sheet` pull keeps it fresh.
 */
export function useTrendSites(userId?: string | null): { sites: TrendEntrySite[]; loaded: boolean } {
  const id = normalize(userId);
  const [, bump] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeTrendSites(() => bump((n) => n + 1));
    if (id) void loadTrendSites(id);
    return unsubscribe;
  }, [id]);

  const mine = !!id && snapshot.userId === id;
  return { sites: mine ? snapshot.sites : [], loaded: mine && snapshot.loaded };
}
