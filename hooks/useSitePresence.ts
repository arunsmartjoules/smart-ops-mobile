/**
 * Where the user physically is, for the Home attendance card.
 *
 * Resolved from GPS against the user's own site coordinates — deliberately NOT
 * from the dashboard's site filter, which is a reporting scope, not a place.
 * WFH users short-circuit: their work location is not a geofence.
 *
 * This is a passive read: it never prompts for permission (the punch-in flow
 * owns that ask) and prefers the OS's last known fix, so opening Home does not
 * spin up the GPS radio.
 */
import { useEffect, useState } from "react";
import * as Location from "expo-location";

import type { PresenceState } from "@/components/home/RoleDashboardUI";
import type { Site } from "@/services/AttendanceService";
import { logger } from "@/utils/logger";

/** Matches the backend geofence default in `geofenceUtils.computeSitesWithDistance`. */
const DEFAULT_RADIUS_M = 200;
/** A fix older than this is refreshed rather than trusted. */
const MAX_FIX_AGE_MS = 5 * 60 * 1000;

/** Great-circle metres — the same haversine the backend geofence uses. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWfhUser(workLocationType?: string | null): boolean {
  // "WHF" is a live typo in some user rows; both spellings mean the same thing.
  const v = String(workLocationType || "").trim().toUpperCase();
  return v === "WFH" || v === "WHF";
}

export function useSitePresence({
  isWfh,
  sites,
  siteCode,
  refreshKey = 0,
}: {
  isWfh: boolean;
  /** The user's assigned sites; only those carrying coordinates are testable. */
  sites: Site[];
  /** Punched-in site, when there is one — it alone decides "on site" then. */
  siteCode?: string | null;
  /** Bump to re-read the location (pull-to-refresh, punch in/out). */
  refreshKey?: number;
}): PresenceState {
  const [state, setState] = useState<PresenceState>(isWfh ? "wfh" : "checking");

  useEffect(() => {
    if (isWfh) {
      setState("wfh");
      return;
    }

    // Once punched in, only that site counts; before that, any assigned site
    // in range means they are standing somewhere they could start the day.
    const candidates = (siteCode ? sites.filter((x) => x.site_code === siteCode) : sites).filter(
      (x) => x.latitude != null && x.longitude != null,
    );
    if (candidates.length === 0) {
      setState("unknown");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        // Never prompt from here — the punch CTA is where that ask belongs.
        if (!perm.granted) {
          setState("unknown");
          return;
        }

        const fix =
          (await Location.getLastKnownPositionAsync({ maxAge: MAX_FIX_AGE_MS })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (cancelled) return;
        if (!fix) {
          setState("unknown");
          return;
        }

        const onSite = candidates.some((site) => {
          const d = distanceMeters(
            fix.coords.latitude,
            fix.coords.longitude,
            Number(site.latitude),
            Number(site.longitude),
          );
          return d <= (site.radius || DEFAULT_RADIUS_M);
        });
        setState(onSite ? "on-site" : "away");
      } catch (error) {
        if (cancelled) return;
        logger.warn("Presence lookup failed", { module: "HOME_PRESENCE", error });
        setState("unknown");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isWfh, sites, siteCode, refreshKey]);

  return state;
}
