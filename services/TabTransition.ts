/**
 * Which kind of tab switch is in flight, so the tabs navigator can animate
 * them differently (like Google / Material apps):
 *
 *  - "sub"  — a sub-tab inside Ops or Resources: horizontal slide
 *  - "main" — anything else (bottom bar, links between sections): fade-through
 *
 * The scene interpolator is evaluated when the navigator re-renders for the
 * new route, so the flag is set just BEFORE navigating and falls back to
 * "main" once the transition has had time to finish.
 */
export type TabTransitionKind = "main" | "sub";

let kind: TabTransitionKind = "main";
let resetTimer: ReturnType<typeof setTimeout> | null = null;

export function getTabTransition(): TabTransitionKind {
  return kind;
}

/** Mark the next tab switch as a sub-tab move. */
export function markSubTabSwitch() {
  kind = "sub";
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    kind = "main";
    resetTimer = null;
  }, 600);
}
