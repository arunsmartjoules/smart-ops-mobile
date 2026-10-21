/**
 * Lets a tab screen take over the whole screen (e.g. the SLA drill-down,
 * which the artboard draws without the floating bar). Mount
 * `useHideTabBar(true)` while that view is showing; the bar returns when the
 * last hider unmounts or passes false.
 */
import { useEffect, useSyncExternalStore } from "react";

let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const snapshot = () => hiders > 0;

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useHideTabBar(hidden: boolean) {
  useEffect(() => {
    if (!hidden) return;
    hiders += 1;
    emit();
    return () => {
      hiders -= 1;
      emit();
    };
  }, [hidden]);
}
