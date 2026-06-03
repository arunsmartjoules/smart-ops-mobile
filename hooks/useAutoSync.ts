import { useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus, InteractionManager } from "react-native";
import { useFocusEffect } from "expo-router";

interface AutoSyncOptions {
  interval?: number; // Polling interval in ms (default: 60s)
  throttle?: number; // Minimum time between syncs in ms (default: 15s)
  enabled?: boolean; // Whether sync is enabled (default: true)
  /** When false, tab focus does not call onSync (interval + app foreground still apply). */
  syncOnFocus?: boolean;
}

/**
 * Custom hook to handle automatic data synchronization across app screens.
 * Triggers on:
 * 1. Screen focus (navigation)
 * 2. App foreground (returning from another app)
 * 3. Periodic polling (while screen is focused and app is active)
 * 
 * @param onSync - The function to call for synchronization
 * @param dependencies - Array of dependencies (e.g., [siteCode, user.id, fromDate])
 * @param options - Configuration options
 */
export function useAutoSync(
  onSync: () => void | Promise<void>,
  dependencies: any[] = [],
  options: AutoSyncOptions = {}
) {
  const { interval = 60000, throttle = 15000, enabled = true, syncOnFocus = true } = options;
  const lastSyncRef = useRef<number>(0);
  const syncRef = useRef(onSync);
  const isFocusedRef = useRef(false);

  // Consider all dependencies to be "ready" if none are null or undefined
  const isReady = dependencies.length === 0 || dependencies.every(d => d !== null && d !== undefined);
  useEffect(() => {
    syncRef.current = onSync;
  }, [onSync]);

  const triggerSync = useCallback((force = false) => {
    if (!enabled || !isReady) return;
    
    // Only Sync if it's the first time OR enough time has passed (throttle)
    const now = Date.now();
    if (force || now - lastSyncRef.current > throttle) {
      lastSyncRef.current = now;
      syncRef.current();
    }
  }, [enabled, isReady, throttle]);

  // 1. Sync on Screen Focus (Always Force on Focus)
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      // Defer the forced refresh until the tab-switch transition has settled.
      // The fetch + its setState re-renders would otherwise run on the same
      // frame the new tab is trying to paint, which reads as jank. The screen
      // is already showing cached data; refreshing one interaction-tick later
      // is invisible to the user but keeps the switch smooth.
      let handle: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
      if (syncOnFocus) {
        handle = InteractionManager.runAfterInteractions(() => {
          if (isFocusedRef.current) triggerSync(true); // Force sync to ensure fresh data
        });
      }
      return () => {
        isFocusedRef.current = false;
        handle?.cancel?.();
      };
    }, [triggerSync, syncOnFocus])
  );

  // 2. Sync on App States (Foregrounded)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      // Refresh ONLY if we are returning to the foreground AND the screen is currently focused
      if (nextAppState === "active" && isFocusedRef.current) {
        triggerSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [triggerSync]);

  // 3. Periodic Polling
  useEffect(() => {
    if (!enabled || !isReady) return;

    const timer = setInterval(() => {
      // Poll ONLY if the screen is focused and the app is in the foreground
      if (isFocusedRef.current && AppState.currentState === "active") {
        triggerSync();
      }
    }, interval);

    return () => {
      clearInterval(timer);
    };
  }, [enabled, isReady, interval, triggerSync]);
}
