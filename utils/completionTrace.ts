import logger from "./logger";

/**
 * Step-by-step timing for "Complete & sign", to find where completions stall
 * ("button frozen, no response" — Oct 2026). Steps are kept in memory and only
 * reported when something went wrong: the completion is still unfinished
 * after SLOW_MS, finished slower than that, timed out, or failed. A normal
 * completion writes nothing, so activity_logs isn't flooded.
 */
const SLOW_MS = 5_000;

type Step = { step: string; at_ms: number; [extra: string]: unknown };

export interface CompletionTrace {
  step(name: string, extra?: Record<string, unknown>): void;
  /** Mark the completion settled; `outcome` other than "ok" is always reported. */
  finish(outcome: "ok" | "timeout" | "error", extra?: Record<string, unknown>): void;
}

export function startCompletionTrace(
  module: "CHILLER_READING" | "SITE_LOG" | "PM",
  context: Record<string, unknown> = {},
): CompletionTrace {
  const startedAt = Date.now();
  const steps: Step[] = [];
  let finished = false;
  let reported = false;
  let timedOut = false;
  let lateReported = false;

  const report = (reason: string, extra?: Record<string, unknown>) => {
    reported = true;
    logger.activity("COMPLETE_TRACE", module, `Completion ${reason}`, {
      ...context,
      ...extra,
      reason,
      elapsed_ms: Date.now() - startedAt,
      last_step: steps[steps.length - 1]?.step ?? null,
      steps,
    });
  };

  // Still running after SLOW_MS: report what was reached so far — this is the
  // record that survives if the app is killed while frozen.
  const slowTimer = setTimeout(() => {
    if (!finished) report("still_running");
  }, SLOW_MS);

  return {
    step(name, extra) {
      if (finished) return;
      steps.push({ step: name, at_ms: Date.now() - startedAt, ...extra });
    },
    finish(outcome, extra) {
      if (finished) {
        // A save the watchdog gave up on that completes anyway — tells us how
        // long the real stall was and that the data did get saved.
        if (timedOut && outcome === "ok" && !lateReported) {
          lateReported = true;
          report("finished_after_timeout", extra);
        }
        return;
      }
      finished = true;
      timedOut = outcome === "timeout";
      clearTimeout(slowTimer);
      const slow = Date.now() - startedAt > SLOW_MS;
      if (outcome !== "ok") report(outcome, extra);
      else if (slow || reported) report("finished_slow", extra);
    },
  };
}
