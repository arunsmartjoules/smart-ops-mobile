/**
 * App-wide selected site.
 *
 * One selection per user, shared by every screen: picking a site on Tickets
 * moves Home, Incidents, Logs, PM and Assets with it. Tabs stay mounted, so a
 * value read once from AsyncStorage on mount would go stale — every consumer
 * subscribes here instead and is told about each change as it happens.
 *
 * Persisted under `last_site_{userId}` (normalised to trimmed lowercase) so
 * the choice survives an app restart. The in-memory copy is authoritative
 * once set; AsyncStorage is only read to seed it.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Listener = (identity: string, siteCode: string) => void;

const memory = new Map<string, string>();
const listeners = new Set<Listener>();

const normalize = (userId?: string | null) => (userId || "").trim().toLowerCase();

const storageKey = (identity: string) => `last_site_${identity}`;

/** Selected site code for this user, if one is known (memory, then storage). */
export async function getSelectedSiteCode(userId?: string | null): Promise<string | null> {
  const identity = normalize(userId);
  if (!identity) return null;
  const cached = memory.get(identity);
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(storageKey(identity));
    // A selection made while we were awaiting storage wins over the stored one.
    if (stored && !memory.has(identity)) memory.set(identity, stored);
    return memory.get(identity) ?? null;
  } catch {
    return null;
  }
}

/** Make `siteCode` the selected site everywhere, and remember it. */
export async function setSelectedSiteCode(
  userId: string | null | undefined,
  siteCode: string,
): Promise<void> {
  const identity = normalize(userId);
  if (!identity || !siteCode) return;
  if (memory.get(identity) !== siteCode) {
    memory.set(identity, siteCode);
    listeners.forEach((fn) => fn(identity, siteCode));
  }
  try {
    await AsyncStorage.setItem(storageKey(identity), siteCode);
  } catch {
    // non-fatal — selection still applied in memory
  }
}

/** Called with (normalised user id, site code) on every selection change. */
export function subscribeSelectedSite(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const normalizeSiteIdentity = normalize;

/**
 * `[siteCode, setSiteCode]` bound to the shared selection — a drop-in for a
 * screen's local `useState` of the selected site code.
 */
export function useSelectedSiteCode(
  userId: string | null | undefined,
): [string | null, (siteCode: string) => void] {
  const identity = normalize(userId);
  const [siteCode, setSiteCode] = useState<string | null>(
    () => (identity ? memory.get(identity) ?? null : null),
  );

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    getSelectedSiteCode(identity).then((code) => {
      if (!cancelled && code) setSiteCode(code);
    });
    const unsubscribe = subscribeSelectedSite((who, code) => {
      if (who === identity) setSiteCode(code);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [identity]);

  const select = useCallback(
    (code: string) => {
      setSiteCode(code);
      void setSelectedSiteCode(identity, code);
    },
    [identity],
  );

  return [siteCode, select];
}
