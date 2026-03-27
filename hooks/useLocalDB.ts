/**
 * useLocalDB — simple local database queries
 *
 * Runs a Drizzle query against the local SQLite DB.
 * Re-runs when deps change.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export function useLocalDB<T>(
  query: () => Promise<T[]>,
  deps: any[] = [],
): { data: T[]; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    try {
      const result = await query();
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    run();
    return () => { mountedRef.current = false; };
  }, [run]);

  return { data, loading, reload: run };
}
