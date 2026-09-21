import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Goes true once the screen has sat untouched for `delayMs`, so a primary
 * action can nudge an operator who is looking at the list without realising
 * the next step is theirs to start.
 *
 * Any interaction calls `bump()` to reset the wait. This is a single timer and
 * one state flip — no polling, nothing per-frame.
 *
 * `enabled` is for "there is nothing to nudge towards right now" (a sheet is
 * open, the screen is still loading, the button is hidden). It gates the
 * result as well as the timer, so flipping it off hides an already-armed
 * nudge immediately.
 */
export function useIdleNudge(delayMs = 6000, enabled = true) {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setIdle(true), delayMs);
  }, [clear, delayMs]);

  /** Call from any interaction handler — restarts the wait from zero. */
  const bump = useCallback(() => {
    setIdle(false);
    arm();
  }, [arm]);

  useEffect(() => {
    if (!enabled) {
      clear();
      return;
    }
    // arm() only schedules — deliberately no setState in the effect body.
    arm();
    return clear;
  }, [enabled, arm, clear]);

  return { nudge: enabled && idle, bump };
}

export default useIdleNudge;
