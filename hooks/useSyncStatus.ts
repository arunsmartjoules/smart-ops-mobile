import { useState, useEffect } from "react";
import { syncManager, type SyncStatus } from "@/services/SyncManager";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(syncManager.status);

  useEffect(() => {
    const unsub = syncManager.subscribe(setStatus);
    return unsub;
  }, []);

  return status;
}
