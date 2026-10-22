/**
 * Keeps the launch splash (components/SplashOverlay) up until the first real
 * screen has landed, instead of showing a "Loading your sites…" screen and a
 * skeleton in between.
 *
 * Screens that are still fetching what they need for their first paint hold
 * the splash with `useLaunchHold(key, active)`; the root layout waits until no
 * holds remain (with a cap — see app/_layout.tsx). Holds only matter while the
 * launch splash is on screen; later they are harmless no-ops.
 */
import { useLayoutEffect, useSyncExternalStore } from "react";

const holds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isHeld = () => holds.size > 0;

/** True while any screen still holds the launch splash. */
export function useLaunchHeld(): boolean {
  return useSyncExternalStore(subscribe, isHeld, isHeld);
}

/**
 * Hold the launch splash while `active`. Layout effect, so the hold is in
 * place before the first frame of the screen is painted.
 */
export function useLaunchHold(key: string, active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    holds.add(key);
    emit();
    return () => {
      holds.delete(key);
      emit();
    };
  }, [key, active]);
}
