/**
 * useSyncStatus — subscribes to the SyncEngine singleton and returns the
 * current SyncStatus, updated reactively on every change.
 *
 * Requirements: 7.1, 7.2
 */

import { useState, useEffect } from "react";
import syncEngine, { type SyncStatus } from "@/services/SyncEngine";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(syncEngine.status);

  useEffect(() => {
    // subscribe calls the listener immediately with current status (Req 7.2),
    // and returns an unsubscribe function for cleanup.
    const unsubscribe = syncEngine.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}
