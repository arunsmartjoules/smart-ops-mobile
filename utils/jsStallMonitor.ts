import { AppState, type AppStateStatus } from "react-native";
import logger from "./logger";

/**
 * Detects the JS thread being blocked — the state in which a tap on
 * "Complete & sign" does nothing. A 1s heartbeat that arrives late by more
 * than STALL_MS means the thread was busy that long; the stall is reported
 * once the thread is free again, with whatever context the caller supplies
 * (screen, sync step).
 *
 * Android pauses JS timers while the app is in the background, so a late
 * heartbeat after the operator locked the phone is NOT a stall. The first
 * version counted those (reports of "blocked for 49 minutes", 28 Oct); any
 * interval during which the app was not active is now discarded.
 */
const TICK_MS = 1_000;
const STALL_MS = 3_000;
/** At most one report per minute; stalls in between are counted into it. */
const REPORT_EVERY_MS = 60_000;

export function startJsStallMonitor(
  getContext: () => Record<string, unknown>,
  now: () => number = Date.now,
  appState: Pick<typeof AppState, "currentState" | "addEventListener"> = AppState,
): () => void {
  let last = now();
  let lastReportAt = -Infinity;
  let unreported = 0;
  // Set whenever the app leaves the foreground; cleared by the next tick.
  let wasInactive = appState.currentState !== "active";

  const sub = appState.addEventListener("change", (state: AppStateStatus) => {
    if (state !== "active") wasInactive = true;
  });

  const timer = setInterval(() => {
    const t = now();
    const blockedMs = t - last - TICK_MS;
    last = t;
    if (wasInactive) {
      // Timers were paused, not the thread. Start measuring again from here.
      wasInactive = appState.currentState !== "active";
      return;
    }
    if (blockedMs < STALL_MS) return;

    unreported += 1;
    if (t - lastReportAt < REPORT_EVERY_MS) return;
    lastReportAt = t;
    logger.activity("JS_STALL", "APP", `JS thread blocked for ${Math.round(blockedMs / 1000)}s`, {
      ...getContext(),
      blocked_ms: blockedMs,
      stalls_since_last_report: unreported,
    });
    unreported = 0;
  }, TICK_MS);

  return () => {
    clearInterval(timer);
    sub.remove();
  };
}
