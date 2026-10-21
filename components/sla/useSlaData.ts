/**
 * Summary + drill-down loaders for the SLA screen.
 *
 * Summaries are cached in memory per `site|month`, because the page fans out
 * across months (trend) and sites (Compare) and every view reads the same
 * entries. Each key carries a generation number so a slow response from an
 * earlier request never overwrites a newer one (pull-to-refresh while a load is
 * still in flight). Entries are namespaced by user, so a different signed-in
 * user on a shared device never sees the previous user's numbers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SlaService, { type SlaDrillDown, type SlaReport } from "@/services/SlaService";

export interface SummaryEntry {
  loading: boolean;
  data: SlaReport | null;
  fromCache: boolean;
  error: string | null;
  /** 403 — month before the non-admin cutoff, or no permission for the module. */
  forbidden: boolean;
}

export const summaryKey = (site: string, month: string) => `${site}|${month}`;

export function useSlaSummaries(userId: string) {
  /** Keyed `${userId}#${site}|${month}`. */
  const [store, setStore] = useState<Record<string, SummaryEntry>>({});
  const genRef = useRef<Record<string, number>>({});
  const prefix = `${userId}#`;

  const entries = useMemo(() => {
    const out: Record<string, SummaryEntry> = {};
    for (const k of Object.keys(store)) {
      if (k.startsWith(prefix)) out[k.slice(prefix.length)] = store[k]!;
    }
    return out;
  }, [store, prefix]);

  const loadOne = useCallback(
    async (key: string): Promise<void> => {
      if (!userId) return;
      const full = `${userId}#${key}`;
      const sep = key.indexOf("|");
      const site = key.slice(0, sep);
      const month = key.slice(sep + 1);
      const gen = (genRef.current[full] ?? 0) + 1;
      genRef.current[full] = gen;
      setStore((prev) => {
        const cur = prev[full];
        return {
          ...prev,
          [full]: {
            loading: true,
            data: cur?.data ?? null,
            fromCache: cur?.fromCache ?? false,
            error: null,
            forbidden: false,
          },
        };
      });
      const res = await SlaService.getSummary(userId, site, month);
      if (genRef.current[full] !== gen) return;
      setStore((prev) => ({
        ...prev,
        [full]: res.success
          ? { loading: false, data: res.data, fromCache: !!res.isFromCache, error: null, forbidden: false }
          : {
              loading: false,
              // Keep the last good numbers on a transient failure, but never
              // on a 403 — access was withdrawn.
              data: res.status === 403 ? null : (prev[full]?.data ?? null),
              fromCache: prev[full]?.fromCache ?? false,
              error: res.error,
              forbidden: res.status === 403,
            },
      }));
    },
    [userId],
  );

  /** Load every key not requested yet (or all of them when `force`). */
  const ensure = useCallback(
    (keys: string[], force = false): Promise<void> => {
      // A key is requested once; failures wait for an explicit retry/refresh.
      const todo = force ? keys : keys.filter((k) => genRef.current[`${userId}#${k}`] === undefined);
      // Mark as requested now so a re-render before the state update lands
      // doesn't start the same request twice.
      todo.forEach((k) => {
        const full = `${userId}#${k}`;
        if (genRef.current[full] === undefined) genRef.current[full] = 0;
      });
      return Promise.all(todo.map(loadOne)).then(() => undefined);
    },
    [loadOne, userId],
  );

  const retry = useCallback((key: string) => loadOne(key), [loadOne]);

  return { entries, ensure, retry };
}

export interface DrillState {
  loading: boolean;
  data: SlaDrillDown | null;
  fromCache: boolean;
  error: string | null;
}

interface DrillResult extends Omit<DrillState, "loading"> {
  key: string;
  tick: number;
}

/** One deliverable's drill-down; re-fetches whenever site, month or key changes. */
export function useSlaDrill(
  userId: string,
  siteCode: string | null,
  month: string,
  deliverableKey: string | null,
): DrillState & { reload: () => void } {
  const reqKey = siteCode && deliverableKey && userId ? `${userId}|${siteCode}|${month}|${deliverableKey}` : null;
  const [result, setResult] = useState<DrillResult | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!reqKey || !siteCode || !deliverableKey) return;
    let cancelled = false;
    SlaService.getDrilldown(userId, siteCode, month, deliverableKey).then((res) => {
      if (cancelled) return;
      setResult(
        res.success
          ? { key: reqKey, tick, data: res.data, fromCache: !!res.isFromCache, error: null }
          : { key: reqKey, tick, data: null, fromCache: false, error: res.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [reqKey, siteCode, month, deliverableKey, userId, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  // Loading = no answer yet for this exact request (a reload keeps showing
  // the previous answer for the same key until the new one lands).
  const sameKey = !!result && result.key === reqKey;
  return {
    loading: !!reqKey && !(sameKey && result!.tick === tick),
    data: sameKey ? result!.data : null,
    fromCache: sameKey ? result!.fromCache : false,
    error: sameKey ? result!.error : null,
    reload,
  };
}
